import { createDatabase } from "./client.js";
import { catalogue, inventory, valuations } from "./schema.js";

const db = createDatabase();
const fetchedAt = new Date();
const sourceTime = new Date(fetchedAt.getTime() - 30_000);
await Promise.all([
  db.update(inventory).set({ sourceTime, fetchedAt }),
  db.update(valuations).set({ sourceTime, fetchedAt }),
  db.update(catalogue).set({ sourceTime, fetchedAt, sourceVersion: "demo-v1" }),
]);
console.log(`Demo freshness reset to ${sourceTime.toISOString()}.`);

