import { describe, expect, it } from "vitest";
import type { AuthorisedScope, InterpretedQuestion } from "@dealership-insights/contracts";
import { InMemoryRepository, makeDemoData } from "@dealership-insights/db";
import {
  authoriseScope,
  buildApprovedPlan,
  calculateMarketPricing,
  calculateRegionalModelAgeing,
  calculateStockAgeing,
  domainConfig,
  readCatalogue,
  readInventory,
  readValuations,
  validateFacts,
} from "./index.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const config = { ...domainConfig(), inventoryMaxAgeSeconds: 300, valuationMaxAgeSeconds: 3600 };
const scope: AuthorisedScope = { principalId: "head-office-analyst", type: "region", regionId: "r-nsw", displayName: "NSW", dealershipIds: ["d-sydney-central", "d-newcastle", "d-parramatta"] };
const signal = new AbortController().signal;
const sourceMeta = (source: "inventory" | "valuation" | "catalogue") => ({ source, sourceTime: new Date(now.getTime() - 60_000).toISOString(), fetchedAt: now.toISOString(), freshness: { classification: "fresh" as const, ageSeconds: 60, maxAgeSeconds: source === "catalogue" ? null : 3600, reason: "fixture" }, rowCount: 5, required: true, error: null });

function interpretation(intent: InterpretedQuestion["intent"], filters: InterpretedQuestion["filters"]): InterpretedQuestion {
  return { intent, scopeType: intent === "regional_model_ageing" ? "region" : "dealership", scopeTerm: intent === "regional_model_ageing" ? "NSW" : "Sydney Central", filters, metric: intent === "regional_model_ageing" ? "average_days_on_lot" : "vehicle_count", needsClarification: false };
}

describe("deterministic domain", () => {
  it("maps approved intents to fixed sources and keeps catalogue lazy", () => {
    expect(buildApprovedPlan(interpretation("stock_ageing", { minDaysOnLot: 60 })).steps.map((step) => step.source)).toEqual(["inventory"]);
    expect(buildApprovedPlan(interpretation("market_pricing", { minPercentAboveMarket: 10 })).steps.map((step) => step.source)).toEqual(["inventory", "valuation"]);
    expect(buildApprovedPlan(interpretation("regional_model_ageing", { make: "Toyota" })).steps).toContainEqual(expect.objectContaining({ source: "catalogue", mode: "lazy_batch" }));
    expect(buildApprovedPlan(interpretation("regional_model_ageing", { make: "Toyota" })).steps.every((step) => step.maxRows === 10_000)).toBe(true);
    expect(domainConfig().maxRows).toBe(10_000);
  });

  it("calculates exact stock-ageing count", () => {
    const data = makeDemoData(now);
    const result = calculateStockAgeing(data.inventory.filter((row) => row.dealershipId === "d-sydney-central"), interpretation("stock_ageing", { minDaysOnLot: 60 }), [sourceMeta("inventory")], now);
    expect(result.metrics[0]?.value).toBe(2);
    expect(result.evidence.map((item) => item.vehicleId)).toEqual(["V001", "V002"]);
  });

  it("calculates market delta in code and excludes zero denominators", () => {
    const data = makeDemoData(now);
    const result = calculateMarketPricing(data.inventory.filter((row) => row.dealershipId === "d-sydney-central"), data.valuations, interpretation("market_pricing", { minPercentAboveMarket: 10 }), [sourceMeta("inventory"), sourceMeta("valuation")]);
    expect(result.metrics[0]?.value).toBe(1);
    expect(result.evidence[0]?.label).toContain("22.2%");
    expect(result.caveats[0]).toContain("zero-valued");
  });

  it("ranks tied regional models with a deterministic alphabetical tie-breaker", () => {
    const data = makeDemoData(now);
    const result = calculateRegionalModelAgeing(data.inventory, data.catalogue, interpretation("regional_model_ageing", { make: "Toyota" }), [sourceMeta("inventory"), sourceMeta("catalogue")], now);
    expect(result.metrics.map((item) => item.label)).toEqual(["Toyota Camry", "Toyota Corolla", "Toyota RAV4"]);
    expect(result.metrics.slice(0, 2).map((item) => item.value)).toEqual([100, 100]);
  });

  it("classifies scenario-stale required valuation and refuses validation", async () => {
    const repository = new InMemoryRepository(makeDemoData(now));
    const result = await readValuations(repository, scope, "stale-valuation", signal, now, config);
    const validation = validateFacts([], [], [], [result.meta]);
    expect(result.meta.freshness.classification).toBe("stale");
    expect(validation.passed).toBe(false);
    expect(validation.refusalReason).toContain("valuation");
  });

  it("classifies scenario-stale required inventory and refuses validation", async () => {
    const repository = new InMemoryRepository(makeDemoData(now));
    const result = await readInventory(repository, scope, "stale-inventory", signal, now, config);
    const validation = validateFacts([], [], [], [result.meta]);
    expect(result.meta.freshness).toMatchObject({ classification: "stale", maxAgeSeconds: 300 });
    expect(result.meta.freshness.ageSeconds).toBe(360);
    expect(validation.passed).toBe(false);
    expect(validation.refusalReason).toContain("inventory");
  });

  it("batches catalogue by inventory IDs and never calls it for an inventory read", async () => {
    const repository = new InMemoryRepository(makeDemoData(now));
    const inventory = await readInventory(repository, scope, "normal", signal, now, config);
    expect(repository.calls.catalogue).toBe(0);
    await readCatalogue(repository, scope, inventory.rows.map((row) => row.vehicleId), "normal", signal, now, config);
    expect(repository.calls.catalogue).toBe(1);
  });

  it("fails closed for an out-of-scope or injected forbidden request", () => {
    const data = makeDemoData(now);
    const principal = data.principals.find((item) => item.id === "sydney-central-manager")!;
    const melbourne = data.resolutions.find((item) => item.id === "d-melbourne")!;
    expect(authoriseScope(principal, melbourne, "normal").authorised).toBe(false);
    const sydney = data.resolutions.find((item) => item.id === "d-sydney-central")!;
    expect(authoriseScope(principal, sydney, "forbidden-site").authorised).toBe(false);
  });
});
