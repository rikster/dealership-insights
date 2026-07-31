import type { Evidence, Fact, InterpretedQuestion, Metric, SourceResult } from "@dealership-insights/contracts";
import type { CatalogueRow, InventoryRow, ValuationRow } from "@dealership-insights/db";

export interface AnalyticsOutput {
  metrics: Metric[];
  facts: Fact[];
  evidence: Evidence[];
  caveats: string[];
}

function daysOnLot(stockedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - stockedAt.getTime()) / 86_400_000));
}

function evidenceId(index: number): string { return `E${String(index + 1).padStart(3, "0")}`; }
function sourceTime(source: "inventory" | "valuation" | "catalogue", sources: SourceResult[]): string {
  return sources.find((item) => item.source === source)?.sourceTime ?? new Date(0).toISOString();
}

export function calculateStockAgeing(rows: InventoryRow[], question: InterpretedQuestion, sources: SourceResult[], now: Date): AnalyticsOutput {
  const threshold = question.filters.minDaysOnLot ?? 60;
  const matching = rows.map((row) => ({ row, days: daysOnLot(row.stockedAt, now) }))
    .filter((item) => item.days >= threshold)
    .sort((a, b) => b.days - a.days || a.row.vehicleId.localeCompare(b.row.vehicleId));
  const evidence = matching.slice(0, 50).map((item, index): Evidence => ({
    id: evidenceId(index), source: "inventory", vehicleId: item.row.vehicleId,
    label: `${item.row.vehicleId}: ${item.days} days`, detail: `Active inventory, price $${(item.row.priceCents / 100).toLocaleString("en-AU")}`,
    sourceTime: sourceTime("inventory", sources),
  }));
  const ids = evidence.map((item) => item.id);
  if (ids.length === 0) {
    const empty: Evidence = { id: "E001", source: "inventory", label: "No matching vehicles", detail: `No active vehicle met the ${threshold}-day threshold`, sourceTime: sourceTime("inventory", sources) };
    return { metrics: [{ id: "stock-count", name: "vehicle_count", label: `Vehicles at least ${threshold} days old`, value: 0, unit: "count", evidenceIds: [empty.id], dimensions: {} }], facts: [{ id: "F001", statement: `No active vehicles are at least ${threshold} days old.`, evidenceIds: [empty.id], material: true }], evidence: [empty], caveats: [] };
  }
  return {
    metrics: [{ id: "stock-count", name: "vehicle_count", label: `Vehicles at least ${threshold} days old`, value: matching.length, unit: "count", evidenceIds: ids, dimensions: {} }],
    facts: [{ id: "F001", statement: `${matching.length} active vehicle${matching.length === 1 ? " is" : "s are"} at least ${threshold} days old.`, evidenceIds: ids, material: true }],
    evidence, caveats: matching.length > evidence.length ? [`Evidence display capped at ${evidence.length} vehicles.`] : [],
  };
}

export function calculateMarketPricing(inventory: InventoryRow[], valuations: ValuationRow[], question: InterpretedQuestion, sources: SourceResult[]): AnalyticsOutput {
  const threshold = question.filters.minPercentAboveMarket ?? 10;
  const values = new Map(valuations.map((row) => [row.vehicleId, row]));
  let zeroValuations = 0;
  const joined = inventory.flatMap((row) => {
    const valuation = values.get(row.vehicleId);
    if (!valuation) return [];
    if (valuation.marketValueCents <= 0) { zeroValuations += 1; return []; }
    const delta = ((row.priceCents - valuation.marketValueCents) / valuation.marketValueCents) * 100;
    return delta > threshold ? [{ row, valuation, delta }] : [];
  }).sort((a, b) => b.delta - a.delta || a.row.vehicleId.localeCompare(b.row.vehicleId));
  const evidence = joined.slice(0, 50).map((item, index): Evidence => ({
    id: evidenceId(index), source: "valuation", vehicleId: item.row.vehicleId,
    label: `${item.row.vehicleId}: ${item.delta.toFixed(1)}% above market`,
    detail: `Listed $${(item.row.priceCents / 100).toLocaleString("en-AU")}; market $${(item.valuation.marketValueCents / 100).toLocaleString("en-AU")}`,
    sourceTime: sourceTime("valuation", sources),
  }));
  const effectiveEvidence = evidence.length ? evidence : [{ id: "E001", source: "valuation" as const, label: "No matching vehicles", detail: `No valid joined vehicle exceeded ${threshold}% above market`, sourceTime: sourceTime("valuation", sources) }];
  const ids = effectiveEvidence.map((item) => item.id);
  return {
    metrics: [{ id: "market-count", name: "vehicle_count", label: `Vehicles more than ${threshold}% above market`, value: joined.length, unit: "count", evidenceIds: ids, dimensions: {} }],
    facts: [{ id: "F001", statement: `${joined.length} vehicle${joined.length === 1 ? " is" : "s are"} more than ${threshold}% above market.`, evidenceIds: ids, material: true }],
    evidence: effectiveEvidence,
    caveats: zeroValuations ? [`${zeroValuations} zero-valued valuation ${zeroValuations === 1 ? "was" : "were"} excluded to prevent division by zero.`] : [],
  };
}

export function calculateRegionalModelAgeing(inventory: InventoryRow[], catalogue: CatalogueRow[], question: InterpretedQuestion, sources: SourceResult[], now: Date): AnalyticsOutput {
  const make = question.filters.make?.toLowerCase();
  const vehicleMap = new Map(inventory.map((row) => [row.vehicleId, row]));
  const groups = new Map<string, number[]>();
  for (const item of catalogue) {
    const vehicle = vehicleMap.get(item.vehicleId);
    if (!vehicle || (make && item.make.toLowerCase() !== make)) continue;
    const key = `${item.make} ${item.model}`;
    groups.set(key, [...(groups.get(key) ?? []), daysOnLot(vehicle.stockedAt, now)]);
  }
  const ranking = [...groups].map(([model, days]) => ({ model, average: days.reduce((sum, day) => sum + day, 0) / days.length, count: days.length }))
    .sort((a, b) => b.average - a.average || a.model.localeCompare(b.model));
  const evidence = ranking.slice(0, 50).map((item, index): Evidence => ({
    id: evidenceId(index), source: "catalogue", label: `${item.model}: ${item.average.toFixed(1)} average days`,
    detail: `${item.count} active matched vehicle${item.count === 1 ? "" : "s"}`, sourceTime: sourceTime("catalogue", sources),
  }));
  const effectiveEvidence = evidence.length ? evidence : [{ id: "E001", source: "catalogue" as const, label: "No model matches", detail: `No catalogue-backed ${question.filters.make ?? "requested"} models were available`, sourceTime: sourceTime("catalogue", sources) }];
  const metrics: Metric[] = ranking.map((item, index) => ({ id: `model-${index + 1}`, name: "average_days_on_lot", label: item.model, value: Number(item.average.toFixed(1)), unit: "days", evidenceIds: [effectiveEvidence[index]?.id ?? effectiveEvidence[0]!.id], dimensions: { rank: String(index + 1), vehicleCount: String(item.count) } }));
  return {
    metrics,
    facts: [{ id: "F001", statement: ranking.length ? `${ranking[0]!.model} is ageing fastest at ${ranking[0]!.average.toFixed(1)} average days on lot.` : "No catalogue-backed models matched the requested make.", evidenceIds: [effectiveEvidence[0]!.id], material: true }],
    evidence: effectiveEvidence,
    caveats: catalogue.length < inventory.length ? ["Vehicles without a catalogue match were excluded from model ranking."] : [],
  };
}

