import Fastify, { type FastifyInstance } from "fastify";

export interface AppOptions {
  logger?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/health", async () => ({ status: "ok", service: "autograb-api" }));
  app.get("/ready", async () => ({
    status: "ready",
    modelMode: process.env.MODEL_MODE ?? "mock",
    dataMode: process.env.DATABASE_URL ? "neon" : "memory",
  }));

  return app;
}
