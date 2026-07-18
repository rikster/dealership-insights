import { END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import {
  AnswerSchema,
  AuthorisedScopeSchema,
  ExecutionPlanSchema,
  InterpretedQuestionSchema,
  PublicResponseSchema,
  QueryRequestSchema,
  SourceResultSchema,
  type Answer,
  type Evidence,
  type Fact,
  type Metric,
  type PublicResponse,
  type QueryRequest,
  type SourceResult,
  type Validation,
} from "@autograb/contracts";
import type { AutoGrabRepository, CatalogueRow, InventoryRow, ValuationRow } from "@autograb/db";
import {
  authoriseScope,
  buildApprovedPlan,
  calculateMarketPricing,
  calculateRegionalModelAgeing,
  calculateStockAgeing,
  deterministicAnswer,
  domainConfig,
  failedSource,
  readCatalogue,
  readInventory,
  readValuations,
  validateAnswerEvidence,
  validateFacts as runFactValidation,
  type DomainConfig,
} from "@autograb/domain";
import { createModelGateway, type ModelGateway } from "./model.js";

const GraphStateSchema = z.object({
  request: QueryRequestSchema,
  requestId: z.string().uuid(),
  signal: z.custom<AbortSignal>(),
  startedAtMs: z.number().optional(),
  deadlineAtMs: z.number().optional(),
  plannerAttemptsUsed: z.number().int().default(0),
  sourceCallsUsed: z.number().int().default(0),
  interpretation: InterpretedQuestionSchema.nullable().default(null),
  scope: AuthorisedScopeSchema.nullable().default(null),
  plan: ExecutionPlanSchema.nullable().default(null),
  inventoryRows: z.array(z.custom<InventoryRow>()).default([]),
  valuationRows: z.array(z.custom<ValuationRow>()).default([]),
  catalogueRows: z.array(z.custom<CatalogueRow>()).default([]),
  sources: z.array(SourceResultSchema).default([]),
  metrics: z.array(z.custom<Metric>()).default([]),
  facts: z.array(z.custom<Fact>()).default([]),
  evidence: z.array(z.custom<Evidence>()).default([]),
  caveats: z.array(z.string()).default([]),
  validation: z.custom<Validation>().optional(),
  answer: AnswerSchema.nullable().default(null),
  status: z.enum(["answered", "needs_clarification", "refused", "failed"]).optional(),
  message: z.string().optional(),
  refusalReason: z.string().optional(),
  timings: z.record(z.string(), z.number()).default({}),
  response: PublicResponseSchema.optional(),
});
export type GraphState = z.infer<typeof GraphStateSchema>;

export interface OrchestratorOptions {
  model?: ModelGateway;
  config?: DomainConfig;
  now?: () => Date;
  requestTimeoutMs?: number;
}

function required<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) throw new Error(`Graph state missing ${name}`);
  return value;
}

function ensureActive(state: GraphState, now: () => Date): void {
  if (state.signal.aborted) throw state.signal.reason ?? new Error("Request aborted");
  if (now().getTime() >= required(state.deadlineAtMs, "deadline")) throw new Error("Request deadline exceeded");
}

async function timed<T>(state: GraphState, name: string, work: () => Promise<T>, now: () => Date): Promise<{ value: T; timings: Record<string, number> }> {
  const start = now().getTime();
  const value = await work();
  return { value, timings: { ...state.timings, [name]: Math.max(0, now().getTime() - start) } };
}

export const GRAPH_MERMAID = `flowchart TD
  start((START)) --> initialiseRequest --> interpretQuestion
  interpretQuestion -->|ambiguous| needsClarification --> finalise
  interpretQuestion -->|unsupported/invalid| refuse --> finalise
  interpretQuestion --> resolveAndAuthoriseScope
  resolveAndAuthoriseScope -->|forbidden| refuse
  resolveAndAuthoriseScope --> buildExecutionPlan --> executeSources
  executeSources -->|unsafe required source| refuse
  executeSources --> calculateFacts --> validateFacts
  validateFacts -->|unsafe| refuse
  validateFacts --> composeAnswer --> validateAnswer --> finalise --> end((END))`;

