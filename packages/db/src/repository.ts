import type { AuthorisedScope, Evidence, Principal, PublicResponse } from "@autograb/contracts";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  agentEvidence,
  agentRequests,
  catalogue,
  dealerships,
  demoPrincipals,
  inventory,
  principalDealerships,
  regions,
  valuations,
} from "./schema.js";

export interface InventoryRow {
  vehicleId: string;
  dealershipId: string;
  priceCents: number;
  stockedAt: Date;
  salesperson: string | null;
  sourceTime: Date;
  fetchedAt: Date;
}

export interface ValuationRow {
  vehicleId: string;
  marketValueCents: number;
  segment: string | null;
  sourceTime: Date;
  fetchedAt: Date;
}

export interface CatalogueRow {
  vehicleId: string;
  make: string;
  model: string;
  badge: string | null;
  series: string | null;
  specifications: unknown;
  sourceVersion: string;
  sourceTime: Date;
  fetchedAt: Date;
}

export interface NameResolution {
  type: "dealership" | "region";
  id: string;
  displayName: string;
  dealershipIds: string[];
}

export interface QueryContext {
  signal: AbortSignal;
  maxRows: number;
}

export interface AuditRecord {
  response: PublicResponse;
  request: { principalId: string; question: string; scenario: string };
  model: string;
}

export interface AutoGrabRepository {
  listPrincipals(): Promise<Principal[]>;
  getPrincipal(id: string): Promise<Principal | null>;
  resolveScope(term: string, type: "dealership" | "region"): Promise<NameResolution | null>;
  getInventory(scope: AuthorisedScope, context: QueryContext): Promise<InventoryRow[]>;
  getValuations(scope: AuthorisedScope, vehicleIds: string[] | null, context: QueryContext): Promise<ValuationRow[]>;
  getCatalogue(scope: AuthorisedScope, vehicleIds: string[], context: QueryContext): Promise<CatalogueRow[]>;
  persistAudit(record: AuditRecord): Promise<void>;
}

function assertScope(scope: AuthorisedScope): void {
  if (scope.dealershipIds.length === 0) throw new Error("Authorised scope cannot be empty");
}

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Request aborted");
}

export class NeonRepository implements AutoGrabRepository {
  constructor(private readonly db: Database) {}

  async listPrincipals(): Promise<Principal[]> {
    const rows = await this.db.select().from(demoPrincipals).where(eq(demoPrincipals.active, true));
    return Promise.all(rows.map(async (row) => (await this.getPrincipal(row.id))!));
  }

  async getPrincipal(id: string): Promise<Principal | null> {
    const [principal] = await this.db.select().from(demoPrincipals).where(and(eq(demoPrincipals.id, id), eq(demoPrincipals.active, true))).limit(1);
    if (!principal) return null;
    const allowed = await this.db.select({ id: principalDealerships.dealershipId }).from(principalDealerships).where(eq(principalDealerships.principalId, id));
    return { id: principal.id, name: principal.name, description: principal.description, dealershipIds: allowed.map((row) => row.id) };
  }

  async resolveScope(term: string, type: "dealership" | "region"): Promise<NameResolution | null> {
    const normalised = term.trim().toLowerCase();
    if (type === "dealership") {
      const all = await this.db.select().from(dealerships);
      const match = all.find((row) => row.name.toLowerCase() === normalised);
      return match ? { type, id: match.id, displayName: match.name, dealershipIds: [match.id] } : null;
    }
    const allRegions = await this.db.select().from(regions);
    const match = allRegions.find((row) => row.name.toLowerCase() === normalised || row.code.toLowerCase() === normalised);
    if (!match) return null;
    const sites = await this.db.select({ id: dealerships.id }).from(dealerships).where(eq(dealerships.regionId, match.id));
    return { type, id: match.id, displayName: match.name, dealershipIds: sites.map((row) => row.id) };
  }

  async getInventory(scope: AuthorisedScope, context: QueryContext): Promise<InventoryRow[]> {
    assertScope(scope); checkSignal(context.signal);
    return this.db.select({
      vehicleId: inventory.vehicleId, dealershipId: inventory.dealershipId, priceCents: inventory.priceCents,
      stockedAt: inventory.stockedAt, salesperson: inventory.salesperson, sourceTime: inventory.sourceTime, fetchedAt: inventory.fetchedAt,
    }).from(inventory).where(and(inArray(inventory.dealershipId, scope.dealershipIds), eq(inventory.status, "active"))).limit(context.maxRows);
  }

