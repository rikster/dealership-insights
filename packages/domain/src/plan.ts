import type { ExecutionPlan, InterpretedQuestion } from "@autograb/contracts";
import { DEFAULT_MAX_SOURCE_ROWS } from "./config.js";

export function buildApprovedPlan(question: InterpretedQuestion): ExecutionPlan {
  if (question.intent === "unsupported") throw new Error("Unsupported intent has no execution plan");
  const common = { intent: question.intent, metric: question.metric };
  switch (question.intent) {
    case "stock_ageing":
      return { ...common, intent: "stock_ageing", steps: [{ source: "inventory", required: true, mode: "parallel", maxRows: DEFAULT_MAX_SOURCE_ROWS }] };
    case "market_pricing":
      return { ...common, intent: "market_pricing", steps: [
        { source: "inventory", required: true, mode: "parallel", maxRows: DEFAULT_MAX_SOURCE_ROWS },
        { source: "valuation", required: true, mode: "parallel", maxRows: DEFAULT_MAX_SOURCE_ROWS },
      ] };
    case "regional_model_ageing":
      return { ...common, intent: "regional_model_ageing", steps: [
        { source: "inventory", required: true, mode: "parallel", maxRows: DEFAULT_MAX_SOURCE_ROWS },
        { source: "catalogue", required: true, mode: "lazy_batch", maxRows: DEFAULT_MAX_SOURCE_ROWS },
      ] };
  }
}
