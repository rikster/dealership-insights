import type { Evidence, Fact, Invariant, Metric, SourceResult, Validation } from "@autograb/contracts";

export function validateFacts(metrics: Metric[], facts: Fact[], evidence: Evidence[], sources: SourceResult[]): Validation {
  const knownEvidence = new Set(evidence.map((item) => item.id));
  const checks: Invariant[] = [];
  const failedRequired = sources.filter((source) => source.required && (source.error || source.freshness.classification !== "fresh"));
  checks.push({ name: "required_sources", passed: failedRequired.length === 0, detail: failedRequired.length ? `Unsafe required sources: ${failedRequired.map((item) => item.source).join(", ")}` : "All required sources are fresh and available" });
  const numeric = metrics.every((metric) => Number.isFinite(metric.value) && metric.value >= 0 && (metric.unit !== "count" || Number.isInteger(metric.value)));
  checks.push({ name: "numeric_invariants", passed: numeric, detail: numeric ? "All metrics are finite, non-negative, and counts are integers" : "A metric violates its numeric invariant" });
  const covered = [...metrics, ...facts.filter((fact) => fact.material)].every((item) => item.evidenceIds.length > 0 && item.evidenceIds.every((id) => knownEvidence.has(id)));
  checks.push({ name: "evidence_coverage", passed: covered, detail: covered ? "Every metric and material fact maps to returned evidence" : "Missing or unknown evidence reference" });
  const passed = checks.every((check) => check.passed);
  const validation: Validation = { passed, checks };
  if (!passed) validation.refusalReason = failedRequired.length
    ? `Cannot answer safely because required ${failedRequired.map((item) => item.source).join(" and ")} data is stale or unavailable.`
    : "Cannot answer safely because deterministic validation failed.";
  return validation;
}

export function validateAnswerEvidence(answer: { bullets: { evidenceIds: string[] }[] }, evidence: Evidence[]): boolean {
  const ids = new Set(evidence.map((item) => item.id));
  return answer.bullets.every((bullet) => bullet.evidenceIds.length > 0 && bullet.evidenceIds.every((id) => ids.has(id)));
}

