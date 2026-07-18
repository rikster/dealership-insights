import type { AuthorisedScope, Principal, Scenario } from "@autograb/contracts";
import type { NameResolution } from "@autograb/db";

export type ScopeDecision =
  | { authorised: true; scope: AuthorisedScope }
  | { authorised: false; reason: string };

export function authoriseScope(principal: Principal, resolved: NameResolution, scenario: Scenario): ScopeDecision {
  if (scenario === "forbidden-site") {
    return { authorised: false, reason: "Demo fault: the requested site is outside this simulated identity's authorised scope." };
  }
  const allowed = new Set(principal.dealershipIds);
  const intersection = resolved.dealershipIds.filter((id) => allowed.has(id));
  if (intersection.length !== resolved.dealershipIds.length || intersection.length === 0) {
    return { authorised: false, reason: `The simulated identity is not authorised for ${resolved.displayName}. No source query was run.` };
  }
  const scope: AuthorisedScope = {
    principalId: principal.id,
    type: resolved.type,
    displayName: resolved.displayName,
    dealershipIds: intersection,
  };
  if (resolved.type === "region") scope.regionId = resolved.id;
  return { authorised: true, scope };
}

