"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PublicResponse, Scenario } from "@autograb/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const samples = [
  { label: "Stock ageing", question: "Which vehicles at Sydney Central have been in stock over 60 days?" },
  { label: "Market pricing", question: "Which vehicles at Sydney Central are more than 10% above market?" },
  { label: "Regional models", question: "Which Toyota models are ageing fastest in NSW?" },
];
const fallbackPrincipals = [
  { id: "head-office-analyst", name: "Head office analyst", description: "All demo sites" },
  { id: "nsw-regional-manager", name: "NSW regional manager", description: "NSW sites" },
  { id: "sydney-central-manager", name: "Sydney Central manager", description: "One site" },
];
const fallbackScenarios: { id: Scenario; label: string; description: string }[] = [
  { id: "normal", label: "Normal", description: "Data within the demo freshness policy" },
  { id: "stale-inventory", label: "Stale inventory", description: "Required inventory is stale" },
  { id: "stale-valuation", label: "Stale valuation", description: "Required source is stale" },
  { id: "catalogue-timeout", label: "Catalogue timeout", description: "Lazy source fails" },
  { id: "forbidden-site", label: "Forbidden site", description: "Permission fails before reads" },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function StatusBanner({ response }: { response: PublicResponse }) {
  return (
    <div className={`status status-${response.status}`} role="status">
      <span className="status-dot" />
      <div><strong>{response.status.replace("_", " ")}</strong><p>{response.message ?? response.answer?.summary}</p></div>
      <span className="request-id">{response.requestId.slice(0, 8)}</span>
    </div>
  );
}

export default function Home() {
  const [principals, setPrincipals] = useState(fallbackPrincipals);
  const [scenarios, setScenarios] = useState(fallbackScenarios);
  const [principalId, setPrincipalId] = useState("head-office-analyst");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [question, setQuestion] = useState(samples[0]!.question);
  const [response, setResponse] = useState<PublicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/v1/demo/principals`).then((result) => result.ok ? result.json() : Promise.reject(new Error("principals"))),
      fetch(`${API_BASE}/v1/demo/scenarios`).then((result) => result.ok ? result.json() : Promise.reject(new Error("scenarios"))),
    ]).then(([principalData, scenarioData]) => {
      setPrincipals(principalData);
      setScenarios(scenarioData);
    }).catch(() => { /* Local fallbacks keep the reviewer form usable while the API starts. */ });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null); setResponse(null);
    try {
      const result = await fetch(`${API_BASE}/v1/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, principalId, scenario }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.message ?? `API returned ${result.status}`);
      setResponse(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the bounded-query API.");
    } finally { setLoading(false); }
  }

  return (
    <main>
      <header className="hero">
        <div><p className="eyebrow">AUTOGRAB · REVIEWER POC</p><h1>Answers with<br/><em>receipts.</em></h1></div>
        <p className="lede">A bounded dealership analytics workflow. AI interprets and explains; deterministic TypeScript controls scope, data, calculations, freshness, evidence, and refusal.</p>
      </header>

      <section className="workspace">
        <form className="query-card" onSubmit={submit}>
          <div className="card-heading"><span>01</span><div><h2>Ask the workflow</h2><p>Choose a simulated identity and a non-production fault path.</p></div></div>
          <div className="field-row">
            <label>Simulated identity<select value={principalId} onChange={(event) => setPrincipalId(event.target.value)}>{principals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Scenario · demo only<select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </div>
          <div className="samples" aria-label="Sample questions">{samples.map((sample) => <button type="button" key={sample.label} onClick={() => setQuestion(sample.question)}>{sample.label}</button>)}</div>
          <label className="question-label">Dealership question<textarea required minLength={3} maxLength={500} rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
          <div className="submit-row"><p>{scenarios.find((item) => item.id === scenario)?.description}</p><button className="submit" disabled={loading}>{loading ? "Running bounded graph…" : "Run query →"}</button></div>
          {error && <div className="error" role="alert"><strong>Request failed</strong><span>{error}</span></div>}
        </form>

        <aside className="guardrails">
          <p className="eyebrow">FIXED GUARDRAILS</p>
          <dl><div><dt>6</dt><dd>source calls max</dd></div><div><dt>2</dt><dd>planner attempts</dd></div><div><dt>20s</dt><dd>production deadline</dd></div></dl>
          <p>No generated SQL. No model-selected tools. No scope expansion. No ungrounded answer.</p>
        </aside>
      </section>

      {response && <section className="results" aria-live="polite">
        <StatusBanner response={response} />
        <div className="result-grid">
          <article className="panel answer-panel"><p className="panel-label">ANSWER</p><h2>{response.answer?.summary ?? response.message}</h2>{response.answer?.bullets.map((bullet, index) => <div className="answer-bullet" key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{bullet.text}<small>{bullet.evidenceIds.join(" · ")}</small></p></div>)}{response.answer?.caveats.map((caveat) => <p className="caveat" key={caveat}>{caveat}</p>)}</article>
          <article className="panel"><p className="panel-label">SCOPE + PLAN</p><h3>{response.resolvedScope?.displayName ?? "Not resolved"}</h3><p>{response.resolvedScope ? `${response.resolvedScope.type} · ${response.resolvedScope.dealershipIds.length} site(s)` : "Source access stopped before scope resolution."}</p><div className="plan">{response.plan?.steps.map((step, index) => <div key={step.source}><span>{index + 1}</span><strong>{step.source}</strong><small>{step.required ? "required" : "optional"} · {step.mode.replace("_", " ")}</small></div>)}</div></article>
          <article className="panel"><p className="panel-label">SOURCES + FRESHNESS</p>{response.sources.length ? response.sources.map((source) => <div className="source" key={source.source}><div><strong>{source.source}</strong><small>{source.rowCount.toLocaleString()} rows</small></div><span className={`badge badge-${source.freshness.classification}`}>{source.error?.code ?? source.freshness.classification}</span><time>{source.sourceTime ? new Date(source.sourceTime).toLocaleString("en-AU") : "No source time"}</time><small className="freshness-policy">{source.freshness.ageSeconds !== null && source.freshness.maxAgeSeconds !== null ? `Age ${formatDuration(source.freshness.ageSeconds)} · demo limit ${formatDuration(source.freshness.maxAgeSeconds)}` : source.freshness.reason}</small></div>) : <p>No sources were called.</p>}</article>
          <article className="panel metrics"><p className="panel-label">METRICS</p>{response.metrics.length ? response.metrics.map((metric) => <div className="metric" key={metric.id}><strong>{metric.value.toLocaleString()}<small>{metric.unit}</small></strong><p>{metric.label}<span>{metric.evidenceIds.join(" · ")}</span></p></div>) : <p>No metrics were calculated.</p>}</article>
          <article className="panel evidence"><p className="panel-label">EVIDENCE</p>{response.evidence.length ? response.evidence.map((item) => <div key={item.id}><code>{item.id}</code><p><strong>{item.label}</strong><span>{item.detail}</span></p></div>) : <p>No evidence was produced.</p>}</article>
          <article className="panel"><p className="panel-label">VALIDATION + TIMINGS</p>{response.validation.checks.map((check) => <div className="check" key={check.name}><span>{check.passed ? "✓" : "×"}</span><p><strong>{check.name.replace("_", " ")}</strong><small>{check.detail}</small></p></div>)}<div className="timings">{Object.entries(response.timingsMs).map(([name, value]) => <div key={name}><span>{name}</span><strong>{Math.round(value ?? 0)}ms</strong></div>)}</div></article>
        </div>
      </section>}

      <section className="about"><p className="eyebrow">WHY BOUNDED</p><h2>The model gets the language.<br/>Code keeps the keys.</h2><div><p><strong>Supported</strong>Stock ageing, market-price deltas, and regional model ageing from deterministic demo data.</p><p><strong>Deliberately absent</strong>Sales conversion, revenue, leads, and CRM outcomes. The POC refuses instead of manufacturing performance claims.</p><p><strong>Deployment</strong>Separate Next.js and Fastify Vercel projects; Neon is explicit migration infrastructure, never browser-accessible.</p></div></section>
    </main>
  );
}
