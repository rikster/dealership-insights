import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for this command");
  return url;
}

export function createDatabase(url = requireDatabaseUrl()) {
  return drizzle(neon(url), { schema });
}

export type Database = ReturnType<typeof createDatabase>;

