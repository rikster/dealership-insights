# Dealership Insights

A reviewer-friendly TypeScript proof of concept exploring how dealership teams can ask natural-language questions and receive fast, evidence-backed answers.

The AI interprets the question and explains verified results. Application code enforces role-based access, source selection, freshness, calculations and supporting evidence.

## What the demo shows

- Stock ageing: “Which vehicles at Sydney Central have been in stock over 60 days?”
- Market pricing: “Which vehicles at Sydney Central are more than 10% above market?”
- Regional model ageing: “Which Toyota models are ageing fastest in NSW?”
- Clear handling when required data needs refreshing, a source is temporarily unavailable, a dealership is outside the selected role’s access, or the available data cannot support the requested conclusion.
- Complete regional analysis up to the explicit 10,000-row source ceiling; larger scopes receive a clear explanation instead of a potentially misleading partial result.
- Credential-free local demo through `MODEL_MODE=mock` and a deterministic in-memory repository, plus live Neon operation when `DATABASE_URL` is configured.

## Outside this prototype

Sales conversion, sales revenue, leads and CRM outcomes need additional source data. Production identity, write operations, generated SQL, memory and open-ended tools are also outside this focused walkthrough.

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
| `REQUEST_TIMEOUT_MS` | Overall request deadline | `8000` |
| `INVENTORY_MAX_AGE_SECONDS` | Demo inventory threshold | `2592000` (30 days) |
| `VALUATION_MAX_AGE_SECONDS` | Demo valuation threshold | `2592000` (30 days) |

Never prefix a secret with `NEXT_PUBLIC_`. The application does not log model reasoning, secrets, connection strings, or unrestricted rows.

## Database

Migrations are explicit release steps and are never run on an API request.

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:refresh-freshness
```

The idempotent seed creates 5 regions, 50 dealerships, 3 demo principals, 50,000 active vehicles, valuations, catalogue data, deterministic ties, a zero valuation, and missing catalogue edges. Run `db:seed` twice to prove idempotence. `db:refresh-freshness` makes timestamp-based demo data current without reseeding.

The normal reviewer path uses an explicit 30-day demo freshness policy so seeded data remains useful during a presentation. `Inventory needs refresh` and `Valuation data needs refresh` deliberately exceed the active thresholds so reviewers can see how the workflow asks for current data before calculating an insight. Source metadata remains visible for review, while out-of-date rows produce no metrics or supporting evidence.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm replay
```

The current local gate has 40 passing tests, including 14 structured graph golden cases. The replay reports local mock/in-memory timings only and is not a production SLA. Database integration execution requires `DATABASE_URL`; live model execution requires an OpenAI account with available API quota, `OPENAI_API_KEY`, and `MODEL_MODE` other than `mock`.

## Repository map

```text
apps/web                 Next.js App Router reviewer dashboard
apps/api                 Fastify routes, CORS, errors, Vercel entrypoint
packages/contracts       Shared Zod schemas and inferred types
packages/db              Drizzle schema, Neon repositories, migrations, seed
packages/domain          Permissions, sources, freshness, analytics, evidence
packages/orchestrator    Focused StateGraph and model gateways
docs                     Architecture, decisions, build record, reviewer email
scripts/replay.ts        Synthetic local latency replay
```

## Deploy as two Vercel projects

1. Create the API project with root directory `apps/api`. Set `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `MODEL_MODE`, `WEB_ORIGIN`, timeout, and freshness variables. Apply `pnpm db:migrate` explicitly before release, then seed only the intended demo database.
2. Deploy the API and verify `/health`, `/ready`, and `/v1/demo/principals`.
3. Create the web project with root directory `apps/web`. Set `NEXT_PUBLIC_API_BASE_URL` to the deployed API origin.
4. Set API `WEB_ORIGIN` to the deployed web origin (or a comma-separated local + deployed allowlist), redeploy the API, and verify fresh-data, refresh-needed and role-access paths.

Example CLI flow after authenticating with Vercel:

```bash
pnpm dlx vercel --cwd apps/api
pnpm dlx vercel --cwd apps/web
pnpm dlx vercel --cwd apps/api --prod
pnpm dlx vercel --cwd apps/web --prod
```

The production deployment is live at [dealership-insights-web.vercel.app](https://dealership-insights-web.vercel.app), backed by [dealership-insights-api.vercel.app](https://dealership-insights-api.vercel.app). Production uses live Neon data and `MODEL_MODE=live` through the OpenAI Responses API. The deployed request deadline is 20 seconds (with a 30-second function cap) to accommodate live-model latency; the local default remains 8 seconds.

## Suggested five-minute walkthrough

1. Select **Head Office Analyst** and run the stock-ageing question; show that only inventory was needed and every returned insight has supporting records.
2. Try market pricing; show both fresh sources and the application-calculated price difference.
3. Run regional model ageing; show all 10,000 NSW inventory rows, one lazy catalogue batch and the deterministic tie-break.
4. Select **Valuation data needs refresh** or **Outside this role’s access**; show how the workflow explains why a verified answer is not currently available.
5. Open the architecture graph and discuss how AI interpretation is separated from access, source selection and calculations.

See [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), [build and verification record](docs/BUILD_LOG.md), [historical implementation plan](docs/archive/HISTORICAL_IMPLEMENTATION_PLAN.md).
