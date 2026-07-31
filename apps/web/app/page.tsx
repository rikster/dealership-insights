"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Image from "next/image";
import type { PublicResponse, Scenario } from "@dealership-insights/contracts";
import { formatLocalDateTime, localizeDateTimesInText } from "./format-date";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const samples = [
  { label: "Stock ageing", question: "Which vehicles at Sydney Central have been in stock over 60 days?" },
  { label: "Market pricing", question: "Which vehicles at Sydney Central are more than 10% above market?" },
  { label: "Regional trends", question: "Which Toyota models are ageing fastest in NSW?" },
  { label: "Sales conversion", question: "What is salesperson conversion at Sydney Central?" },
];

const fallbackPrincipals = [
  { id: "head-office-analyst", name: "Head office analyst", description: "All demo sites" },
  { id: "nsw-regional-manager", name: "NSW regional manager", description: "NSW sites" },
  { id: "sydney-central-manager", name: "Sydney Central manager", description: "One site" },
];

const fallbackScenarios: { id: Scenario; label: string; description: string }[] = [
  { id: "normal", label: "Fresh data", description: "Freshness checks passed" },
  { id: "stale-inventory", label: "Inventory needs refresh", description: "Inventory needs refreshing before analysis" },
  { id: "stale-valuation", label: "Valuation data needs refresh", description: "Valuation data needs refreshing before analysis" },
  { id: "catalogue-timeout", label: "Catalogue temporarily unavailable", description: "The catalogue source is temporarily unavailable" },
  { id: "forbidden-site", label: "Outside this role’s access", description: "The selected role cannot access the requested site" },
];

const benefits = [
  {
    title: "Fresh",
    copy: "Live operational questions use freshness-aware source access, with visible timestamps and clear handling when data is outside policy.",
    proof: "Visible source times and policy windows",
  },
  {
    title: "Fast",
    copy: "Parallel source access and focused execution target the response time needed during live dealer conversations.",
    proof: "Parallel reads and a 20-second deadline",
  },
  {
    title: "Verifiable",
    copy: "Calculations are deterministic, and answers include the data and reasoning needed to inspect the result.",
    proof: "TypeScript calculations and evidence IDs",
  },
];

