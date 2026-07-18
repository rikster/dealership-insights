# Build and verification record

All times are Australia/Sydney. Credential-dependent checks are explicitly distinguished from local gates.

## Summary

- **Implemented:** A TypeScript dealership-insights workflow, interactive reviewer site, Fastify API, scoped data layer, deterministic analytics and source-backed answer presentation.
- **Verified:** The current local gate passes lint, all six typechecks and 40/40 automated tests; the production build and 30-query synthetic replay are recorded below.
- **Current result:** The three supported dealership questions complete in local deterministic mode and in the recorded live Neon/OpenAI production smoke tests.
- **Outside the prototype:** Production identity, writes, CRM and transaction outcomes, generated SQL, memory and open-ended tool use.
- **Reproduce:** Follow the README quick start, then run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm replay`.

## Detailed build record (appendix)

## Phase 0 — discovery and baseline

- Start: 2026-07-18 07:39 AEST
- End: 2026-07-18 07:41 AEST
- Baseline: clean Git worktree containing `docs/EXECUTION_PROMPT.md` and `docs/POC_IMPLEMENTATION_PLAN.md`; no AGENTS.md, source DOCX, or source PDF found.
- Runtime: Node v22.22.2, pnpm 10.6.5, Git 2.49.0.
- Added: `.gitignore`, `.env.example`, scope/architecture/freshness decisions, and this log.
- Commands: repository/file inspection, `git status --short`, `node --version`, `pnpm --version`, and `git --version`; all applicable checks passed.
- Credentials: none assumed. `MODEL_MODE=mock` and an in-memory demo repository keep deterministic development unblocked. Neon migration execution remains credential-gated.
- Known issues: none for the baseline.
- Next: scaffold the typed workspace and health endpoints.

## Phase 1 — typed monorepo and contract skeleton

- Start: 2026-07-18 07:41 AEST
- End: 2026-07-18 07:49 AEST
- Added: pnpm workspace, strict shared TypeScript configuration, ESLint/Vitest configuration, six workspace projects, comprehensive shared Zod schemas, Fastify `/health` and `/ready`, inject tests, and Next.js App Router shell.
- Commands: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Results: lint passed; all six projects typechecked; 2/2 tests passed; API typecheck build and Next.js 16.2.10 production build passed.
- Decision/deviation: unqualified `typescript@latest` resolved to 7.0.2, outside `typescript-eslint`'s `<6.1` peer range. Pinned compatible TypeScript `~6.0.2` (resolved 6.0.3). pnpm reported ignored optional build scripts for esbuild/sharp; neither blocked the successful build.
- Known issues: API build is a typechecked source deployment (appropriate for the Vercel TypeScript entrypoint), not a standalone compiled server bundle.
- Next: Drizzle schema, committed migration, deterministic seed, and scope-enforced repositories.

## Phase 2 — Neon/Drizzle data layer

- Start: 2026-07-18 07:49 AEST
- End: 2026-07-18 07:53 AEST
- Added: nine-table Drizzle schema, indexed SQL migration, Neon HTTP client/migrator, idempotent 50,000-row deterministic seed, freshness reset, scoped repository interface, Neon implementation, in-memory implementation, and known-edge fixtures.
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, environment gate check.
- Results: lint passed; all six projects typechecked; 4/4 tests passed. Tests prove single-site inventory and joined valuation/catalogue reads cannot return an out-of-scope vehicle.
- Credential gate: `DATABASE_URL` is absent. Empty-database migration, two seed executions, and live count/smoke queries were not run. Exact unblocking command: set `DATABASE_URL`, then run `pnpm db:migrate`, `pnpm db:seed` twice, and scoped smoke queries.
- Seed design: 5 regions, 50 dealerships, 3 principals, 50,000 active inventory rows, valuations, versioned catalogue rows, a zero valuation, deterministic ties, and deliberately missing catalogue records.
- Known issues: live Neon query-plan inspection remains credential-gated.
- Next: deterministic adapters, freshness, analytics, evidence, and validation.

## Phase 3 — deterministic domain logic

- Start: 2026-07-18 07:53 AEST
- End: 2026-07-18 07:58 AEST
- Added: typed config, approved intent/source map, scope intersection, source envelopes, source-specific freshness, adapter-boundary fault injection, three analytics functions, stable evidence, invariant/evidence validation, and deterministic answer fallback.
- Commands/results: `pnpm install`, lint, typecheck, and tests; 11/11 tests passed at the gate.
- Evidence: exact stock count and 22.2% delta, zero-denominator exclusion, deterministic alphabetical ties, stale refusal, catalogue laziness/batching, and ordinary/injected scope denial.
- Next: fixed graph and model boundaries.

## Phase 4 — bounded LangGraph workflow

- Start: 2026-07-18 07:58 AEST
- End: 2026-07-18 08:04 AEST
- Added: Zod StateGraph state, 12 explicit nodes, clarification/refusal branches, Responses API structured gateways, deterministic mock, graph Mermaid, call/deadline/row/evidence budgets, concurrent independent reads, and answer-evidence validation.
- Commands/results: package type/API inspection, lint, typecheck, tests; 21/21 tests passed at this gate.
- Golden paths: three intents, clarification, unsupported, stale, forbidden, catalogue timeout, answer failure fallback, and unknown evidence replacement.
- Known issue: live OpenAI execution credential-gated; mock uses the same Zod contracts/routing.
- Next: public API.

## Phase 5 — Fastify API

- Start: 2026-07-18 08:04 AEST
- End: 2026-07-18 08:06 AEST
- Added: query/principal/scenario routes, shared request/response validation, request IDs, explicit CORS, safe errors, structured completion logging, Vercel export, and audit calls.
- Commands/results: lint passed; 30/30 tests passed after API additions. Strict typecheck exposed Fastify's `unknown` error type; narrowed safely and verified in the full Phase 7 gate.
- Expected ambiguity/policy failures return structured HTTP 200 application statuses; invalid transport is 400; unexpected faults are generic 500.
- Next: reviewer UI.

## Phase 6 — reviewer UI

- Start: 2026-07-18 08:06 AEST
- End: 2026-07-18 08:09 AEST
- Added: responsive single-route dashboard with simulated identity, demo scenario, samples, free text, loading/error states, status, answer, scope/plan, sources/freshness, metrics/evidence, validation/timings, and limitations.
- Gate: Next production compilation succeeded; its first strict pass found an optional timing value, which was defaulted safely before Phase 7's successful build.
- No model/database key or server-only access is present in client code.
- Next: expanded verification.

## Phase 7 — verification and evaluation

- Start: 2026-07-18 08:09 AEST
- End: 2026-07-18 08:13 AEST
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm replay`.
- Final P0 gate: lint passed; all six workspace projects typechecked; 33/33 tests passed in 4 files; Next.js 16.2.10 static production build and API/package builds passed.
- Golden matrix: 13 graph cases plus API/domain/repository coverage. Assertions cover intent/metric, authorised scope, calls made/skipped, exact facts, freshness, invariants, evidence coverage, statuses, planner retry budget, and cross-site denial.
- Synthetic replay: 30/30 answered using local in-memory data + mock model; total p50 40 ms, p95 63 ms; mean planner 0.2 ms, source 0.47 ms, analytics 4.8 ms, answer 0.2 ms. This is not a production SLA or live model/database measurement.
- Database integration: skipped because `DATABASE_URL` is absent. Playwright: P1 and not added after the P0 behavioral/API/build gates passed.
- Next: documentation and deployment handoff.

