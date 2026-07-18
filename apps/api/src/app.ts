import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ErrorResponseSchema, PublicResponseSchema, QueryRequestSchema } from "@autograb/contracts";
import type { AutoGrabRepository } from "@autograb/db";
import { createDatabase, InMemoryRepository, makeDemoData, NeonRepository } from "@autograb/db";
import { BoundedOrchestrator, type ModelGateway } from "@autograb/orchestrator";

export interface AppOptions {
  logger?: boolean;
  repository?: AutoGrabRepository;
  model?: ModelGateway;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, genReqId: () => crypto.randomUUID() });
  const repository = options.repository ?? (process.env.DATABASE_URL
    ? new NeonRepository(createDatabase())
    : new InMemoryRepository(makeDemoData(), { keepFresh: true }));
  const orchestrator = new BoundedOrchestrator(repository, options.model ? { model: options.model } : {});
  const allowlist = new Set((process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()));
  void app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
    methods: ["GET", "POST"],
  });

  app.get("/health", async () => ({ status: "ok", service: "autograb-api" }));
  app.get("/ready", async () => ({ status: "ready", modelMode: process.env.MODEL_MODE ?? "mock", dataMode: process.env.DATABASE_URL ? "neon" : "memory" }));

  app.get("/v1/demo/principals", async () => (await repository.listPrincipals()).map(({ id, name, description }) => ({ id, name, description })));
  app.get("/v1/demo/scenarios", async () => [
    { id: "normal", label: "Fresh data", description: "Freshness checks passed", production: false },
    { id: "stale-inventory", label: "Inventory needs refresh", description: "Inventory needs refreshing before analysis", production: false },
    { id: "stale-valuation", label: "Valuation data needs refresh", description: "Valuation data needs refreshing before analysis", production: false },
    { id: "catalogue-timeout", label: "Catalogue temporarily unavailable", description: "The catalogue source is temporarily unavailable", production: false },
    { id: "forbidden-site", label: "Outside this role’s access", description: "The selected role cannot access the requested site", production: false },
  ]);

  app.post("/v1/query", async (request, reply) => {
    const parsed = QueryRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const body = ErrorResponseSchema.parse({
        status: "failed", requestId: request.id, message: "Invalid query request.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
      return reply.code(400).send(body);
    }
    const response = PublicResponseSchema.parse(await orchestrator.query(parsed.data));
    request.log.info({ workflowRequestId: response.requestId, status: response.status, timingsMs: response.timingsMs, sourceCalls: response.budgets.sourceCallsUsed }, "bounded query completed");
    return reply.code(200).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "unexpected API failure");
    const body = ErrorResponseSchema.parse({ status: "failed", requestId: request.id, message: "The API could not complete the request." });
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500 ? error.statusCode : 500;
    void reply.code(statusCode).send(body);
  });

  return app;
}