const scenarioShortcuts: { label: string; question: string; scenario: Scenario; principalId?: string }[] = [
  { label: "Inventory needs refresh", question: samples[0]!.question, scenario: "stale-inventory" },
  { label: "Catalogue temporarily unavailable", question: samples[2]!.question, scenario: "catalogue-timeout" },
  { label: "Missing sales data", question: samples[3]!.question, scenario: "normal" },
  { label: "Outside this role’s access", question: samples[0]!.question, scenario: "forbidden-site", principalId: "sydney-central-manager" },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function extractRequestedScope(question: string): string {
  const dealershipMatch = question.match(/\bat\s+(.+?)(?=\s+(?:have|has|are|is|were|was|that)\b|\?|$)/i);
  const regionMatch = question.match(/\bin\s+(.+?)(?:\?|$)/i);
  return dealershipMatch?.[1]?.trim() ?? regionMatch?.[1]?.trim() ?? "the requested site or region";
}

function getStatusPresentation(
  response: PublicResponse,
  scenario: Scenario,
  question: string,
  principalName: string,
): { label: string; message: string; tone: "success" | "warning" | "error" } {
  const staleSource = response.sources.find((source) => source.freshness.classification === "stale");
  const unavailableSource = response.sources.find((source) => source.error);

  if (response.status === "answered") {
    return {
      label: "Verified insight ready",
      message: response.answer?.summary ?? "The workflow completed with supporting evidence.",
      tone: "success",
    };
  }

  if (staleSource) {
    return {
      label: "Fresh data needed",
      message: `I have paused this answer because the ${staleSource.source} snapshot is outside the accepted freshness window. Refreshing the ${staleSource.source} source would allow the analysis to continue.`,
      tone: "warning",
    };
  }

  if (unavailableSource) {
    return {
      label: "Source temporarily unavailable",
      message: `The ${unavailableSource.source} service did not complete this request. Retry when the source is available, or choose a question that does not depend on it.`,
      tone: "warning",
    };
  }

  if (scenario === "forbidden-site" || (!response.resolvedScope && response.interpretation?.intent !== "unsupported")) {
    return {
      label: "Access limited",
      message: `Access to ${extractRequestedScope(question)} is restricted for ${principalName} under this simulated condition. Return to Fresh data or choose a role and scope combination permitted by the demo.`,
      tone: "warning",
    };
  }

  if (response.interpretation?.intent === "unsupported") {
    return {
      label: "Additional data needed",
      message: "The available sources show current stock and market position, but not completed sales. Sales-conversion performance cannot be calculated until CRM or transaction data is connected.",
      tone: "warning",
    };
  }

  if (response.status === "needs_clarification") {
    return {
      label: "One detail needed",
      message: response.message ?? "Add a little more detail so the workflow can resolve the intended scope.",
      tone: "warning",
    };
  }

  return {
    label: "Demo request did not complete",
    message: response.message ?? "The demo could not complete this request. Please try again.",
    tone: "error",
  };
}

function StatusBanner({
  response,
  scenario,
  question,
  principalName,
}: {
  response: PublicResponse;
  scenario: Scenario;
  question: string;
  principalName: string;
}) {
  const presentation = getStatusPresentation(response, scenario, question, principalName);

  return (
    <div className={`status status-${presentation.tone}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <div>
        <strong>{presentation.label}</strong>
        <p>{localizeDateTimesInText(presentation.message)}</p>
      </div>
      <span className="request-id" title="Request identifier">{response.requestId.slice(0, 8)}</span>
    </div>
  );
}

function EvidenceRow({ item }: { item: PublicResponse["evidence"][number] }) {
  return (
    <div className="evidence-row">
      <code>{item.id}</code>
      <p>
        <strong>
          {item.vehicleId ? <><span className="vehicle-id-label">Vehicle ID</span>{item.vehicleId}</> : item.label}
        </strong>
        {item.vehicleId && <span className="evidence-label">{item.label.replace(`${item.vehicleId}: `, "")}</span>}
        <span>{item.detail}</span>
      </p>
    </div>
  );
}

function EvidencePanel({ response }: { response: PublicResponse }) {
  const previewCount = 5;
  const preview = response.evidence.slice(0, previewCount);
  const remaining = response.evidence.slice(previewCount);
  const vehicleEvidence = response.evidence.some((item) => item.vehicleId);
  const catalogueWasRequested = response.plan?.steps.some((step) => step.source === "catalogue") ?? false;
  const matchedCount = response.metrics.find((metric) => metric.name === "vehicle_count")?.value;

  return (
    <article className="panel evidence">
      <p className="panel-label">Supporting records</p>
      {response.evidence.length ? <>
        <p className="evidence-summary">
          Showing {Math.min(previewCount, response.evidence.length)} of {response.evidence.length} supporting records
          {typeof matchedCount === "number" && matchedCount > response.evidence.length ? ` from ${matchedCount.toLocaleString()} matches` : ""}.
          {response.status === "refused" && " These rows remain visible for traceability and were not used to produce an answer."}
        </p>
        {vehicleEvidence && !catalogueWasRequested && <p className="evidence-note">Make and model are not shown because this question only requested inventory data.</p>}
        <div className="evidence-list">{preview.map((item) => <EvidenceRow item={item} key={item.id} />)}</div>
        {remaining.length > 0 && <details className="evidence-more">
          <summary>View remaining {remaining.length} records</summary>
          <div className="evidence-list evidence-list-expanded">{remaining.map((item) => <EvidenceRow item={item} key={item.id} />)}</div>
        </details>}
      </> : <p>No supporting records were required for this result.</p>}
    </article>
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
  const demoRef = useRef<HTMLElement>(null);
  const scenarioRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/v1/demo/principals`).then((result) => result.ok ? result.json() : Promise.reject(new Error("principals"))),
      fetch(`${API_BASE}/v1/demo/scenarios`).then((result) => result.ok ? result.json() : Promise.reject(new Error("scenarios"))),
    ]).then(([principalData, scenarioData]) => {
      setPrincipals(principalData);
      setScenarios(scenarioData.map((item: (typeof fallbackScenarios)[number]) =>
        fallbackScenarios.find((scenarioItem) => scenarioItem.id === item.id) ?? item));
    }).catch(() => { /* Local fallbacks keep the reviewer form usable while the API starts. */ });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
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
      setError(cause instanceof Error ? cause.message : "The demo service could not be reached.");
    } finally {
      setLoading(false);
    }
  }

  function revealDetail(event: MouseEvent<HTMLAnchorElement>, detailId: string) {
    event.preventDefault();
    const detail = document.getElementById(detailId) as HTMLDetailsElement | null;
    if (!detail) return;
    detail.open = true;
    history.replaceState(null, "", `#${detailId}`);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
    detail.querySelector("summary")?.focus({ preventScroll: true });
  }

  function exploreAnotherScenario() {
    setResponse(null);
    setError(null);
    demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => scenarioRef.current?.focus(), 350);
  }

  function chooseScenarioShortcut(shortcut: (typeof scenarioShortcuts)[number]) {
    setResponse(null);
    setError(null);
    setQuestion(shortcut.question);
    setScenario(shortcut.scenario);
    if (shortcut.principalId) setPrincipalId(shortcut.principalId);
  }

  const selectedPrincipal = principals.find((item) => item.id === principalId) ?? fallbackPrincipals[0]!;
  const selectedScenario = scenarios.find((item) => item.id === scenario) ?? fallbackScenarios[0]!;

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-meta">
            <p className="eyebrow">DEALERSHIP INSIGHTS · DESIGN WALKTHROUGH</p>
            <p>Dealership insights · Interactive prototype</p>
          </div>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="hero-pill">AI-assisted · Evidence-backed</p>
              <h1>Fresh dealership insights, with the evidence behind them.</h1>
              <p className="hero-description">A focused proof of concept showing how dealership teams can ask natural-language questions and receive fast, traceable answers from authorised, up-to-date data.</p>
              <div className="hero-actions">
                <a className="button button-primary" href="#demo">Try the workflow</a>
                <a className="button button-secondary" href="#architecture">View the architecture</a>
              </div>
            </div>
            <div className="hero-visual-column">
              <figure className="hero-product-visual">
                <Image src="/reviewer-social.png" width={1672} height={941} priority sizes="(max-width: 980px) 100vw, 42vw" alt="Authorised dealership data flowing through verified calculations to an evidence-backed insight" />
                <figcaption>AI interprets the question. Trusted source data and deterministic code ground the answer.</figcaption>
              </figure>
              <p className="hero-note">Prepared by Richard Hounslow as a discussion companion to the systems-design exercise.</p>
            </div>
          </div>
        </div>
      </header>

      <div className="page-shell">
        <section className="intro" aria-labelledby="intro-heading">
          <div>
            <p className="section-kicker">AI-assisted dealership workflow</p>
            <h2 id="intro-heading">Useful answers for the moments that matter.</h2>
          </div>
          <div className="intro-copy">
            <p className="job-story">During a dealer conversation, an analyst needs to identify ageing stock without switching between systems.</p>
            <p>A focused dealership analytics workflow turns that question into a dependable answer. <strong>AI interprets the user’s language and explains the result</strong>, while deterministic TypeScript enforces access, freshness, calculations and supporting evidence.</p>
          </div>
        </section>

        <section className="demo-section" id="demo" ref={demoRef} tabIndex={-1} aria-labelledby="demo-heading">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-kicker">Interactive AI proof of concept</p>
              <h2 id="demo-heading">Try a dealership question</h2>
            </div>
            <p>Select a user role and demo condition to explore access, freshness and source availability.</p>
          </div>

          <form className="query-card" onSubmit={submit}>
            <div className="field-row">
              <label>
                <span>User role</span>
                <select value={principalId} onChange={(event) => setPrincipalId(event.target.value)}>
                  {principals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <small>{selectedPrincipal.description}</small>
              </label>
              <label>
                <span>Demo condition</span>
                <select ref={scenarioRef} value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
                  {scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <small>{selectedScenario.description}</small>
              </label>
            </div>

            <div className="question-block">
              <div className="samples" aria-label="Sample dealership questions">
                {samples.map((sample) => (
                  <button
                    type="button"
                    className={question === sample.question ? "sample-active" : ""}
                    key={sample.label}
                    onClick={() => setQuestion(sample.question)}
                    aria-pressed={question === sample.question}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              <label className="question-label">
                <span>Dealership question</span>
                <textarea required minLength={3} maxLength={500} rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
              </label>
            </div>

            <div className="submit-row">
              <p><span className="freshness-dot" aria-hidden="true" />{selectedScenario.description}</p>
              <button className="submit" disabled={loading}>{loading ? "Checking the data…" : "Get insight"}</button>
            </div>
            <div className="scenario-explorer">
              <div><strong>Scenarios to explore</strong><span>Choose a condition, then run the demo.</span></div>
              <div>{scenarioShortcuts.map((shortcut) => <button type="button" key={shortcut.label} onClick={() => chooseScenarioShortcut(shortcut)}>{shortcut.label}</button>)}</div>
            </div>
            {error && <div className="error" role="alert"><strong>Demo request failed</strong><span>{error}</span><small>Check that the local API is running, then try again.</small></div>}
          </form>

          {!response && !loading && <section className="example-result" aria-labelledby="example-result-heading">
            <div className="example-result-heading">
              <div><p className="panel-label">Seeded demo example</p><h3 id="example-result-heading">What a grounded answer looks like.</h3></div>
              <span><i aria-hidden="true" />Freshness checks passed</span>
            </div>
            <div className="example-result-grid">
              <div className="example-answer">
                <small>Stock-ageing question · Sydney Central</small>
                <strong>645 vehicles matched</strong>
                <p>Vehicles at least 60 days old, calculated from the seeded inventory dataset.</p>
              </div>
              <dl>
                <div><dt>Source</dt><dd>Inventory · 1,000 rows checked</dd></div>
                <div><dt>Calculation</dt><dd>Deterministic TypeScript</dd></div>
                <div><dt>Evidence</dt><dd>50 supporting records returned</dd></div>
              </dl>
            </div>
            <p className="example-result-note"><strong>AI explains the validated result;</strong> access, freshness, calculations and evidence remain code-controlled. Run the demo above to inspect the current source times and timings.</p>
          </section>}

          {response && <section className="results" aria-label="Demo result" aria-live="polite">
            <StatusBanner response={response} scenario={scenario} question={question} principalName={selectedPrincipal.name} />
            <div className="result-grid">
              <article className="panel answer-panel">
                <p className="panel-label">Insight</p>
                <h3>{localizeDateTimesInText(response.answer?.summary ?? getStatusPresentation(response, scenario, question, selectedPrincipal.name).message)}</h3>
                {response.answer?.bullets.map((bullet, index) => <div className="answer-bullet" key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{localizeDateTimesInText(bullet.text)}<small>{bullet.evidenceIds.join(" · ")}</small></p></div>)}
                {response.answer?.caveats.map((caveat) => <p className="caveat" key={caveat}>{localizeDateTimesInText(caveat)}</p>)}
              </article>

              <article className="panel">
                <p className="panel-label">How it was answered</p>
                <h3>{response.resolvedScope?.displayName ?? "Scope not opened"}</h3>
                <p>{response.resolvedScope ? `${response.resolvedScope.type} · ${response.resolvedScope.dealershipIds.length} site(s)` : "Source access stopped before scope resolution."}</p>
                <div className="plan">{response.plan?.steps.map((step, index) => <div key={step.source}><span>{index + 1}</span><strong>{step.source}</strong><small>{step.required ? "required" : "optional"} · {step.mode.replace("_", " ")}</small></div>)}</div>
              </article>

              <article className="panel sources-panel">
                <p className="panel-label">Data used</p>
                {response.sources.length ? response.sources.map((source) => <div className="source" key={source.source}><div><strong>{source.source}</strong><small>{source.rowCount.toLocaleString()} rows</small></div><span className={`badge badge-${source.error ? "error" : source.freshness.classification}`}>{source.error ? "Service unavailable" : source.freshness.classification === "fresh" ? "Fresh" : "Needs refresh"}</span><time dateTime={source.sourceTime ?? undefined} title={source.sourceTime ?? undefined}>{source.sourceTime ? formatLocalDateTime(source.sourceTime) : "No source time"}</time><small className="freshness-policy">{source.freshness.ageSeconds !== null && source.freshness.maxAgeSeconds !== null ? `Age ${formatDuration(source.freshness.ageSeconds)} · demo limit ${formatDuration(source.freshness.maxAgeSeconds)}` : source.freshness.reason}</small></div>) : <p>No sources were called.</p>}
              </article>

              <article className="panel metrics">
                <p className="panel-label">Key figures</p>
                {response.metrics.length ? response.metrics.map((metric) => <div className="metric" key={metric.id}><strong>{metric.value.toLocaleString()}<small>{metric.unit}</small></strong><p>{metric.label}<span>{metric.evidenceIds.join(" · ")}</span></p></div>) : <p>No metrics were calculated for this response.</p>}
              </article>

              <EvidencePanel response={response} />

              <article className="panel validation-panel">
                <p className="panel-label">Quality checks</p>
                <div className="validation-content">
                  <div>{response.validation.checks.map((check) => <div className="check" key={check.name}><span aria-hidden="true">{check.passed ? "✓" : "×"}</span><p><strong>{check.name.replaceAll("_", " ")}</strong><small>{check.detail}</small></p></div>)}</div>
                  <div className="timings">{Object.entries(response.timingsMs).map(([name, value]) => <div key={name}><span>{name}</span><strong>{Math.round(value ?? 0)}ms</strong></div>)}</div>
                </div>
              </article>
            </div>
          </section>}
        </section>

        <section className="benefits-section" aria-labelledby="benefits-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Designed for live conversations</p>
              <h2 id="benefits-heading">Fresh. Fast. Verifiable.</h2>
            </div>
          </div>
          <div className="benefit-grid">
            {benefits.map((benefit, index) => <article className="benefit-card" key={benefit.title}><span aria-hidden="true">0{index + 1}</span><h3>{benefit.title}</h3><p>{benefit.copy}</p><small>{benefit.proof}</small></article>)}
          </div>
        </section>

        <section className="reliability-section" aria-labelledby="reliability-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Operational envelope</p>
              <h2 id="reliability-heading">Designed for dependable answers</h2>
            </div>
            <p>Predictable limits keep the workflow fast, scoped and auditable.</p>
          </div>
          <dl className="limits-grid">
            <div><dt>6</dt><dd>Up to 6 source calls</dd></div>
            <div><dt>2</dt><dd>Up to 2 planning attempts</dd></div>
            <div><dt>10k</dt><dd>10,000-row source limit</dd></div>
            <div><dt>20s</dt><dd>20-second response deadline</dd></div>
          </dl>
          <p className="reliability-note">The workflow uses approved data sources, enforces role-based access, calculates metrics in application code and only presents claims supported by returned evidence.</p>
          <details className="detail-card safeguards">
            <summary>View technical safeguards <span>Open details</span></summary>
            <ul>
              <li>No generated SQL.</li>
              <li>No arbitrary tool selection.</li>
              <li>No expansion beyond the authorised dealership scope.</li>
              <li>No unsupported claims without evidence.</li>
            </ul>
          </details>
        </section>

        <section className="approach-section" aria-labelledby="approach-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">A focused workflow for live dealer conversations</p>
              <h2 id="approach-heading">AI understands the question. Application code verifies the answer.</h2>
            </div>
            <p>The result is a workflow dealership staff can use quickly, while the business retains clear control over what data is accessed and how each answer is formed.</p>
          </div>
          <div className="approach-grid">
            <article><h3>Useful in conversation</h3><p>Natural-language questions reduce the distance between a live dealer need and a grounded operational answer.</p></article>
            <article><h3>Predictable under pressure</h3><p>Typed plans, scoped source access and deterministic calculations keep behaviour consistent when data is incomplete or unavailable.</p></article>
            <article><h3>Open to adaptation</h3><p>The boundaries are deliberate design choices for this exercise, ready to be discussed and adjusted against latency, cost and risk.</p></article>
          </div>
        </section>

        <section className="scope-section" aria-labelledby="scope-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Demonstrated scope</p>
              <h2 id="scope-heading">Focused enough to inspect. Useful enough to discuss.</h2>
            </div>
          </div>
          <div className="scope-grid">
            <article className="scope-card">
              <h3>Included in this prototype</h3>
              <ul>
                <li>Stock-ageing analysis.</li>
                <li>Market-price comparisons.</li>
                <li>Regional model-ageing trends.</li>
                <li>Role-based site access.</li>
                <li>Freshness and degraded-source handling.</li>
              </ul>
            </article>
            <article className="scope-card scope-card-muted">
              <h3>Additional data needed</h3>
              <p>Sales conversion, revenue, leads and CRM outcomes require additional source data. The workflow identifies these gaps explicitly instead of treating inventory data as evidence of sales performance.</p>
              <p>When the available data cannot support a claim, the workflow explains what is missing rather than inferring an answer.</p>
            </article>
          </div>
        </section>

        <section className="technical-section" aria-labelledby="technical-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">For a deeper review</p>
              <h2 id="technical-heading">Implementation details</h2>
            </div>
            <p>The prototype stays concise on first view, with the technical evidence available when it is useful.</p>
          </div>

          <article className="architecture-preview" id="architecture">
            <div className="architecture-preview-heading"><div><p className="panel-label">Architecture at a glance</p><h3>Language in. Verified insight out.</h3></div><p>AI handles interpretation and explanation. Typed code owns the operational guarantees between them.</p></div>
            <div className="architecture-flow" aria-label="Question flows through AI interpretation, deterministic workflow, typed sources, and an evidence-backed answer">
              <div><span>01</span><strong>Dealership question</strong></div>
              <i aria-hidden="true">→</i>
              <div><span>02</span><strong>AI interpretation</strong></div>
              <i aria-hidden="true">→</i>
              <div><span>03</span><strong>Deterministic workflow</strong></div>
              <i aria-hidden="true">→</i>
              <div><span>04</span><strong>Typed data sources</strong></div>
              <i aria-hidden="true">→</i>
              <div><span>05</span><strong>Verified insight</strong></div>
            </div>
            <p className="detail-note">Authorisation resolves before source reads. Required sources are freshness-checked before analytics, and answer evidence is validated before a response is returned.</p>
          </article>

          <div className="details-stack">
            <details className="detail-card" id="architecture-notes">
              <summary>Architecture notes <span>Open notes</span></summary>
              <div className="detail-content">
                <p>A typed, focused graph separates language understanding from authorisation, source execution, calculations and answer validation.</p>
                <p>The model cannot expand scope, choose arbitrary tools or perform calculations. Those responsibilities stay in typed workflow code so each successful answer remains inspectable.</p>
              </div>
            </details>

            <details className="detail-card" id="decision-notes">
              <summary>Implementation and decision notes <span>Open notes</span></summary>
              <div className="detail-content detail-columns">
                <div><h3>AI where language helps</h3><p>The model interprets supported questions and expresses validated facts. It does not own permissions, source selection or calculations.</p></div>
                <div><h3>Code where guarantees matter</h3><p>TypeScript owns role scope, plans, row budgets, freshness, calculations, invariants and evidence coverage.</p></div>
                <div><h3>Focused prototype scope</h3><p>This is a conversation aid, not a claim of production completeness. Broader autonomy can be considered against a concrete use case.</p></div>
              </div>
            </details>

            <details className="detail-card" id="deployment">
              <summary>Deployment details <span>Open details</span></summary>
              <div className="detail-content detail-columns deployment-columns">
                <div><h3>Web experience</h3><p>A Next.js reviewer interface provides the interactive walkthrough and keeps source evidence visible.</p></div>
                <div><h3>Focused API</h3><p>A separate Fastify service runs the orchestration graph and keeps credentials and database access server-side.</p></div>
                <div><h3>Data layer</h3><p>Neon migrations and demo data are managed explicitly. The browser never receives database credentials or unrestricted rows.</p></div>
              </div>
            </details>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-heading">
          <p className="section-kicker">Next conversation</p>
          <h2 id="closing-heading">Built to support a working discussion</h2>
          <div className="closing-copy">
            <p>This prototype is designed for predictable behaviour, fresh data and inspectable answers.</p>
            <p>The next design decision is where Dealership Insights would benefit from greater flexibility—and where latency, cost or risk make a focused workflow the better choice.</p>
          </div>
          <div className="closing-actions">
            <a href="#architecture">View architecture diagram</a>
            <a href="#decision-notes" onClick={(event) => revealDetail(event, "decision-notes")}>Read decision notes</a>
            <button type="button" onClick={exploreAnotherScenario}>Explore another scenario</button>
          </div>
          <p className="author-signoff">Richard Hounslow · Dealership insights take-home exercise</p>
        </section>
      </div>
    </main>
  );
}