  async getValuations(scope: AuthorisedScope, vehicleIds: string[] | null, context: QueryContext): Promise<ValuationRow[]> {
    assertScope(scope); checkSignal(context.signal);
    if (vehicleIds?.length === 0) return [];
    const predicate = vehicleIds
      ? and(inArray(inventory.dealershipId, scope.dealershipIds), inArray(valuations.vehicleId, vehicleIds.slice(0, context.maxRows)))
      : inArray(inventory.dealershipId, scope.dealershipIds);
    return this.db.select({
      vehicleId: valuations.vehicleId, marketValueCents: valuations.marketValueCents, segment: valuations.segment,
      sourceTime: valuations.sourceTime, fetchedAt: valuations.fetchedAt,
    }).from(valuations).innerJoin(inventory, eq(inventory.vehicleId, valuations.vehicleId)).where(predicate).limit(context.maxRows);
  }

  async getCatalogue(scope: AuthorisedScope, vehicleIds: string[], context: QueryContext): Promise<CatalogueRow[]> {
    assertScope(scope); checkSignal(context.signal);
    if (vehicleIds.length === 0) return [];
    return this.db.select({
      vehicleId: catalogue.vehicleId, make: catalogue.make, model: catalogue.model, badge: catalogue.badge,
      series: catalogue.series, specifications: catalogue.specifications, sourceVersion: catalogue.sourceVersion,
      sourceTime: catalogue.sourceTime, fetchedAt: catalogue.fetchedAt,
    }).from(catalogue).innerJoin(inventory, eq(inventory.vehicleId, catalogue.vehicleId)).where(and(
      inArray(inventory.dealershipId, scope.dealershipIds), inArray(catalogue.vehicleId, vehicleIds.slice(0, context.maxRows)),
    )).limit(context.maxRows);
  }

  async persistAudit({ response, request, model }: AuditRecord): Promise<void> {
    await this.db.insert(agentRequests).values({
      id: response.requestId, principalId: request.principalId, question: request.question, scenario: request.scenario,
      plan: response.plan, status: response.status, model, durationMs: String(response.timingsMs.total), validationPassed: response.validation.passed,
    });
    if (response.evidence.length) await this.db.insert(agentEvidence).values(response.evidence.map((item) => ({
      requestId: response.requestId, evidenceId: item.id, source: item.source, label: item.label, detail: item.detail,
      sourceTime: new Date(item.sourceTime),
    })));
  }
}

export interface DemoData {
  principals: Principal[];
  resolutions: NameResolution[];
  inventory: InventoryRow[];
  valuations: ValuationRow[];
  catalogue: CatalogueRow[];
}

export interface InMemoryRepositoryOptions {
  /** Keep the credential-free reviewer demo fresh while the API remains open. */
  keepFresh?: boolean;
  now?: () => Date;
}

export class InMemoryRepository implements AutoGrabRepository {
  readonly calls = { inventory: 0, valuation: 0, catalogue: 0, audit: 0 };
  readonly audits: AuditRecord[] = [];
  private readonly keepFresh: boolean;
  private readonly now: () => Date;

  constructor(readonly data: DemoData, options: InMemoryRepositoryOptions = {}) {
    this.keepFresh = options.keepFresh ?? false;
    this.now = options.now ?? (() => new Date());
  }

  private currentTimestamps() {
    const fetchedAt = this.now();
    return { sourceTime: new Date(fetchedAt.getTime() - 30_000), fetchedAt };
  }

  async listPrincipals() { return structuredClone(this.data.principals); }
  async getPrincipal(id: string) { return structuredClone(this.data.principals.find((item) => item.id === id) ?? null); }
  async resolveScope(term: string, type: "dealership" | "region") {
    return structuredClone(this.data.resolutions.find((item) => item.type === type && item.displayName.toLowerCase() === term.trim().toLowerCase()) ?? null);
  }
  async getInventory(scope: AuthorisedScope, context: QueryContext) {
    assertScope(scope); checkSignal(context.signal); this.calls.inventory += 1;
    const rows = this.data.inventory.filter((row) => scope.dealershipIds.includes(row.dealershipId)).slice(0, context.maxRows);
    return this.keepFresh ? rows.map((row) => ({ ...row, ...this.currentTimestamps() })) : rows;
  }
  async getValuations(scope: AuthorisedScope, ids: string[] | null, context: QueryContext) {
    assertScope(scope); checkSignal(context.signal); this.calls.valuation += 1;
    const allowedVehicles = new Set(this.data.inventory.filter((row) => scope.dealershipIds.includes(row.dealershipId)).map((row) => row.vehicleId));
    const rows = this.data.valuations.filter((row) => (ids === null || ids.includes(row.vehicleId)) && allowedVehicles.has(row.vehicleId)).slice(0, context.maxRows);
    return this.keepFresh ? rows.map((row) => ({ ...row, ...this.currentTimestamps() })) : rows;
  }
  async getCatalogue(scope: AuthorisedScope, ids: string[], context: QueryContext) {
    assertScope(scope); checkSignal(context.signal); this.calls.catalogue += 1;
    const allowedVehicles = new Set(this.data.inventory.filter((row) => scope.dealershipIds.includes(row.dealershipId)).map((row) => row.vehicleId));
    const rows = this.data.catalogue.filter((row) => ids.includes(row.vehicleId) && allowedVehicles.has(row.vehicleId)).slice(0, context.maxRows);
    return this.keepFresh ? rows.map((row) => ({ ...row, ...this.currentTimestamps() })) : rows;
  }
  async persistAudit(record: AuditRecord) { this.calls.audit += 1; this.audits.push(structuredClone(record)); }
}