## Phase 8 — documentation and deployment

- Start: 2026-07-18 08:13 AEST
- End: 2026-07-18 08:16 AEST
- Added/finalised: README, architecture diagrams/lifecycle/data/failure matrix, decisions/rejected alternatives, objective build log, two Vercel configs, environment/deploy instructions, and five-minute demo.
- Live local smoke: built Fastify returned health `ok`, readiness `ready`/`memory`, and an answered two-source market query with valid evidence/validation; built Next server returned HTTP 200 with the expected title and dashboard heading. Both test servers were then terminated.
- Deployment status: not attempted or claimed. `DATABASE_URL`, `OPENAI_API_KEY`, and Vercel account interaction are unavailable. Exact deploy/unblock sequence is in README.
- Known P1: live Neon migrate/seed/smoke, live Responses calls, deployed CORS verification, OpenAPI viewer, and Playwright browser smoke.
- Outcome: local P0 complete with credential gates disclosed.

## Phase 9 — live Neon integration and reviewer smoke

- Date: 2026-07-18 AEST.
- Neon: created an AWS Sydney project, securely configured the ignored root `.env`, applied the committed migration, ran the idempotent 50,000-vehicle seed twice, and refreshed source timestamps.
- Migration compatibility: split the initial SQL migration into explicit Drizzle statement breakpoints because Neon HTTP prepared statements reject multi-command SQL payloads.
- Runtime configuration: API and database scripts now load the root `.env`; readiness reports `dataMode: neon` and `modelMode: mock`.
- Freshness regression: the credential-free in-memory API repository now keeps demo timestamps current across long-running local sessions. A regression test covers a day-old fixture; the suite total is 34 tests.
- OpenAI: securely configured a replacement API key and adapted the structured planner schema so every strict JSON-schema property is required (nullable where semantically optional). A live smoke reached OpenAI but returned `429 insufficient_quota`; no billing changes were made. Local operation therefore remains in deterministic mock-model mode until API quota is available.
- End-to-end smoke: refreshed Neon timestamps, then ran the reviewer market-pricing path through the browser at `http://localhost:3000`. The result was `answered`, reported 177 Sydney Central vehicles more than 10% above market, returned two fresh 1,000-row source envelopes, and passed required-source, numeric-invariant, and evidence-coverage checks. The forced stale-valuation path remained `refused`.
- Final gate: lint passed; all six projects typechecked; 34/34 tests passed; the Next.js 16.2.10 production build and all TypeScript package/API builds passed.
- Quota follow-up: after API credit was added, switched the ignored local `.env` to `MODEL_MODE=live`, restarted the AutoGrab API, and refreshed Neon freshness. Readiness reported live OpenAI + Neon. A real Responses API market-pricing run returned `answered`, identified 177 Sydney Central vehicles more than 10% above market, used two sources, and passed validation.

