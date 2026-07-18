# Decisions

## POC scope

- Supported intents are stock ageing, market pricing, and regional model ageing.
- Sales conversion, revenue, leads, CRM outcomes, write operations, arbitrary SQL, open-ended tools, memory, and production identity are excluded. Assigned-stock workload and ageing are the only salesperson-adjacent measures the available data can support.
- The POC uses a bounded single workflow. TypeScript owns authorisation, source selection, reads, calculations, freshness, evidence, validation, budgets, and refusal. The model may only interpret a question and phrase already-validated facts.

## Architecture

- A pnpm workspace contains `apps/web`, `apps/api`, and the `contracts`, `db`, `domain`, and `orchestrator` packages.
- Web and API are separate Vercel projects rooted at `apps/web` and `apps/api`; the browser receives only the public API base URL.
- Zod is the runtime schema source of truth. Pydantic was rejected because the solution is TypeScript-only.
- OpenAI's Responses API is called only from the two bounded model nodes. `MODEL_MODE=mock` supports credential-free verification.
- Drizzle and the Neon serverless driver form the production data layer. A deterministic in-memory repository implements the same scoped interface for local tests and the credential-free demo.

## Data safety and freshness

- Repository reads require an authorised scope and filter by its dealership IDs. Scope checks happen before retrieval and again at the query boundary.
- Inventory and valuation older than 30 days are stale under the reviewer-demo policy. Required stale sources fail closed, and the UI displays the effective age and limit without allowing browser-side policy edits. Explicit stale-inventory and stale-valuation scenarios provide deterministic refusal paths. Catalogue validity is version/presence based.
- Catalogue reads are lazy and batched by inventory `vehicle_id` values.
- Material answer bullets must cite returned evidence IDs; unknown IDs invalidate the model answer and trigger a deterministic fallback.

## Source-document reconciliation

The source DOCX and PDF named by the execution prompt were not present in the repository. The implementation plan is therefore authoritative. No conflicts were observed between it and the execution prompt.

## Rejected alternatives

- A Python/Pydantic service was rejected because it duplicates runtime and deployment concerns; Zod covers graph, API, and UI boundaries in TypeScript.
- ReAct, model-selected tools, generated SQL, and database tool access were rejected because they weaken the fixed authorisation and source map.
- Calling catalogue for every query was rejected; it is useful only for model/specification semantics and is fetched lazily by bounded vehicle-ID batch.
- Model-calculated metrics and rankings were rejected in favour of unit-tested TypeScript arithmetic and explicit tie-breakers.
- Running migrations during API startup was rejected because schema changes must be explicit release operations.
- A Next.js proxy/API route was rejected for the POC; separate web and Fastify projects make the trust/deployment boundary visible.
- Browser-editable or unbounded freshness overrides were rejected. A server-owned 30-day reviewer policy keeps the normal path stable, while explicit stale scenarios preserve deterministic refusal demonstrations. `db:refresh-freshness` remains available when the underlying fixture timestamps genuinely need renewal.

## Compatibility and delivery deviations

- TypeScript `latest` resolved to 7.0.2, beyond the installed `typescript-eslint` peer range. `~6.0.2` is pinned and resolved to compatible 6.0.3.
- The API production build is a strict source/type build because Vercel consumes the TypeScript Fastify entrypoint directly; no extra bundler was introduced.
- Playwright and OpenAPI are P1 and were not added after all P0 behavior was covered through graph, Fastify inject, production build, and local endpoint smoke checks.
- Live Neon, OpenAI, and Vercel verification is credential/account-gated. The local mock path is not represented as a production deployment or SLA.
