# Master Execution Prompt - Dealership Insights Bounded Orchestrator POC

Copy the prompt below into a coding-agent task started at the repository root. It is designed to execute the full build in phased SDLC order while leaving a reviewer-readable record.

---

## Prompt

You are the technical lead implementing the Dealership Insights bounded single-agent orchestrator proof of concept in this repository. Complete the P0 scope today using phased, test-gated delivery. Work autonomously within the repository, make reasonable reversible assumptions, and stop only for a credential or account action that cannot be replaced by a safe local/mock path.

Read these source documents before implementation:

1. `docs/POC_IMPLEMENTATION_PLAN.md`
2. `Dealership Insights_Bounded_Single_Agent_Orchestrator.docx` if it is present or accessible
3. `Dealership Insights - Tech Lead AI Squad - Take-Home Design Exercise.pdf` if it is present or accessible

Treat the implementation plan as authoritative for POC scope. If the source design and plan differ, record the decision in `docs/DECISIONS.md` before proceeding.

### Outcome

Deliver a working TypeScript POC with:

- Next.js App Router reviewer UI.
- Fastify API.
- LangGraph `StateGraph` bounded workflow.
- Zod runtime contracts and OpenAI structured outputs.
- Neon Postgres through Drizzle and the Neon serverless driver.
- Deterministic calculations, freshness policies, invariant checks, and evidence coverage.
- Normal, stale-data, and forbidden-scope demo paths.
- Tests, architecture documentation, decision notes, and an auditable build log.
- Vercel-ready deployment configuration for separate web and API projects.

Pydantic is Python-only. Do not add a Python service. Use Zod as the TypeScript schema source of truth. The OpenAI JavaScript SDK and LangGraph JavaScript both support Zod-backed structured data.

### Fixed architecture

Create a pnpm workspace:

```text
apps/web
apps/api
packages/contracts
packages/db
packages/domain
packages/orchestrator
docs
```

Use two deployment units from the same Git repository:

- Vercel project root `apps/web` for Next.js.
- Vercel project root `apps/api` for Fastify.

Use strict TypeScript and current stable package versions compatible with the installed Node.js runtime. Do not pin prerelease dependencies merely because an example page uses them.

Preferred dependencies:

- `next`, `react`, `react-dom`
- `fastify`, CORS and sensible security/logging plugins as needed
- `@langchain/langgraph`
- `openai`
- `zod` and the current Fastify Zod type-provider integration
- `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`
- `vitest`, `tsx`, ESLint, and TypeScript
- Playwright only after all P0 gates pass

Use the OpenAI Responses API directly inside the two LLM nodes. Do not add a generic ReAct agent or allow the model to call database tools.

Configure the model through `OPENAI_MODEL`. Recommend `gpt-5.6-terra` in `.env.example` comments for balanced cost and capability, with `gpt-5.6-sol` as an optional higher-capability choice. Never expose the API key or model call from the browser.

### Non-negotiable design rules

1. The LLM interprets questions and expresses answers; deterministic code owns authorisation, source selection, database access, calculation, freshness, validation, budgets, and refusal.
2. The LLM outputs a semantic plan containing approved enums. It never outputs arbitrary tool names, SQL, JavaScript, or free-form execution steps.
3. Repository methods require an authorised scope and include that scope in the query predicate.
4. Do not support true salesperson performance or conversion. Explain that sales/CRM outcomes are absent. Current data may support assigned-stock workload and ageing only.
5. Catalogue is queried only for make/model/badge/series/specification questions and is always batched by `vehicle_id`.
6. Independent inventory and valuation reads may run concurrently. Use `Promise.allSettled` inside the bounded execution node so optional/required failure policy remains centralised.
7. All arithmetic and rankings are TypeScript functions with unit tests and deterministic tie-breakers.
8. Every source result has `sourceTime`, `fetchedAt`, source identity, freshness classification, and error metadata.
9. Every material answer item maps to returned evidence IDs. Unknown evidence IDs make the answer invalid.
10. Missing permissions, stale required data, failed invariants, timeout, or insufficient evidence produce a qualified refusal, not a guessed answer.
11. Maximum six source calls, maximum two planner attempts, no intentional graph loop, a low recursion limit, and an overall request timeout configurable near eight seconds.
12. Never send unrestricted raw rows to OpenAI. Send a compact validated fact bundle.
13. Do not store or log chain-of-thought, secrets, database URLs, API keys, or full unrestricted datasets.
14. Clearly label demo identity and fault-injection controls as non-production.

