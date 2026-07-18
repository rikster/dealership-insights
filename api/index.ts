import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./bundle.mjs";

// Vercel discovers Node functions from the repository-level api directory.
// The bundle is generated from the Fastify workspace by build:api:vercel.
let ready: Promise<unknown> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  ready ??= app.ready();
  await ready;
  app.server.emit("request", request, response);
}
