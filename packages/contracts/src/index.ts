import { z } from "zod";

export const ScenarioSchema = z.enum([
  "normal",
  "stale-inventory",
  "stale-valuation",
  "catalogue-timeout",
  "forbidden-site",
]);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const QueryRequestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  principalId: z.string().trim().min(1).max(100),
  scenario: ScenarioSchema.default("normal"),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const PrincipalSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dealershipIds: z.array(z.string()),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const AuthorisedScopeSchema = z.object({
  principalId: z.string(),
  type: z.enum(["dealership", "region"]),
  displayName: z.string(),
  dealershipIds: z.array(z.string()).min(1),
  regionId: z.string().optional(),
});
export type AuthorisedScope = z.infer<typeof AuthorisedScopeSchema>;

export const SupportedIntentSchema = z.enum([
  "stock_ageing",
  "market_pricing",
  "regional_model_ageing",
  "unsupported",
]);
export type SupportedIntent = z.infer<typeof SupportedIntentSchema>;

export const MetricNameSchema = z.enum([
  "vehicle_count",
  "price_delta_percent",
  "average_days_on_lot",
]);
export type MetricName = z.infer<typeof MetricNameSchema>;

export const InterpretedQuestionSchema = z
  .object({
    intent: SupportedIntentSchema,
    scopeType: z.enum(["dealership", "region", "unspecified"]),
    scopeTerm: z.string().trim().min(1).optional(),
    filters: z.object({
      minDaysOnLot: z.number().int().min(0).max(3650).optional(),
      minPercentAboveMarket: z.number().min(0).max(1000).optional(),
      make: z.string().trim().min(1).optional(),
    }),
    metric: MetricNameSchema,
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.needsClarification && !value.clarificationQuestion) {
      context.addIssue({ code: "custom", message: "Clarification question is required" });
    }
  });
export type InterpretedQuestion = z.infer<typeof InterpretedQuestionSchema>;

export const SourceNameSchema = z.enum(["inventory", "valuation", "catalogue"]);
export type SourceName = z.infer<typeof SourceNameSchema>;

export const SourcePlanStepSchema = z.object({
  source: SourceNameSchema,
  required: z.boolean(),
  mode: z.enum(["parallel", "lazy_batch"]),
  maxRows: z.number().int().positive(),
});

export const ExecutionPlanSchema = z.object({
  intent: z.enum(["stock_ageing", "market_pricing", "regional_model_ageing"]),
  metric: MetricNameSchema,
  steps: z.array(SourcePlanStepSchema).min(1).max(3),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const FreshnessSchema = z.object({
  classification: z.enum(["fresh", "stale", "unknown"]),
  ageSeconds: z.number().nonnegative().nullable(),
  maxAgeSeconds: z.number().positive().nullable(),
  reason: z.string(),
});
export type Freshness = z.infer<typeof FreshnessSchema>;

export const SourceErrorSchema = z.object({
  code: z.enum(["timeout", "unavailable", "invalid_data", "budget_exceeded"]),
  message: z.string(),
  retryable: z.boolean(),
});

export const SourceResultSchema = z.object({
  source: SourceNameSchema,
  sourceTime: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  freshness: FreshnessSchema,
  rowCount: z.number().int().nonnegative(),
  required: z.boolean(),
  error: SourceErrorSchema.nullable(),
});
export type SourceResult = z.infer<typeof SourceResultSchema>;

export const EvidenceSchema = z.object({
  id: z.string().regex(/^E\d{3}$/),
  source: SourceNameSchema,
  label: z.string(),
  detail: z.string(),
  sourceTime: z.string().datetime(),
  vehicleId: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const MetricSchema = z.object({
  id: z.string(),
  name: MetricNameSchema,
  label: z.string(),
  value: z.number(),
  unit: z.enum(["count", "percent", "days"]),
  evidenceIds: z.array(z.string()).min(1),
  dimensions: z.record(z.string(), z.string()).default({}),
});
export type Metric = z.infer<typeof MetricSchema>;

export const FactSchema = z.object({
  id: z.string(),
  statement: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  material: z.boolean(),
});
export type Fact = z.infer<typeof FactSchema>;

export const InvariantSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type Invariant = z.infer<typeof InvariantSchema>;

export const ValidationSchema = z.object({
  passed: z.boolean(),
  checks: z.array(InvariantSchema),
  refusalReason: z.string().optional(),
});
export type Validation = z.infer<typeof ValidationSchema>;

export const AnswerSchema = z.object({
  summary: z.string(),
  bullets: z.array(
    z.object({ text: z.string(), evidenceIds: z.array(z.string()).min(1) }),
  ),
  caveats: z.array(z.string()),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const ResponseStatusSchema = z.enum([
  "answered",
  "needs_clarification",
  "refused",
  "failed",
]);
export type ResponseStatus = z.infer<typeof ResponseStatusSchema>;

export const TimingSchema = z.object({
  total: z.number().nonnegative(),
  planner: z.number().nonnegative().optional(),
  authorisation: z.number().nonnegative().optional(),
  sources: z.number().nonnegative().optional(),
  analytics: z.number().nonnegative().optional(),
  answer: z.number().nonnegative().optional(),
});

export const PublicResponseSchema = z.object({
  requestId: z.string().uuid(),
  status: ResponseStatusSchema,
  answer: AnswerSchema.nullable(),
  message: z.string().optional(),
  resolvedScope: AuthorisedScopeSchema.nullable(),
  interpretation: InterpretedQuestionSchema.nullable(),
  plan: ExecutionPlanSchema.nullable(),
  metrics: z.array(MetricSchema),
  evidence: z.array(EvidenceSchema),
  sources: z.array(SourceResultSchema),
  validation: ValidationSchema,
  timingsMs: TimingSchema,
  budgets: z.object({
    sourceCallsUsed: z.number().int().nonnegative().max(6),
    sourceCallsMax: z.literal(6),
    plannerAttemptsUsed: z.number().int().nonnegative().max(2),
    plannerAttemptsMax: z.literal(2),
  }),
});
export type PublicResponse = z.infer<typeof PublicResponseSchema>;

export const DemoPrincipalSchema = PrincipalSchema.pick({
  id: true,
  name: true,
  description: true,
});

export const DemoScenarioSchema = z.object({
  id: ScenarioSchema,
  label: z.string(),
  description: z.string(),
  production: z.literal(false),
});

export const ErrorResponseSchema = z.object({
  status: z.literal("failed"),
  requestId: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
