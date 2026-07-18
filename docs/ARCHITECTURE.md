# Architecture

## Safety boundary

The POC is a bounded workflow, not a tool-calling agent. OpenAI may transform a user question into approved enums and phrase a compact validated fact bundle. TypeScript resolves IDs and permissions, selects sources, queries through scoped repositories, calculates values, evaluates freshness/invariants, issues evidence IDs, validates citations, enforces budgets, and decides refusal.

```mermaid
flowchart LR
  UI["Next.js reviewer UI"] --> API["Fastify API"]
  API --> GRAPH["Bounded LangGraph StateGraph"]
  GRAPH --> MODEL["OpenAI Responses API\ninterpret + express only"]
  GRAPH --> DOMAIN["Deterministic domain policy"]
  DOMAIN --> REPO["Scope-required repository"]
  REPO --> NEON["Neon Postgres via Drizzle"]
  GRAPH --> AUDIT["Request + evidence audit"]
```

## Graph

```mermaid
flowchart TD
  start((START)) --> initialiseRequest --> interpretQuestion
  interpretQuestion -->|ambiguous| needsClarification --> finalise
  interpretQuestion -->|unsupported/invalid| refuse --> finalise
  interpretQuestion --> resolveAndAuthoriseScope
  resolveAndAuthoriseScope -->|forbidden| refuse
  resolveAndAuthoriseScope --> buildExecutionPlan --> executeSources --> calculateFacts --> validateFacts
  validateFacts -->|unsafe| refuse
  validateFacts --> composeAnswer --> validateAnswer --> finalise --> end((END))
```

There is no intentional loop. Invocation uses a recursion limit of 16, a default eight-second overall deadline, at most two planner attempts, and at most six source calls. Independent inventory and valuation reads use `Promise.allSettled`; catalogue is deferred until inventory supplies unique vehicle IDs, then queried once as a bounded batch.

## Request lifecycle

1. The API validates transport input with the shared Zod request schema and assigns a request ID.
2. `initialiseRequest` establishes the deadline and budgets.
3. `interpretQuestion` returns only supported intent/metric enums, human scope text, filters, and clarification state. It cannot return SQL, IDs, tools, or calculated values.
4. Scope text is resolved, intersected with the selected principal, and embedded in an `AuthorisedScope`. Expected denial stops before source access.
5. Code maps intent to a fixed execution plan. Every repository method requires authorised scope; valuation/catalogue joins reapply its dealership predicate.
6. Adapters return source identity, oldest `sourceTime`, `fetchedAt`, freshness, count, and safe error metadata. Demo faults exist only at this boundary.
7. Analytics creates metrics, facts, and stable request-local evidence IDs. Zero denominators are excluded, and ties sort alphabetically after the primary ranking.
8. Validation checks required-source availability/freshness, numeric invariants, and evidence coverage. Unsafe facts route to refusal.
9. Only compact facts/evidence/freshness reach the answer model. Unknown answer evidence IDs trigger a deterministic replacement.
10. `finalise` validates the public response and persists audit metadata without secrets or reasoning.

## Data model

```mermaid
erDiagram
  REGIONS ||--o{ DEALERSHIPS : contains
  DEMO_PRINCIPALS ||--o{ PRINCIPAL_DEALERSHIPS : grants
  DEALERSHIPS ||--o{ PRINCIPAL_DEALERSHIPS : permits
  DEALERSHIPS ||--o{ INVENTORY : owns
  INVENTORY ||--o| VALUATIONS : valued_by
  INVENTORY ||--o| CATALOGUE : described_by
  DEMO_PRINCIPALS ||--o{ AGENT_REQUESTS : makes
  AGENT_REQUESTS ||--o{ AGENT_EVIDENCE : records
```

UTC `timestamptz` fields carry source and fetch times. The committed migration has indexes for dealership/status, region, join IDs, source times, catalogue make/model, and request audit access.

## Freshness contract

| Source | Demo default | Required for | Failure behavior |
|---|---:|---|---|
| Inventory | 30 days (demo policy) | every supported intent | stale/unknown/error refuses |
| Valuation | 30 days (demo policy) | market pricing | stale/unknown/error refuses |
| Catalogue | version and record presence | regional model ageing | adapter error refuses; unmatched vehicles are excluded and disclosed |

These are illustrative demo configuration, not production SLAs. The UI exposes the effective age and limit but cannot modify policy. Explicit stale-inventory and stale-valuation scenarios exceed their respective limits at the source-adapter boundary. Each response exposes classification, age/limit, reason, source time, fetch time, row count, and error code.

## Failure matrix

| Condition | Source access | Public result |
|---|---|---|
| Ambiguous scope/threshold | none | `needs_clarification` |
| Unsupported sales/CRM outcome | none | `refused` with missing-source explanation |
| Unknown/inactive principal | none | `refused` |
| Forbidden dealership/region | none | `refused` |
| Stale required source | bounded required reads only | `refused`, freshness visible |
| Catalogue timeout | inventory + one failed catalogue batch | `refused` |
| Zero valuation | row excluded deterministically | answer with caveat when other evidence suffices |
| Missing catalogue row | unmatched vehicle excluded | answer with coverage caveat |
| Unknown generated evidence ID | no additional reads/model retry | deterministic answer replacement |
| Answer model failure | no additional reads/model retry | deterministic answer fallback |
| Overall timeout/unexpected failure | abort propagated | safe `failed` response without internals |

## Deployment topology

The same repository becomes two Vercel projects: `apps/web` and `apps/api`. Only `NEXT_PUBLIC_API_BASE_URL` enters the browser bundle. Database/model secrets remain on the API project. `WEB_ORIGIN` is an explicit allowlist. Migrations are a release step rather than application startup behavior.