export function makeDemoData(now = new Date()): DemoData {
  const minuteAgo = new Date(now.getTime() - 60_000);
  const day = 86_400_000;
  const inventoryRows: InventoryRow[] = [
    ["V001", "d-sydney-central", 5_500_000, 90, "Alex"],
    ["V002", "d-sydney-central", 4_200_000, 75, "Morgan"],
    ["V003", "d-sydney-central", 3_000_000, 20, null],
    ["V004", "d-newcastle", 4_500_000, 100, "Sam"],
    ["V005", "d-parramatta", 4_500_000, 100, "Lee"],
    ["V999", "d-melbourne", 9_900_000, 400, "Outside"],
  ].map(([vehicleId, dealershipId, priceCents, days, salesperson]) => ({
    vehicleId: String(vehicleId), dealershipId: String(dealershipId), priceCents: Number(priceCents),
    stockedAt: new Date(now.getTime() - Number(days) * day), salesperson: salesperson === null ? null : String(salesperson),
    sourceTime: minuteAgo, fetchedAt: now,
  }));
  const valuationRows: ValuationRow[] = [
    ["V001", 4_500_000], ["V002", 4_000_000], ["V003", 0], ["V004", 4_000_000], ["V005", 4_000_000], ["V999", 1_000_000],
  ].map(([vehicleId, marketValueCents]) => ({ vehicleId: String(vehicleId), marketValueCents: Number(marketValueCents), segment: "demo", sourceTime: minuteAgo, fetchedAt: now }));
  const catalogueRows: CatalogueRow[] = [
    ["V001", "Toyota", "RAV4"], ["V002", "Ford", "Ranger"], ["V004", "Toyota", "Corolla"], ["V005", "Toyota", "Camry"], ["V999", "Secret", "Leak"],
  ].map(([vehicleId, make, model]) => ({ vehicleId: String(vehicleId), make: String(make), model: String(model), badge: null, series: null, specifications: {}, sourceVersion: "demo-v1", sourceTime: minuteAgo, fetchedAt: now }));
  return {
    principals: [
      { id: "head-office-analyst", name: "Head office analyst", description: "All 50 demo sites", dealershipIds: ["d-sydney-central", "d-newcastle", "d-parramatta", "d-melbourne"] },
      { id: "nsw-regional-manager", name: "NSW regional manager", description: "NSW demo sites only", dealershipIds: ["d-sydney-central", "d-newcastle", "d-parramatta"] },
      { id: "sydney-central-manager", name: "Sydney Central manager", description: "One demo site", dealershipIds: ["d-sydney-central"] },
    ],
    resolutions: [
      { type: "dealership", id: "d-sydney-central", displayName: "Sydney Central", dealershipIds: ["d-sydney-central"] },
      { type: "dealership", id: "d-newcastle", displayName: "Newcastle", dealershipIds: ["d-newcastle"] },
      { type: "dealership", id: "d-melbourne", displayName: "Melbourne Central", dealershipIds: ["d-melbourne"] },
      { type: "region", id: "r-nsw", displayName: "NSW", dealershipIds: ["d-sydney-central", "d-newcastle", "d-parramatta"] },
      { type: "region", id: "r-vic", displayName: "VIC", dealershipIds: ["d-melbourne"] },
    ],
    inventory: inventoryRows, valuations: valuationRows, catalogue: catalogueRows,
  };
}

export function evidenceRows(evidence: Evidence[]) { return evidence; }
