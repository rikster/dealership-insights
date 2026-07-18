import { migrate } from "drizzle-orm/neon-http/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.js";

await migrate(createDatabase(), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
console.log("Database migrations applied explicitly.");
