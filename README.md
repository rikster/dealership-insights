# AutoGrab bounded orchestrator POC

A reviewer-facing TypeScript proof of concept for evidence-backed dealership analytics. The model is confined to typed interpretation and expression; deterministic code owns authorisation, source selection, reads, calculations, freshness, invariants, evidence coverage, budgets, and refusal.

## What works

- Stock ageing: “Which vehicles at Sydney Central have been in stock over 60 days?”
- Market pricing: “Which vehicles at Sydney Central are more than 10% above market?”
- Regional model ageing: “Which Toyota models are ageing fastest in NSW?”
- Safe refusal for stale required valuation, catalogue timeout, forbidden scope, unsupported CRM/sales outcomes, insufficient evidence, and failed invariants.
- Credential-free local demo through `MODEL_MODE=mock` and a deterministic in-memory repository, plus live Neon operation when `DATABASE_URL` is configured.

Sales conversion, sales revenue, leads, CRM outcomes, generated SQL, writes, production identity, memory, and arbitrary tools are deliberately unsupported.

## Prerequisites

- Node.js 22 or later (verified with 22.22.2)
- pnpm 10 (verified with 10.6.5)
- Optional: Neon Postgres URL and OpenAI API key

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env`. Open `http://localhost:3000`; Fastify listens on `http://localhost:3001`. The checked-in environment example defaults to `MODEL_MODE=mock`, and the API uses deterministic in-memory data when `DATABASE_URL` is absent.

## Environment

| Variable | Purpose | Local default |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection; API/server only | in-memory repository when blank |
| `OPENAI_API_KEY` | Responses API credential; API/server only | not needed in mock mode |
| `OPENAI_MODEL` | Structured planner/answer model | `gpt-5.6-terra` |
| `MODEL_MODE` | `mock` or live model behavior | `mock` |
| `API_PORT` | Fastify port | `3001` |
| `WEB_ORIGIN` | Comma-separated CORS allowlist | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible API origin | `http://localhost:3001` |
| `REQUEST_TIMEOUT_MS` | Overall bounded deadline | `8000` |
| `INVENTORY_MAX_AGE_SECONDS` | Inventory freshness threshold | `300` (5 minutes) |
| `VALUATION_MAX_AGE_SECONDS` | Valuation freshness threshold | `3600` (1 hour) |

Never prefix a secret with `NEXT_PUBLIC_`. The application does not log model reasoning, secrets, connection strings, or unrestricted rows.

## Database

Migrations are explicit release steps and are never run on an API request.

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:refresh-freshness
```

The idempotent seed creates 5 regions, 50 dealerships, 3 demo principals, 50,000 active vehicles, valuations, catalogue data, deterministic ties, a zero valuation, and missing catalogue edges. Run `db:seed` twice to prove idempotence. `db:refresh-freshness` makes timestamp-based demo data current without reseeding.

Refresh timestamps immediately before a reviewer session. The `Stale valuation` scenario deterministically exceeds the configured threshold and demonstrates fail-closed behavior without making freshness policy browser-editable.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm replay
```

The Phase 8 local gate has 33 passing tests, including 13 structured graph golden cases. The replay reports local mock/in-memory timings only and is not a production SLA. Database integration execution requires `DATABASE_URL`; live model execution requires an OpenAI account with available API quota, `OPENAI_API_KEY`, and `MODEL_MODE` other than `mock`.

## Repository map

```text
apps/web                 Next.js App Router reviewer dashboard
apps/api                 Fastify routes, CORS, errors, Vercel entrypoint
packages/contracts       Shared Zod schemas and inferred types
packages/db              Drizzle schema, Neon repositories, migrations, seed
packages/domain          Permissions, sources, freshness, analytics, evidence
packages/orchestrator    Bounded StateGraph and model gateways
docs                     Architecture, decisions, objective build record
scripts/replay.ts        Synthetic local latency replay
```

## Deploy as two Vercel projects

1. Create the API project with root directory `apps/api`. Set `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `MODEL_MODE`, `WEB_ORIGIN`, timeout, and freshness variables. Apply `pnpm db:migrate` explicitly before release, then seed only the intended demo database.
2. Deploy the API and verify `/health`, `/ready`, and `/v1/demo/principals`.
3. Create the web project with root directory `apps/web`. Set `NEXT_PUBLIC_API_BASE_URL` to the deployed API origin.
4. Set API `WEB_ORIGIN` to the deployed web origin (or a comma-separated local + deployed allowlist), redeploy the API, and verify normal, stale, and forbidden paths.

Example CLI flow after authenticating with Vercel:

```bash
pnpm dlx vercel --cwd apps/api
pnpm dlx vercel --cwd apps/web
pnpm dlx vercel --cwd apps/api --prod
pnpm dlx vercel --cwd apps/web --prod
```

Deployment was not attempted during Phase 8 because Vercel account access, database credentials, and model credentials were unavailable. The commands above are the exact handoff sequence once those external prerequisites are supplied.

## Five-minute reviewer demo

1. Open the architecture graph and point out the lack of a ReAct/tool loop.
2. Run stock ageing; show that only inventory was called and every returned item has evidence.
3. Run market pricing; show both fresh sources and the code-calculated delta.
4. Run regional model ageing; show catalogue as one lazy batch and the deterministic tie-break.
5. Select stale valuation, then forbidden site; show structured refusals and that forbidden scope made zero source calls.
6. Finish with `pnpm test` and `docs/BUILD_LOG.md`.

See [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), and [build evidence](docs/BUILD_LOG.md).

