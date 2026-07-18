import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const utc = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const regions = pgTable("regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
});

export const dealerships = pgTable(
  "dealerships",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    regionId: text("region_id").notNull().references(() => regions.id),
  },
  (table) => [index("dealerships_region_idx").on(table.regionId), uniqueIndex("dealerships_name_idx").on(table.name)],
);

export const demoPrincipals = pgTable("demo_principals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
});

export const principalDealerships = pgTable(
  "principal_dealerships",
  {
    principalId: text("principal_id").notNull().references(() => demoPrincipals.id, { onDelete: "cascade" }),
    dealershipId: text("dealership_id").notNull().references(() => dealerships.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.principalId, table.dealershipId] }),
    index("principal_dealerships_dealership_idx").on(table.dealershipId),
  ],
);

export const inventory = pgTable(
  "inventory",
  {
    vehicleId: text("vehicle_id").primaryKey(),
    dealershipId: text("dealership_id").notNull().references(() => dealerships.id),
    status: text("status").notNull(),
    priceCents: integer("price_cents").notNull(),
    stockedAt: utc("stocked_at").notNull(),
    salesperson: text("salesperson"),
    sourceTime: utc("source_time").notNull(),
    fetchedAt: utc("fetched_at").notNull(),
  },
  (table) => [
    index("inventory_dealership_status_idx").on(table.dealershipId, table.status),
    index("inventory_source_time_idx").on(table.sourceTime),
    index("inventory_stocked_at_idx").on(table.stockedAt),
  ],
);

export const valuations = pgTable(
  "valuations",
  {
    vehicleId: text("vehicle_id").primaryKey().references(() => inventory.vehicleId, { onDelete: "cascade" }),
    marketValueCents: integer("market_value_cents").notNull(),
    segment: text("segment"),
    sourceTime: utc("source_time").notNull(),
    fetchedAt: utc("fetched_at").notNull(),
  },
  (table) => [index("valuations_source_time_idx").on(table.sourceTime)],
);

export const catalogue = pgTable(
  "catalogue",
  {
    vehicleId: text("vehicle_id").primaryKey().references(() => inventory.vehicleId, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    badge: text("badge"),
    series: text("series"),
    specifications: jsonb("specifications").notNull().default({}),
    sourceVersion: text("source_version").notNull(),
    sourceTime: utc("source_time").notNull(),
    fetchedAt: utc("fetched_at").notNull(),
  },
  (table) => [index("catalogue_make_model_idx").on(table.make, table.model)],
);

export const agentRequests = pgTable(
  "agent_requests",
  {
    id: uuid("id").primaryKey(),
    principalId: text("principal_id").notNull().references(() => demoPrincipals.id),
    question: text("question").notNull(),
    scenario: text("scenario").notNull(),
    plan: jsonb("plan"),
    status: text("status").notNull(),
    model: text("model").notNull(),
    durationMs: numeric("duration_ms").notNull(),
    validationPassed: boolean("validation_passed").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (table) => [index("agent_requests_principal_created_idx").on(table.principalId, table.createdAt)],
);

export const agentEvidence = pgTable(
  "agent_evidence",
  {
    requestId: uuid("request_id").notNull().references(() => agentRequests.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id").notNull(),
    source: text("source").notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull(),
    sourceTime: utc("source_time").notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.evidenceId] })],
);

