import type { Answer, AuthorisedScope, Fact, SourceResult } from "@dealership-insights/contracts";

export function deterministicAnswer(scope: AuthorisedScope, facts: Fact[], sources: SourceResult[], caveats: string[]): Answer {
  const oldest = sources.flatMap((source) => source.sourceTime ? [source.sourceTime] : []).sort()[0];
  return {
    summary: facts[0]?.statement ?? `No validated facts were returned for ${scope.displayName}.`,
    bullets: facts.map((fact) => ({ text: fact.statement, evidenceIds: fact.evidenceIds })),
    caveats: [`Resolved scope: ${scope.displayName}.`, ...(oldest ? [`Oldest critical source time: ${oldest}.`] : []), ...caveats],
  };
}

