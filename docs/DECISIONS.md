# Decisions

## POC scope

- Stock ageing, market pricing and regional model ageing are included because the available inventory, valuation and catalogue data can support them directly.
- Sales conversion, revenue, leads and CRM outcomes need additional data. Write operations, arbitrary SQL, open-ended tools, memory and production identity are outside this prototype. Assigned-stock workload and ageing are the salesperson-adjacent measures the current data can support.
- The POC uses a focused single workflow. TypeScript owns authorisation, source selection, reads, calculations, freshness, evidence, validation and budgets. The model interprets questions and phrases already-validated facts; when the evidence is insufficient, the workflow explains what is missing.

## Architecture

- A pnpm workspace contains `apps/web`, `apps/api`, and the `contracts`, `db`, `domain`, and `orchestrator` packages.
- Web and API are separate Vercel projects rooted at `apps/web` and `apps/api`; the browser receives only the public API base URL.
- Zod is the runtime schema source of truth. A Python/Pydantic service was considered, but Zod provides one consistent validation model across this TypeScript-only solution.
- OpenAI's Responses API is called only from the two focused model nodes. `MODEL_MODE=mock` supports credential-free verification.
- Drizzle and the Neon serverless driver form the production data layer. A deterministic in-memory repository implements the same scoped interface for local tests and the credential-free demo.

## Data safety and freshness

- Repository reads require an authorised scope and filter by its dealership IDs. Scope checks happen before retrieval and again at the query boundary.
- Inventory and valuation older than 30 days need refreshing under the reviewer-demo policy. The UI displays the effective age and limit, and the explicit demo conditions provide predictable ways to explore these paths. Catalogue validity is version/presence based.
- Catalogue reads are lazy and batched by inventory `vehicle_id` values.
- The source ceiling is 10,000 rows, which covers every 10-site demo region. Adapters request one sentinel row beyond the ceiling and explain when a complete result is unavailable rather than presenting partial regional analytics as complete.
- Required-source freshness and availability are validated before analytics. Source metadata remains visible for review, but out-of-date rows do not produce metrics, facts or evidence.
- Material answer bullets must cite returned evidence IDs; unknown IDs invalidate the model answer and trigger a deterministic fallback.

## Source-document reconciliation

The source DOCX and PDF named by the execution prompt were not present in the repository. The execution prompt and historical implementation plan therefore guided the build. No conflicts were observed between them.

## Alternatives considered and why they were not selected for this POC

- A Python/Pydantic service was considered, but a TypeScript-only implementation provides one consistent runtime, deployment model and validation layer across graph, API and UI boundaries.
- ReAct, model-selected tools, generated SQL and database tool access were considered, but the fixed authorisation and source map better fit this focused dealership workflow.
- Calling catalogue for every query was considered, but catalogue is useful only for model/specification semantics and is therefore fetched lazily in a bounded vehicle-ID batch.
- Model-calculated metrics and rankings were considered, but unit-tested TypeScript arithmetic and explicit tie-breakers make the results easier to verify.
- Running migrations during API startup was considered, but explicit release operations give schema changes a clearer review and rollback point.
- A Next.js proxy/API route was considered, but separate web and Fastify projects make the trust and deployment boundary visible.
- Browser-editable freshness overrides were considered, but a server-owned 30-day reviewer policy keeps the normal path stable. Explicit demo conditions still show how the workflow handles data that needs refreshing, and `db:refresh-freshness` remains available when fixture timestamps genuinely need renewal.

## Compatibility and delivery deviations

- TypeScript `latest` resolved to 7.0.2, beyond the installed `typescript-eslint` peer range. `~6.0.2` is pinned and resolved to compatible 6.0.3.
- The API production build is a strict source/type build because Vercel consumes the TypeScript Fastify entrypoint directly; no extra bundler was introduced.
- Playwright and OpenAPI are P1 and were not added after all P0 behavior was covered through graph, Fastify inject, production build, and local endpoint smoke checks.
- Live Neon, OpenAI, and Vercel verification is credential/account-gated. The local mock path is not represented as a production deployment or SLA.
