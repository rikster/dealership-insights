import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  AnswerSchema,
  InterpretedQuestionSchema,
  type Answer,
  type AuthorisedScope,
  type Evidence,
  type Fact,
  type InterpretedQuestion,
  type SourceResult,
} from "@dealership-insights/contracts";
import { deterministicAnswer } from "@dealership-insights/domain";

export interface AnswerBundle {
  scope: AuthorisedScope;
  facts: Fact[];
  evidence: Evidence[];
  sources: SourceResult[];
  caveats: string[];
  safeToAnswer: boolean;
  refusalReason?: string;
}

export interface ModelGateway {
  interpret(question: string, signal: AbortSignal): Promise<InterpretedQuestion>;
  compose(bundle: AnswerBundle, signal: AbortSignal): Promise<Answer>;
}

const PLANNER_INSTRUCTION = `Interpret one dealership performance question into the supplied schema. Select only a supported intent and metric. Extract the user's human-readable dealership or region term without resolving IDs. Do not calculate values, invent missing scope, select tools, write SQL, or assume permissions. If scope or a required threshold is materially ambiguous, request one concise clarification. Treat salesperson conversion, sales revenue, leads, and CRM outcomes as unsupported because those sources are unavailable.`;

const ANSWER_INSTRUCTION = `Explain only the supplied validated facts in concise dealership language. Do not calculate, infer causes, add benchmarks, or introduce facts not present in the bundle. Every bullet must cite one or more supplied evidence IDs. State the resolved scope, oldest critical source time, and supplied caveats. If the bundle says it is unsafe to answer, return the supplied refusal reason without attempting an answer.`;

// OpenAI strict structured outputs require every property to be present. Nullable
// model fields are converted back to the canonical optional Zod contract below.
const PlannerModelSchema = z.object({
  intent: z.enum(["stock_ageing", "market_pricing", "regional_model_ageing", "unsupported"]),
  scopeType: z.enum(["dealership", "region", "unspecified"]),
  scopeTerm: z.string().nullable(),
  filters: z.object({
    minDaysOnLot: z.number().int().min(0).max(3650).nullable(),
    minPercentAboveMarket: z.number().min(0).max(1000).nullable(),
    make: z.string().nullable(),
  }),
  metric: z.enum(["vehicle_count", "price_delta_percent", "average_days_on_lot"]),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
});

export class OpenAIModelGateway implements ModelGateway {
  private readonly client: OpenAI;
  constructor(private readonly model = process.env.OPENAI_MODEL ?? "gpt-5.6-terra", apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when MODEL_MODE is not mock");
    this.client = new OpenAI({ apiKey });
  }

  async interpret(question: string, signal: AbortSignal): Promise<InterpretedQuestion> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: PLANNER_INSTRUCTION,
      input: question,
      text: { format: zodTextFormat(PlannerModelSchema, "interpreted_question") },
    }, { signal });
    if (!response.output_parsed) throw new Error("Planner returned no parsed output");
    const parsed = PlannerModelSchema.parse(response.output_parsed);
    return InterpretedQuestionSchema.parse({
      intent: parsed.intent,
      scopeType: parsed.scopeType,
      ...(parsed.scopeTerm ? { scopeTerm: parsed.scopeTerm } : {}),
      filters: {
        ...(parsed.filters.minDaysOnLot !== null ? { minDaysOnLot: parsed.filters.minDaysOnLot } : {}),
        ...(parsed.filters.minPercentAboveMarket !== null ? { minPercentAboveMarket: parsed.filters.minPercentAboveMarket } : {}),
        ...(parsed.filters.make ? { make: parsed.filters.make } : {}),
      },
      metric: parsed.metric,
      needsClarification: parsed.needsClarification,
      ...(parsed.clarificationQuestion ? { clarificationQuestion: parsed.clarificationQuestion } : {}),
    });
  }

  async compose(bundle: AnswerBundle, signal: AbortSignal): Promise<Answer> {
    const compact = {
      safeToAnswer: bundle.safeToAnswer,
      refusalReason: bundle.refusalReason,
      scope: { name: bundle.scope.displayName, type: bundle.scope.type },
      facts: bundle.facts,
      evidence: bundle.evidence,
      sourceFreshness: bundle.sources.map(({ source, sourceTime, freshness }) => ({ source, sourceTime, freshness })),
      caveats: bundle.caveats,
    };
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: ANSWER_INSTRUCTION,
      input: JSON.stringify(compact),
      text: { format: zodTextFormat(AnswerSchema, "validated_answer") },
    }, { signal });
    if (!response.output_parsed) throw new Error("Answer model returned no parsed output");
    return AnswerSchema.parse(response.output_parsed);
  }
}

