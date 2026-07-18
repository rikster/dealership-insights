import type { ExecutionPlan, InterpretedQuestion } from "@autograb/contracts";

export function buildApprovedPlan(question: InterpretedQuestion): ExecutionPlan {
  if (question.intent === "unsupported") throw new Error("Unsupported intent has no execution plan");
  const common = { intent: question.intent, metric: question.metric };
  switch (question.intent) {
    case "stock_ageing":
      return { ...common, intent: "stock_ageing", steps: [{ source: "inventory", required: true, mode: "parallel", maxRows: 5_000 }] };
    case "market_pricing":
      return { ...common, intent: "market_pricing", steps: [
        { source: "inventory", required: true, mode: "parallel", maxRows: 5_000 },
        { source: "valuation", required: true, mode: "parallel", maxRows: 5_000 },
      ] };
    case "regional_model_ageing":
      return { ...common, intent: "regional_model_ageing", steps: [
        { source: "inventory", required: true, mode: "parallel", maxRows: 5_000 },
        { source: "catalogue", required: true, mode: "lazy_batch", maxRows: 5_000 },
      ] };
  }
}