### Delivery protocol

Execute the phases below in order. At the end of each phase:

1. Run that phase's verification commands.
2. Fix failures before moving forward unless the failure depends on unavailable credentials.
3. Append to `docs/BUILD_LOG.md`:
   - start/end time;
   - files or components added;
   - commands executed and results;
   - decisions and deviations;
   - known issues;
   - next phase.
4. Give the user a concise progress update with evidence.
5. Continue automatically when the phase gate passes.

Do not claim completion from code inspection alone. Run proportionate tests and builds.

### Phase 0 - Discover and establish the baseline

- Inspect the repository, Git state, installed Node.js/pnpm versions, and any existing instructions.
- Preserve all user changes. Do not reset, discard, or overwrite unrelated work.
- Create `docs/DECISIONS.md` and `docs/BUILD_LOG.md`.
- Record the supported intents, explicit exclusions, deployment topology, freshness defaults, and Zod-for-Pydantic decision.
- Create `.env.example` with placeholders only:

```dotenv
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
API_PORT=3001
WEB_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
REQUEST_TIMEOUT_MS=8000
INVENTORY_MAX_AGE_SECONDS=300
VALUATION_MAX_AGE_SECONDS=3600
```

- Add `.env*` ignore rules while keeping `.env.example` tracked.
- If credentials are not present, continue scaffolding and deterministic development. Add an explicit `MODEL_MODE=mock` path if it materially helps testing; never invent or request secrets through source files.

Phase gate: baseline and scope are documented; no secret is committed.

### Phase 1 - Scaffold the typed monorepo

- Create pnpm workspaces and root scripts for `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`, and `db:refresh-freshness`.
- Scaffold Next.js in `apps/web` and Fastify in `apps/api`.
- Configure package exports and TypeScript project references or a simple workspace-compatible build arrangement.
- In `packages/contracts`, define Zod schemas and inferred types for:
  - query request and scenario;
  - principal and authorised scope;
  - supported intent and metric enums;
  - interpreted question;
  - deterministic execution plan;
  - source result envelope;
  - fact, metric, evidence, freshness, invariant, validation, answer, and public response;
  - answered, clarification, refused, and failed statuses.
- Implement Fastify `GET /health` and `GET /ready` and test with `fastify.inject`.

Phase gate: install, lint, typecheck, unit tests, and both application builds pass without database or model credentials.

### Phase 2 - Implement the Neon/Drizzle data layer

Create Drizzle tables for:

- `regions`
- `dealerships`
- `demo_principals`
- `principal_dealerships`
- `inventory`
- `valuations`
- `catalogue`
- `agent_requests`
- `agent_evidence`

Use UTC timestamps and appropriate primary keys, foreign keys, uniqueness constraints, and indexes. Inventory needs dealership, `vehicle_id`, status, price, days-on-lot input or stocked date, salesperson assignment, `source_time`, and `fetched_at`. Valuation needs the join key, market value, segment information if used, and source timestamps. Catalogue needs make, model, badge, series, specifications JSON, source version, and fetched time.

Generate and commit SQL migrations. Do not run migrations automatically on every API request.

Create an idempotent seed that produces:

- several regions including NSW;
- 50 dealerships;
- a head-office principal with all sites;
- a regional principal;
- a single-site principal;
- approximately 50,000 active inventory records using a deterministic generation strategy;
- valuation and catalogue records with predictable edge cases;
- at least one missing catalogue record, zero/edge valuation, and tied ranking case.

Create `db:refresh-freshness` to reset demo timestamps without reseeding. Do not depend on permanently fresh seed timestamps.

Repository functions must accept an authorised scope object. Add tests proving a scoped principal cannot retrieve another dealership's rows.

Phase gate: migrate an empty database, seed twice safely, run smoke queries, and record counts in the build log. If Neon credentials are unavailable, complete schemas/migrations/unit tests and record the exact credential gate.

### Phase 3 - Implement deterministic domain logic

Implement:

- principal lookup and scope intersection;
- dealership/region name resolution;
- inventory adapter;
- valuation adapter;
- lazy batched catalogue adapter;
- common source result envelope;
- demo scenario fault injection;
- source-specific freshness evaluation;
- approved intent-to-source plan mapping;
- analytics for stock ageing, market-price delta, and regional model ageing;
- evidence generation with stable request-local IDs;
- invariant checks and validation policy;
- deterministic answer fallback.