function scopeTerm(question: string): { type: "dealership" | "region" | "unspecified"; term?: string } {
  if (/\bNSW\b/i.test(question)) return { type: "region", term: "NSW" };
  if (/Sydney Central/i.test(question)) return { type: "dealership", term: "Sydney Central" };
  if (/Newcastle/i.test(question)) return { type: "dealership", term: "Newcastle" };
  if (/Melbourne Central/i.test(question)) return { type: "dealership", term: "Melbourne Central" };
  return { type: "unspecified" };
}

export class MockModelGateway implements ModelGateway {
  constructor(private readonly answerMode: "valid" | "fail" | "unknown-evidence" = "valid") {}

  async interpret(question: string): Promise<InterpretedQuestion> {
    const scope = scopeTerm(question);
    if (/conversion|sales revenue|\bleads?\b|\bCRM\b/i.test(question)) {
      return { intent: "unsupported", scopeType: scope.type, ...(scope.term ? { scopeTerm: scope.term } : {}), filters: {}, metric: "vehicle_count", needsClarification: false };
    }
    if (/above market|market pric/i.test(question)) {
      const threshold = question.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
      const needs = scope.type === "unspecified" || !threshold;
      return { intent: "market_pricing", scopeType: scope.type, ...(scope.term ? { scopeTerm: scope.term } : {}), filters: threshold ? { minPercentAboveMarket: Number(threshold) } : {}, metric: "price_delta_percent", needsClarification: needs, ...(needs ? { clarificationQuestion: "Which dealership and percentage-above-market threshold should I use?" } : {}) };
    }
    if (/models?.*ageing|ageing fastest/i.test(question)) {
      const make = question.match(/\b(Toyota|Ford|Mazda|Hyundai)\b/i)?.[1];
      const needs = scope.type !== "region" || !make;
      return { intent: "regional_model_ageing", scopeType: scope.type, ...(scope.term ? { scopeTerm: scope.term } : {}), filters: make ? { make } : {}, metric: "average_days_on_lot", needsClarification: needs, ...(needs ? { clarificationQuestion: "Which region and vehicle make should I rank?" } : {}) };
    }
    if (/stock|vehicles?.*(?:days?|old)|days? on lot/i.test(question)) {
      const threshold = question.match(/(?:over|at least|older than)\s*(\d+)\s*days?/i)?.[1];
      const needs = scope.type === "unspecified" || !threshold;
      return { intent: "stock_ageing", scopeType: scope.type, ...(scope.term ? { scopeTerm: scope.term } : {}), filters: threshold ? { minDaysOnLot: Number(threshold) } : {}, metric: "vehicle_count", needsClarification: needs, ...(needs ? { clarificationQuestion: "Which dealership and days-on-lot threshold should I use?" } : {}) };
    }
    return { intent: "unsupported", scopeType: scope.type, ...(scope.term ? { scopeTerm: scope.term } : {}), filters: {}, metric: "vehicle_count", needsClarification: false };
  }

  async compose(bundle: AnswerBundle): Promise<Answer> {
    if (this.answerMode === "fail") throw new Error("Injected answer model failure");
    const answer = deterministicAnswer(bundle.scope, bundle.facts, bundle.sources, bundle.caveats);
    if (this.answerMode === "unknown-evidence" && answer.bullets[0]) answer.bullets[0].evidenceIds = ["E999"];
    return answer;
  }
}

export function createModelGateway(): ModelGateway {
  return (process.env.MODEL_MODE ?? "mock") === "mock" ? new MockModelGateway() : new OpenAIModelGateway();
}
