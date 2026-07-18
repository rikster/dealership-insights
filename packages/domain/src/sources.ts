import type { AuthorisedScope, Freshness, Scenario, SourceName, SourceResult } from "@autograb/contracts";
import type { AutoGrabRepository, CatalogueRow, InventoryRow, ValuationRow } from "@autograb/db";
import type { DomainConfig } from "./config.js";

export interface SourceEnvelope<T> {
  meta: SourceResult;
  rows: T[];
}

function oldestDate(rows: { sourceTime: Date }[]): Date | null {
  return rows.reduce<Date | null>((oldest, row) => !oldest || row.sourceTime < oldest ? row.sourceTime : oldest, null);
}

export function classifyFreshness(source: SourceName, sourceTime: Date | null, now: Date, config: DomainConfig): Freshness {
  const maxAge = source === "inventory" ? config.inventoryMaxAgeSeconds : source === "valuation" ? config.valuationMaxAgeSeconds : null;
  if (!sourceTime) return { classification: "unknown", ageSeconds: null, maxAgeSeconds: maxAge, reason: "Source returned no timestamped rows" };
  const ageSeconds = Math.max(0, (now.getTime() - sourceTime.getTime()) / 1_000);
  if (source === "catalogue") return { classification: "fresh", ageSeconds, maxAgeSeconds: null, reason: "Catalogue is validated by source version and record presence" };
  const classification = maxAge !== null && ageSeconds <= maxAge ? "fresh" : "stale";
  return { classification, ageSeconds, maxAgeSeconds: maxAge, reason: `${source} age ${Math.round(ageSeconds)}s; limit ${maxAge}s` };
}

function envelope<T extends { sourceTime: Date }>(source: SourceName, rows: T[], required: boolean, now: Date, config: DomainConfig): SourceEnvelope<T> {
  const sourceTime = oldestDate(rows);
  return {
    rows,
    meta: {
      source,
      sourceTime: sourceTime?.toISOString() ?? null,
      fetchedAt: now.toISOString(),
      freshness: classifyFreshness(source, sourceTime, now, config),
      rowCount: rows.length,
      required,
      error: null,
    },
  };
}

export class SourceAdapterError extends Error {
  constructor(readonly source: SourceName, readonly code: "timeout" | "unavailable" | "invalid_data" | "budget_exceeded", message: string) { super(message); }
}

function assertWithinRowBudget(source: SourceName, rowCount: number, maxRows: number): void {
  if (rowCount > maxRows) {
    throw new SourceAdapterError(source, "budget_exceeded", `Required ${source} scope exceeds the ${maxRows.toLocaleString()}-row safety limit`);
  }
}

export async function readInventory(repository: AutoGrabRepository, scope: AuthorisedScope, scenario: Scenario, signal: AbortSignal, now: Date, config: DomainConfig): Promise<SourceEnvelope<InventoryRow>> {
  let rows = await repository.getInventory(scope, { signal, maxRows: config.maxRows + 1 });
  assertWithinRowBudget("inventory", rows.length, config.maxRows);
  if (scenario === "stale-inventory") rows = rows.map((row) => ({ ...row, sourceTime: new Date(now.getTime() - (config.inventoryMaxAgeSeconds + 60) * 1_000) }));
  return envelope("inventory", rows, true, now, config);
}

export async function readValuations(repository: AutoGrabRepository, scope: AuthorisedScope, scenario: Scenario, signal: AbortSignal, now: Date, config: DomainConfig): Promise<SourceEnvelope<ValuationRow>> {
  let rows = await repository.getValuations(scope, null, { signal, maxRows: config.maxRows + 1 });
  assertWithinRowBudget("valuation", rows.length, config.maxRows);
  if (scenario === "stale-valuation") rows = rows.map((row) => ({ ...row, sourceTime: new Date(now.getTime() - (config.valuationMaxAgeSeconds + 60) * 1_000) }));
  return envelope("valuation", rows, true, now, config);
}

export async function readCatalogue(repository: AutoGrabRepository, scope: AuthorisedScope, vehicleIds: string[], scenario: Scenario, signal: AbortSignal, now: Date, config: DomainConfig): Promise<SourceEnvelope<CatalogueRow>> {
  if (scenario === "catalogue-timeout") throw new SourceAdapterError("catalogue", "timeout", "Demo fault: catalogue batch timed out");
  const rows = await repository.getCatalogue(scope, [...new Set(vehicleIds)].slice(0, config.maxRows), { signal, maxRows: config.maxRows });
  return envelope("catalogue", rows, true, now, config);
}

export function failedSource(source: SourceName, required: boolean, error: unknown, now: Date, config: DomainConfig): SourceResult {
  const adapterError = error instanceof SourceAdapterError ? error : null;
  return {
    source, sourceTime: null, fetchedAt: now.toISOString(), rowCount: 0, required,
    freshness: classifyFreshness(source, null, now, config),
    error: { code: adapterError?.code ?? "unavailable", message: adapterError?.message ?? "Source unavailable", retryable: adapterError?.code === "timeout" },
  };
}