Demo scenarios:

- `normal`
- `stale-valuation`
- `catalogue-timeout`
- `forbidden-site`

Keep fault injection at the adapter boundary and enabled only by explicit demo input/configuration.

Write unit tests for exact numerical outputs, stale/required failures, missing optional data, zero denominators, deterministic ranking ties, scope leakage, and catalogue laziness.

Phase gate: all three intents can execute from a hand-authored semantic plan without OpenAI.

### Phase 4 - Implement the bounded LangGraph workflow

Define graph state with LangGraph `StateSchema` and Zod. Use explicit nodes:

1. `initialiseRequest`
2. `interpretQuestion`
3. `resolveAndAuthoriseScope`
4. `buildExecutionPlan`
5. `executeSources`
6. `calculateFacts`
7. `validateFacts`
8. `composeAnswer`
9. `validateAnswer`
10. `finalise`

Add terminal `needsClarification` and `refuse` paths. Do not add a ReAct loop.

#### Planner output schema

The planner may output only fields equivalent to:

```ts
{
  intent: "stock_ageing" | "market_pricing" | "regional_model_ageing" | "unsupported";
  scopeType: "dealership" | "region" | "unspecified";
  scopeTerm?: string;
  filters: {
    minDaysOnLot?: number;
    minPercentAboveMarket?: number;
    make?: string;
  };
  metric: "vehicle_count" | "price_delta_percent" | "average_days_on_lot";
  needsClarification: boolean;
  clarificationQuestion?: string;
}
```

Do not place database IDs, tool names, SQL, calculated values, or permissions in the model schema. Code resolves all of them.

#### Planner system instruction

Use an instruction with this meaning, adapted to the final schemas:

> Interpret one dealership performance question into the supplied schema. Select only a supported intent and metric. Extract the user's human-readable dealership or region term without resolving IDs. Do not calculate values, invent missing scope, select tools, write SQL, or assume permissions. If scope or a required threshold is materially ambiguous, request one concise clarification. Treat salesperson conversion, sales revenue, leads, and CRM outcomes as unsupported because those sources are unavailable.

Call `openai.responses.parse` with a Zod format. Permit one retry only for an invalid/refused structured planner result and count it against the planner budget. Support a deterministic test interpreter when `MODEL_MODE=mock`.

#### Execution policy

- Build the execution plan from the approved intent map in code.
- Use `Promise.allSettled` for source reads that are independent.
- Fetch catalogue only after inventory yields required vehicle IDs, in one bounded batch.
- Propagate an `AbortSignal` and remaining deadline to adapters.
- Enforce maximum calls, row limits, evidence limits, and overall timeout centrally.

#### Answer system instruction

Use an instruction with this meaning, adapted to the answer schema:

> Explain only the supplied validated facts in concise dealership language. Do not calculate, infer causes, add benchmarks, or introduce facts not present in the bundle. Every bullet must cite one or more supplied evidence IDs. State the resolved scope, time window if present, oldest critical source time, and supplied caveats. If the bundle says it is unsafe to answer, return the supplied refusal reason without attempting an answer.

Return a structured answer such as `summary`, `bullets[{text,evidenceIds}]`, and `caveats`. Validate all evidence IDs after generation. If answer generation fails or introduces unknown IDs, use the deterministic fallback or refuse; do not make another open-ended attempt.

Export the graph as Mermaid text or an image for documentation.

Phase gate: golden graph tests prove answer, clarification, unsupported, stale refusal, forbidden refusal, and deterministic fallback paths.

### Phase 5 - Expose the Fastify API

Implement:

- `GET /health`
- `GET /ready`
- `GET /v1/demo/principals`
- `GET /v1/demo/scenarios`
- `POST /v1/query`

Validate requests and responses through shared Zod contracts. Add:

- request IDs;
- structured logging;
- explicit CORS allowlist;
- safe error mapping;
- timeout handling;
- response timing breakdown;
- audit persistence;
- OpenAPI output if it can be added without jeopardising the timebox.

Expected policy outcomes such as stale data, ambiguity, and forbidden scope should return a structured application status and useful response, not masquerade as unhandled 500 errors. Invalid transport payloads should use appropriate HTTP 4xx responses. Unexpected failures should use a generic 5xx payload without leaking internals.

