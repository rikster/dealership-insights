export interface DomainConfig {
  inventoryMaxAgeSeconds: number;
  valuationMaxAgeSeconds: number;
  maxSourceCalls: 6;
  maxRows: number;
  maxEvidence: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function domainConfig(): DomainConfig {
  return {
    inventoryMaxAgeSeconds: positiveInteger(process.env.INVENTORY_MAX_AGE_SECONDS, 2_592_000),
    valuationMaxAgeSeconds: positiveInteger(process.env.VALUATION_MAX_AGE_SECONDS, 2_592_000),
    maxSourceCalls: 6,
    maxRows: 5_000,
    maxEvidence: 50,
  };
}