export class BoundedOrchestrator {
  private readonly model: ModelGateway;
  private readonly config: DomainConfig;
  private readonly now: () => Date;
  private readonly requestTimeoutMs: number;
  private readonly graph: ReturnType<typeof this.buildGraph>;

  constructor(private readonly repository: AutoGrabRepository, options: OrchestratorOptions = {}) {
    this.model = options.model ?? createModelGateway();
    this.config = options.config ?? domainConfig();
    this.now = options.now ?? (() => new Date());
    this.requestTimeoutMs = options.requestTimeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS ?? 8_000);
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const initialiseRequest = async (_state: GraphState) => ({
      startedAtMs: this.now().getTime(),
      deadlineAtMs: this.now().getTime() + this.requestTimeoutMs,
      plannerAttemptsUsed: 0,
      sourceCallsUsed: 0,
      interpretation: null,
      scope: null,
      plan: null,
      inventoryRows: [], valuationRows: [], catalogueRows: [], sources: [], metrics: [], facts: [], evidence: [], caveats: [], answer: null, timings: {},
    });

    const interpretQuestion = async (state: GraphState) => {
      ensureActive(state, this.now);
      const result = await timed(state, "planner", async () => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            return { interpretation: await this.model.interpret(state.request.question, state.signal), attempts: attempt };
          } catch (error) { lastError = error; }
        }
        throw lastError ?? new Error("Planner failed");
      }, this.now).catch((error: unknown) => ({ value: { interpretation: null, attempts: 2, error }, timings: { ...state.timings, planner: 0 } }));
      if (!result.value.interpretation) return { plannerAttemptsUsed: result.value.attempts, refusalReason: "The structured planner could not safely interpret this question after two attempts.", timings: result.timings };
      return { plannerAttemptsUsed: result.value.attempts, interpretation: result.value.interpretation, timings: result.timings };
    };

    const resolveAndAuthoriseScope = async (state: GraphState) => {
      ensureActive(state, this.now);
      const interpretation = required(state.interpretation, "interpretation");
      const result = await timed(state, "authorisation", async () => {
        const principal = await this.repository.getPrincipal(state.request.principalId);
        if (!principal) return { reason: "The selected simulated identity does not exist or is inactive." };
        if (interpretation.scopeType === "unspecified" || !interpretation.scopeTerm) return { reason: "A dealership or region scope is required." };
        const resolved = await this.repository.resolveScope(interpretation.scopeTerm, interpretation.scopeType);
        if (!resolved) return { reason: `Could not resolve the requested ${interpretation.scopeType} '${interpretation.scopeTerm}'.` };
        const decision = authoriseScope(principal, resolved, state.request.scenario);
        if ("reason" in decision) return { reason: decision.reason };
        return { scope: decision.scope };
      }, this.now);
      return result.value.scope ? { scope: result.value.scope, timings: result.timings } : { refusalReason: result.value.reason, timings: result.timings };
    };

    const buildExecutionPlan = async (state: GraphState) => ({ plan: buildApprovedPlan(required(state.interpretation, "interpretation")) });

    const executeSources = async (state: GraphState) => {
      ensureActive(state, this.now);
      const scope = required(state.scope, "scope");
      const plan = required(state.plan, "plan");
      const started = this.now().getTime();
      const sources: SourceResult[] = [];
      let inventoryRows: InventoryRow[] = [];
      let valuationRows: ValuationRow[] = [];
      let catalogueRows: CatalogueRow[] = [];
      const immediateSteps = plan.steps.filter((step) => step.mode === "parallel");
      if (state.sourceCallsUsed + immediateSteps.length > this.config.maxSourceCalls) throw new Error("Source-call budget exceeded");
      const settled = await Promise.allSettled(immediateSteps.map(async (step) => {
        if (step.source === "inventory") return { source: step.source, result: await readInventory(this.repository, scope, state.request.scenario, state.signal, this.now(), this.config) };
        if (step.source === "valuation") return { source: step.source, result: await readValuations(this.repository, scope, state.request.scenario, state.signal, this.now(), this.config) };
        throw new Error("Catalogue cannot be an immediate source");
      }));
      settled.forEach((result, index) => {
        const step = immediateSteps[index]!;
        if (result.status === "rejected") sources.push(failedSource(step.source, step.required, result.reason, this.now(), this.config));
        else if (result.value.source === "inventory") { inventoryRows = result.value.result.rows as InventoryRow[]; sources.push(result.value.result.meta); }
        else { valuationRows = result.value.result.rows as ValuationRow[]; sources.push(result.value.result.meta); }
      });
      let sourceCallsUsed = state.sourceCallsUsed + immediateSteps.length;
      let validation = runFactValidation([], [], [], sources);
      if (!validation.passed) {
        return {
          inventoryRows, valuationRows, catalogueRows, sources, sourceCallsUsed, validation,
          timings: { ...state.timings, sources: Math.max(0, this.now().getTime() - started) },
        };
      }
      const catalogueStep = plan.steps.find((step) => step.source === "catalogue");
      if (catalogueStep && sources.find((source) => source.source === "inventory" && !source.error)) {
        if (sourceCallsUsed + 1 > this.config.maxSourceCalls) throw new Error("Source-call budget exceeded");
        sourceCallsUsed += 1;
        try {
          const result = await readCatalogue(this.repository, scope, inventoryRows.map((row) => row.vehicleId), state.request.scenario, state.signal, this.now(), this.config);
          catalogueRows = result.rows; sources.push(result.meta);
        } catch (error) { sources.push(failedSource("catalogue", catalogueStep.required, error, this.now(), this.config)); }
      }
      validation = runFactValidation([], [], [], sources);
      return { inventoryRows, valuationRows, catalogueRows, sources, sourceCallsUsed, validation, timings: { ...state.timings, sources: Math.max(0, this.now().getTime() - started) } };
    };

    const calculateFacts = async (state: GraphState) => {
      ensureActive(state, this.now);
      const started = this.now().getTime();
      const interpretation = required(state.interpretation, "interpretation");
      const output = interpretation.intent === "stock_ageing"
        ? calculateStockAgeing(state.inventoryRows, interpretation, state.sources, this.now())
        : interpretation.intent === "market_pricing"
          ? calculateMarketPricing(state.inventoryRows, state.valuationRows, interpretation, state.sources)
          : calculateRegionalModelAgeing(state.inventoryRows, state.catalogueRows, interpretation, state.sources, this.now());
      return { ...output, timings: { ...state.timings, analytics: Math.max(0, this.now().getTime() - started) } };
    };

    const validateFacts = async (state: GraphState) => ({ validation: runFactValidation(state.metrics, state.facts, state.evidence, state.sources) });

    const composeAnswer = async (state: GraphState) => {
      ensureActive(state, this.now);
      const started = this.now().getTime();
      const scope = required(state.scope, "scope");
      let answer: Answer;
      let caveats = state.caveats;
      try {
        answer = await this.model.compose({ scope, facts: state.facts, evidence: state.evidence, sources: state.sources, caveats, safeToAnswer: true }, state.signal);
      } catch {
        caveats = [...caveats, "Answer model was unavailable; deterministic renderer used."];
        answer = deterministicAnswer(scope, state.facts, state.sources, caveats);
      }
      return { answer, caveats, timings: { ...state.timings, answer: Math.max(0, this.now().getTime() - started) } };
    };

    const validateAnswer = async (state: GraphState) => {
      const scope = required(state.scope, "scope");
      const answer = required(state.answer, "answer");
      if (validateAnswerEvidence(answer, state.evidence)) return { status: "answered" as const };
      return { status: "answered" as const, answer: deterministicAnswer(scope, state.facts, state.sources, [...state.caveats, "Generated answer contained an unknown evidence ID; deterministic renderer used."]) };
    };

    const needsClarification = async (state: GraphState) => ({
      status: "needs_clarification" as const,
      message: state.interpretation?.clarificationQuestion ?? "Please clarify the requested scope or threshold.",
      validation: { passed: false, checks: [{ name: "clarification", passed: false, detail: "Source execution was skipped pending clarification" }], refusalReason: "Clarification required" },
    });

    const refuse = async (state: GraphState) => {
      const reason = state.refusalReason ?? state.validation?.refusalReason ?? (state.interpretation?.intent === "unsupported"
        ? "This POC cannot answer sales conversion, revenue, leads, CRM outcomes, or other unsupported questions because those sources are absent."
        : "The request cannot be answered safely.");
      return {
        status: "refused" as const, message: reason, answer: null,
        validation: state.validation ?? { passed: false, checks: [{ name: "policy", passed: false, detail: reason }], refusalReason: reason },
      };
    };

    const finalise = async (state: GraphState) => {
      const total = Math.max(0, this.now().getTime() - required(state.startedAtMs, "start time"));
      const response = PublicResponseSchema.parse({
        requestId: state.requestId,
        status: state.status ?? "failed",
        answer: state.answer,
        ...(state.message ? { message: state.message } : {}),
        resolvedScope: state.scope,
        interpretation: state.interpretation,
        plan: state.plan,
        metrics: state.metrics,
        evidence: state.evidence,
        sources: state.sources,
        validation: state.validation ?? { passed: false, checks: [{ name: "completion", passed: false, detail: "Workflow did not set validation" }], refusalReason: "Workflow incomplete" },
        timingsMs: { total, ...state.timings },
        budgets: { sourceCallsUsed: state.sourceCallsUsed, sourceCallsMax: 6, plannerAttemptsUsed: state.plannerAttemptsUsed, plannerAttemptsMax: 2 },
      });
      try { await this.repository.persistAudit({ response, request: state.request, model: process.env.OPENAI_MODEL ?? "mock" }); } catch { /* Audit failure must not alter an already safe response. */ }
      return { response };
    };

    return new StateGraph(GraphStateSchema)
      .addNode("initialiseRequest", initialiseRequest)
      .addNode("interpretQuestion", interpretQuestion)
      .addNode("resolveAndAuthoriseScope", resolveAndAuthoriseScope)
      .addNode("buildExecutionPlan", buildExecutionPlan)
      .addNode("executeSources", executeSources)
      .addNode("calculateFacts", calculateFacts)
      .addNode("validateFacts", validateFacts)
      .addNode("composeAnswer", composeAnswer)
      .addNode("validateAnswer", validateAnswer)
      .addNode("needsClarification", needsClarification)
      .addNode("refuse", refuse)
      .addNode("finalise", finalise)
      .addEdge(START, "initialiseRequest")
      .addEdge("initialiseRequest", "interpretQuestion")
      .addConditionalEdges("interpretQuestion", (state) => state.interpretation?.needsClarification ? "needsClarification" : state.refusalReason || state.interpretation?.intent === "unsupported" ? "refuse" : "resolveAndAuthoriseScope")
      .addConditionalEdges("resolveAndAuthoriseScope", (state) => state.refusalReason ? "refuse" : "buildExecutionPlan")
      .addEdge("buildExecutionPlan", "executeSources")
      .addConditionalEdges("executeSources", (state) => state.validation?.passed ? "calculateFacts" : "refuse")
      .addEdge("calculateFacts", "validateFacts")
      .addConditionalEdges("validateFacts", (state) => state.validation?.passed ? "composeAnswer" : "refuse")
      .addEdge("composeAnswer", "validateAnswer")
      .addEdge("validateAnswer", "finalise")
      .addEdge("needsClarification", "finalise")
      .addEdge("refuse", "finalise")
      .addEdge("finalise", END)
      .compile();
  }

  async query(rawRequest: QueryRequest): Promise<PublicResponse> {
    const request = QueryRequestSchema.parse(rawRequest);
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Overall request timeout")), this.requestTimeoutMs);
    try {
      const invokeConfig = { recursionLimit: 16, signal: controller.signal } as Parameters<typeof this.graph.invoke>[1];
      const state = await this.graph.invoke({ request, requestId, signal: controller.signal }, invokeConfig);
      return required(state.response, "public response");
    } catch (error) {
      const message = controller.signal.aborted ? "The bounded workflow timed out and returned no answer." : "The bounded workflow failed safely.";
      return PublicResponseSchema.parse({
        requestId, status: "failed", answer: null, message, resolvedScope: null, interpretation: null, plan: null,
        metrics: [], evidence: [], sources: [], validation: { passed: false, checks: [{ name: "system", passed: false, detail: error instanceof Error ? error.name : "Unexpected failure" }], refusalReason: message },
        timingsMs: { total: this.requestTimeoutMs }, budgets: { sourceCallsUsed: 0, sourceCallsMax: 6, plannerAttemptsUsed: 0, plannerAttemptsMax: 2 },
      });
    } finally { clearTimeout(timeout); }
  }
}