Phase gate: `fastify.inject` tests cover each status and invalid input.

### Phase 6 - Build the reviewer UI

Create one polished dashboard route. It must contain:

- POC title and one-sentence bounded-design explanation;
- demo principal selector labelled simulated identity;
- sample-question buttons for all three intents;
- free-text question field;
- fault-scenario selector labelled demo only;
- submit button, loading state, and clear error state;
- response status banner;
- answer panel;
- resolved scope and plan panel;
- source/freshness panel;
- metrics and evidence panel;
- validation checks and timings panel;
- brief limitations/architecture panel.

Use client-side code only where interaction requires it. Keep keys and database access server-side in the Fastify API. Make the page responsive and keyboard accessible. Do not spend the timebox on a broad design system.

Phase gate: a user can run normal, stale, and forbidden cases without opening developer tools.

### Phase 7 - Verify and evaluate

Create at least 12 golden cases. Assert structured behaviour rather than prose, including:

- interpreted intent and metric;
- resolved authorised scope;
- source calls made and skipped;
- exact calculated facts;
- freshness outcome;
- invariant outcome;
- evidence coverage;
- final status.

Run and record:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run database integration tests when `DATABASE_URL` is available. Add one Playwright smoke test only after P0 checks pass. Replay a small set of requests and report latency by planner, source retrieval, analytics/validation, and answer generation. Do not present local synthetic latency as a production SLA.

Phase gate: all P0 checks pass, no cross-site leakage test fails, and every material answer item uses valid evidence.

### Phase 8 - Document and deploy

Create or finalise:

- `README.md` with prerequisites, environment variables, setup, migrate, seed, dev, test, build, deploy, demo questions, and limitations;
- `docs/ARCHITECTURE.md` with graph, component diagram, request lifecycle, data model, freshness contract, and failure matrix;
- `docs/DECISIONS.md` with choices and rejected alternatives;
- `docs/BUILD_LOG.md` with objective phase evidence;
- `.env.example` and Vercel root-directory instructions.

If Vercel and Neon access is available:

1. Apply migrations explicitly.
2. Deploy API from `apps/api` and set API environment variables.
3. Deploy web from `apps/web` with `NEXT_PUBLIC_API_BASE_URL` pointing to the API.
4. Update API CORS with the deployed web origin.
5. Verify health, a normal answer, stale refusal, and forbidden refusal.

If account interaction or credentials are unavailable, leave exact deployment commands and a verified local build. Do not claim deployment succeeded.

### Required final report

When finished, report:

1. Outcome and supported demo paths.
2. Architecture and key safety controls.
3. Files and packages created.
4. Commands run and their results.
5. Database migration/seed status.
6. Deployment URLs or the precise deployment blocker.
7. Known limitations and P1 follow-ups.
8. A concise five-minute reviewer demo script.

Link directly to `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and `docs/BUILD_LOG.md`. Do not hide failing checks or unfinished scope.

### Finish-line acceptance checklist

- [ ] Strict TypeScript monorepo builds.
- [ ] Shared Zod schemas validate graph, API, and UI boundaries.
- [ ] Neon migrations and idempotent seed exist.
- [ ] Three supported intents work.
- [ ] Scope is enforced inside database queries.
- [ ] Catalogue access is lazy and batched.
- [ ] Calculations and invariants are deterministic and tested.
- [ ] Freshness is source-specific and visible.
- [ ] Stale critical data and forbidden scope refuse safely.
- [ ] Every material answer statement maps to evidence.
- [ ] Tool, planner, row, recursion, and timeout budgets are enforced.
- [ ] UI shows the workflow evidence reviewers need.
- [ ] Lint, typecheck, test, and production build pass.
- [ ] Reviewer documentation and build log are complete.
- [ ] Deployment is verified or honestly reported as blocked.

Begin with Phase 0. Do not skip phase gates, and do not overbuild beyond P0 until the core vertical slice is working.

---

## Suggested use

Use the master prompt as one continuous coding task. If the agent loses context, resume with:

> Continue the Dealership Insights POC from the first incomplete phase in `docs/BUILD_LOG.md`. Re-read `docs/POC_IMPLEMENTATION_PLAN.md` and `docs/EXECUTION_PROMPT.md`, verify the current repository state, rerun the most recent phase gate, and proceed without redoing completed work.