## Phase 10 — Vercel production deployment

- Date: 2026-07-18 AEST.
- Published Fastify at `https://autograb-api.vercel.app` with sensitive production Neon/OpenAI variables and explicit CORS.
- Added a repository-level Vercel handler and reproducible esbuild server bundle because Vercel's pnpm workspace tracer did not package private workspace source exports reliably.
- Published Next.js at `https://web-eight-ebon-57.vercel.app` with `NEXT_PUBLIC_API_BASE_URL=https://autograb-api.vercel.app`.
- Disabled Vercel SSO deployment protection for both public demo projects.
- Production readiness reports `modelMode: live` and `dataMode: neon`. A live production market-pricing query returned `answered` with 177 vehicles, two sources, passing validation, and a 6.194-second workflow time.
- Production uses a 20-second application deadline and 30-second Vercel function cap after the original 8-second deadline proved too short for a cold live-model planner call.
- Final browser smoke: the public frontend loaded without authentication, displayed the 20-second production deadline, called the public API through the exact CORS origin, and rendered an `answered` live query with 177 vehicles, fresh inventory/valuation envelopes, metrics, and evidence.
- Final repository gate: lint passed; all six projects typechecked; 34/34 tests passed; Next.js and all TypeScript builds passed. The final frontend redeploy also completed its Vercel production build successfully.

## Phase 11 — stable reviewer freshness policy

