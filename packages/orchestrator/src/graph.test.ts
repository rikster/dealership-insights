import { describe, expect, it } from "vitest";
import { InMemoryRepository, makeDemoData } from "@autograb/db";
import { BoundedOrchestrator } from "./graph.js";
import { MockModelGateway } from "./model.js";
import type { ModelGateway } from "./model.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const options = (model: ModelGateway = new MockModelGateway()) => ({ model, now: () => now, requestTimeoutMs: 8_000, config: { inventoryMaxAgeSeconds: 300, valuationMaxAgeSeconds: 3600, maxSourceCalls: 6 as const, maxRows: 10_000, maxEvidence: 50 } });

function setup(model: ModelGateway = new MockModelGateway()) {
  const repository = new InMemoryRepository(makeDemoData(now));
  return { repository, orchestrator: new BoundedOrchestrator(repository, options(model)) };
}

describe("bounded graph golden paths", () => {
  it("answers stock ageing and skips unrelated sources", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.interpretation).toMatchObject({ intent: "stock_ageing", metric: "vehicle_count" });
    expect(result.resolvedScope?.dealershipIds).toEqual(["d-sydney-central"]);
    expect(result.plan?.steps.map((step) => step.source)).toEqual(["inventory"]);
    expect(result.metrics[0]?.value).toBe(2);
    expect(result.validation.passed).toBe(true);
    expect(repository.calls).toMatchObject({ inventory: 1, valuation: 0, catalogue: 0 });
  });

  it("answers market pricing with two concurrent scope-filtered sources", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central are more than 10% above market?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.interpretation).toMatchObject({ intent: "market_pricing", metric: "price_delta_percent" });
    expect(result.metrics[0]?.value).toBe(1);
    expect(result.evidence[0]?.label).toContain("22.2%");
    expect(result.budgets.sourceCallsUsed).toBe(2);
    expect(repository.calls).toMatchObject({ inventory: 1, valuation: 1, catalogue: 0 });
  });

  it("answers regional model ageing with one lazy catalogue batch", async () => {
    const data = makeDemoData(now);
    const sourceTime = new Date(now.getTime() - 60_000);
    const dealerships = ["d-sydney-central", "d-newcastle", "d-parramatta"];
    data.inventory = Array.from({ length: 10_000 }, (_, index) => ({
      vehicleId: `VR${String(index + 1).padStart(5, "0")}`,
      dealershipId: dealerships[index % dealerships.length]!,
      priceCents: 4_000_000,
      stockedAt: new Date(now.getTime() - (index < 5_000 ? 80 : 160) * 86_400_000),
      salesperson: null,
      sourceTime,
      fetchedAt: now,
    }));
    data.catalogue = data.inventory.map((row, index) => ({
      vehicleId: row.vehicleId,
      make: "Toyota",
      model: index < 5_000 ? "RAV4" : "Corolla",
      badge: null,
      series: null,
      specifications: {},
      sourceVersion: "demo-v1",
      sourceTime,
      fetchedAt: now,
    }));
    const repository = new InMemoryRepository(data);
    const orchestrator = new BoundedOrchestrator(repository, options());
    const result = await orchestrator.query({ question: "Which Toyota models are ageing fastest in NSW?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.plan?.steps.find((step) => step.source === "catalogue")?.mode).toBe("lazy_batch");
    expect(result.plan?.steps.every((step) => step.maxRows === 10_000)).toBe(true);
    expect(result.sources.map((source) => source.rowCount)).toEqual([10_000, 10_000]);
    expect(result.metrics.slice(0, 2).map((metric) => metric.label)).toEqual(["Toyota Corolla", "Toyota RAV4"]);
    expect(repository.calls).toMatchObject({ inventory: 1, valuation: 0, catalogue: 1 });

    data.inventory.push({ ...data.inventory[0]!, vehicleId: "VR10001" });
    const oversizedRepository = new InMemoryRepository(data);
    const oversized = await new BoundedOrchestrator(oversizedRepository, options()).query({ question: "Which Toyota models are ageing fastest in NSW?", principalId: "head-office-analyst", scenario: "normal" });
    expect(oversized.status).toBe("refused");
    expect(oversized.sources[0]?.error?.code).toBe("budget_exceeded");
    expect(oversized.metrics).toEqual([]);
    expect(oversizedRepository.calls.catalogue).toBe(0);
  });

  it("routes ambiguity to clarification without source execution", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles are old?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("needs_clarification");
    expect(result.message).toContain("dealership");
    expect(result.plan).toBeNull();
    expect(repository.calls.inventory).toBe(0);
  });

  it("refuses unsupported CRM outcomes without source execution", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "What is salesperson conversion at Sydney Central?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("refused");
    expect(result.message).toContain("sales conversion");
    expect(repository.calls.inventory).toBe(0);
  });

  it("refuses stale required valuation after deterministic validation", async () => {
    const { orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central are more than 10% above market?", principalId: "head-office-analyst", scenario: "stale-valuation" });
    expect(result.status).toBe("refused");
    expect(result.sources.find((source) => source.source === "valuation")?.freshness.classification).toBe("stale");
    expect(result.validation.checks.find((check) => check.name === "required_sources")?.passed).toBe(false);
    expect(result.answer).toBeNull();
    expect(result.metrics).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.timingsMs.analytics).toBeUndefined();
  });

  it("refuses explicitly stale inventory while the normal path stays deterministic", async () => {
    const { orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "head-office-analyst", scenario: "stale-inventory" });
    expect(result.status).toBe("refused");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.freshness).toMatchObject({ classification: "stale", ageSeconds: 360, maxAgeSeconds: 300 });
    expect(result.validation.checks.find((check) => check.name === "required_sources")?.passed).toBe(false);
    expect(result.answer).toBeNull();
    expect(result.metrics).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it("refuses forbidden scope before any source call", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "sydney-central-manager", scenario: "forbidden-site" });
    expect(result.status).toBe("refused");
    expect(result.message).toContain("outside");
    expect(repository.calls.inventory).toBe(0);
    expect(result.resolvedScope).toBeNull();
  });

  it("uses deterministic fallback when answer generation fails", async () => {
    const { orchestrator } = setup(new MockModelGateway("fail"));
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.answer?.caveats).toContain("Answer model was unavailable; deterministic renderer used.");
    expect(result.answer?.bullets.every((bullet) => bullet.evidenceIds.every((id) => result.evidence.some((item) => item.id === id)))).toBe(true);
  });

  it("replaces an answer containing unknown evidence IDs", async () => {
    const { orchestrator } = setup(new MockModelGateway("unknown-evidence"));
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.answer?.caveats.some((caveat) => caveat.includes("unknown evidence"))).toBe(true);
    expect(result.answer?.bullets[0]?.evidenceIds).not.toContain("E999");
  });

  it("refuses a required catalogue timeout", async () => {
    const { orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which Toyota models are ageing fastest in NSW?", principalId: "head-office-analyst", scenario: "catalogue-timeout" });
    expect(result.status).toBe("refused");
    expect(result.sources.find((source) => source.source === "catalogue")?.error?.code).toBe("timeout");
    expect(result.metrics).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  it("refuses an ordinary out-of-scope dealership before retrieval", async () => {
    const { repository, orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which vehicles at Melbourne Central have been in stock over 60 days?", principalId: "sydney-central-manager", scenario: "normal" });
    expect(result.status).toBe("refused");
    expect(result.message).toContain("not authorised");
    expect(repository.calls.inventory).toBe(0);
  });

  it("reports missing catalogue coverage as a caveat without guessing", async () => {
    const { orchestrator } = setup();
    const result = await orchestrator.query({ question: "Which Toyota models are ageing fastest in NSW?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.answer?.caveats.some((caveat) => caveat.includes("without a catalogue match"))).toBe(true);
    expect(result.metrics.every((metric) => Number.isFinite(metric.value))).toBe(true);
  });

  it("allows exactly one planner retry for an invalid first result", async () => {
    const delegate = new MockModelGateway();
    let calls = 0;
    const retrying: ModelGateway = {
      async interpret(question, _signal) {
        calls += 1;
        if (calls === 1) throw new Error("invalid structured result");
        return delegate.interpret(question);
      },
      compose: (bundle) => delegate.compose(bundle),
    };
    const { orchestrator } = setup(retrying);
    const result = await orchestrator.query({ question: "Which vehicles at Sydney Central have been in stock over 60 days?", principalId: "head-office-analyst", scenario: "normal" });
    expect(result.status).toBe("answered");
    expect(result.budgets.plannerAttemptsUsed).toBe(2);
    expect(calls).toBe(2);
  });
});
