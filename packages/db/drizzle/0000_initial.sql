CREATE TABLE "regions" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "dealerships" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "region_id" text NOT NULL REFERENCES "regions"("id")
);
--> statement-breakpoint
CREATE INDEX "dealerships_region_idx" ON "dealerships" ("region_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "dealerships_name_idx" ON "dealerships" ("name");
--> statement-breakpoint
CREATE TABLE "demo_principals" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principal_dealerships" (
  "principal_id" text NOT NULL REFERENCES "demo_principals"("id") ON DELETE CASCADE,
  "dealership_id" text NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  PRIMARY KEY ("principal_id", "dealership_id")
);
--> statement-breakpoint
CREATE INDEX "principal_dealerships_dealership_idx" ON "principal_dealerships" ("dealership_id");
--> statement-breakpoint
CREATE TABLE "inventory" (
  "vehicle_id" text PRIMARY KEY NOT NULL,
  "dealership_id" text NOT NULL REFERENCES "dealerships"("id"),
  "status" text NOT NULL,
  "price_cents" integer NOT NULL CHECK ("price_cents" >= 0),
  "stocked_at" timestamptz NOT NULL,
  "salesperson" text,
  "source_time" timestamptz NOT NULL,
  "fetched_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_dealership_status_idx" ON "inventory" ("dealership_id", "status");
--> statement-breakpoint
CREATE INDEX "inventory_source_time_idx" ON "inventory" ("source_time");
--> statement-breakpoint
CREATE INDEX "inventory_stocked_at_idx" ON "inventory" ("stocked_at");
--> statement-breakpoint
CREATE TABLE "valuations" (
  "vehicle_id" text PRIMARY KEY NOT NULL REFERENCES "inventory"("vehicle_id") ON DELETE CASCADE,
  "market_value_cents" integer NOT NULL CHECK ("market_value_cents" >= 0),
  "segment" text,
  "source_time" timestamptz NOT NULL,
  "fetched_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "valuations_source_time_idx" ON "valuations" ("source_time");
--> statement-breakpoint
CREATE TABLE "catalogue" (
  "vehicle_id" text PRIMARY KEY NOT NULL REFERENCES "inventory"("vehicle_id") ON DELETE CASCADE,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "badge" text,
  "series" text,
  "specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_version" text NOT NULL,
  "source_time" timestamptz NOT NULL,
  "fetched_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "catalogue_make_model_idx" ON "catalogue" ("make", "model");
--> statement-breakpoint
CREATE TABLE "agent_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "principal_id" text NOT NULL REFERENCES "demo_principals"("id"),
  "question" text NOT NULL,
  "scenario" text NOT NULL,
  "plan" jsonb,
  "status" text NOT NULL,
  "model" text NOT NULL,
  "duration_ms" numeric NOT NULL,
  "validation_passed" boolean NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_requests_principal_created_idx" ON "agent_requests" ("principal_id", "created_at");
--> statement-breakpoint
CREATE TABLE "agent_evidence" (
  "request_id" uuid NOT NULL REFERENCES "agent_requests"("id") ON DELETE CASCADE,
  "evidence_id" text NOT NULL,
  "source" text NOT NULL,
  "label" text NOT NULL,
  "detail" text NOT NULL,
  "source_time" timestamptz NOT NULL,
  PRIMARY KEY ("request_id", "evidence_id")
);
--> statement-breakpoint
