import { InMemoryRepository, makeDemoData } from "../packages/db/src/index.js";
import { BoundedOrchestrator, MockModelGateway } from "../packages/orchestrator/src/index.js";

const questions = [
  "Which vehicles at Sydney Central have been in stock over 60 days?",
  "Which vehicles at Sydney Central are more than 10% above market?",
  "Which Toyota models are ageing fastest in NSW?",
];
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? 0;

async function main() {
  const repository = new InMemoryRepository(makeDemoData());
  const orchestrator = new BoundedOrchestrator(repository, { model: new MockModelGateway() });
  const results = [];
  for (let index = 0; index < 30; index += 1) {
    results.push(await orchestrator.query({ question: questions[index % questions.length]!, principalId: "head-office-analyst", scenario: "normal" }));
  }
  const total = results.map((result) => result.timingsMs.total);
  const component = (name: "planner" | "sources" | "analytics" | "answer") => results.map((result) => result.timingsMs[name] ?? 0).reduce((sum, value) => sum + value, 0) / results.length;
  console.log(JSON.stringify({
    mode: "local synthetic in-memory + mock model",
    samples: results.length,
    statusCounts: Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length])),
    totalMs: { p50: percentile(total, 0.5), p95: percentile(total, 0.95) },
    componentMeanMs: { planner: component("planner"), sources: component("sources"), analytics: component("analytics"), answer: component("answer") },
  }, null, 2));
}

void main();