- Date: 2026-07-18 AEST.
- Replaced the five-minute inventory and one-hour valuation defaults with a transparent, server-owned 30-day reviewer-demo policy. The browser displays source age and effective limit but cannot edit or bypass the policy.
- Added a bounded `stale-inventory` scenario beside the existing `stale-valuation` path. Each fault is injected at the source-adapter boundary exactly 60 seconds beyond its configured threshold.
- Added domain, graph, and API regression coverage. Final local gate: lint passed; all six projects typechecked; 37/37 tests passed; Next.js and all TypeScript builds passed.
- Updated both non-secret Vercel production freshness variables and redeployed the API and web projects. Production smoke verified that the default stock-ageing query returns `answered` with 645 vehicles and a 2,592,000-second limit, while `stale-inventory` returns `refused` at 2,592,060 seconds.

## Phase 12 — complete regional reads and pre-analytics source gating

- Date: 2026-07-18 AEST.
- Raised the explicit per-source ceiling from 5,000 to 10,000 rows so each 10-site demo region is evaluated in full. Adapters request one sentinel row beyond the ceiling and return `budget_exceeded` rather than silently truncating a larger scope.
- Moved required-source availability and freshness validation ahead of catalogue fan-out and analytics. Stale or unavailable required sources retain auditable source metadata but now return zero metrics and zero evidence.
- Expanded the existing 14-case graph regression matrix without changing the advertised test count: the regional case proves all 10,000 rows influence the ranking and that a 10,001-row scope refuses before catalogue access; stale and timeout cases prove analytics is skipped.
- Live local Neon + Responses smoke: regional model ageing returned `answered` from 10,000 inventory rows and 9,989 catalogue rows in 7.572 seconds; stale valuation returned `refused` with zero metrics and evidence in 2.677 seconds.
- Final gate: lint passed; all six projects typechecked; 37/37 tests passed; Next.js and all TypeScript builds passed; synthetic replay answered 30/30 with 39 ms p50 and 91 ms p95.
- Redeployed the API and web production projects. Production readiness remained `modelMode: live` and `dataMode: neon`; the regional query returned all 10,000 inventory rows and 9,989 catalogue rows in 10.473 seconds, while stale valuation refused with zero metrics/evidence in 3.099 seconds. The public UI exposes the new 10,000-row guardrail.

## Phase 13 — customer-focused presentation pass

- Date: 2026-07-18 AEST.
- Reframed the site around useful dealership insights first, with the reliability controls presented as supporting evidence. Updated the hero, demo conditions, result labels, safeguard disclosure, prototype scope and closing discussion prompt.
- Updated the README, architecture approach and decision language; added this record’s five-line summary; moved the completed implementation plan to `docs/archive/`; and added a concise reviewer email draft with public-link verification before sending.
- Current local gate: lint passed; all six projects typechecked; 40/40 tests passed; Next.js and all TypeScript builds passed.
- Synthetic replay: 30/30 answered in local in-memory/mock mode with 21 ms p50 and 32 ms p95. This is not a production SLA.
- Deployment was not changed during this presentation pass; the live URL continues to show the previously deployed build until a new web/API deployment is performed.

## Phase 14 — reviewer-experience completion and verification

- Date: 2026-07-18 AEST.
- Completed the remaining presentation details: expected access and source-availability conditions now use the amber attention treatment, the safeguards disclosure uses the agreed customer-facing wording, and primary reviewer documents avoid unnecessary defensive framing while retaining accurate internal statuses.
- Replaced the outdated “receipt trail” social artwork with a site-specific card using the final navy/blue-violet palette and “supporting records” language; updated the page and Open Graph metadata to use the refreshed asset.
- Verified the live demonstration, public repository, architecture and decision URLs with unauthenticated HTTP requests; all four returned HTTP 200.
- Browser verification covered desktop and 390px mobile layouts, confirmed no horizontal overflow, opened the safeguards disclosure, resolved all four on-page anchor targets, exercised the access-limited scenario, and confirmed its computed warning colours (`#FFF3D9` and `#A66400`). No browser console errors were reported.
- Final gate: lint passed; all six projects typechecked; 40/40 tests passed; Next.js and all TypeScript builds passed.
- No email was sent, no repository visibility was changed, and no deployment was performed.
