import { z } from "zod";

/** A single financial record in any source. `source` identifies which file it came from. */
export const RecordSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["bank", "ledger", "processor"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite(),
  currency: z.string().min(1),
  description: z.string(),
  reference: z.string(),
});
export type FinRecord = z.infer<typeof RecordSchema>;

export const ReasonCodeSchema = z.enum([
  "exact_match",
  "timing_gap",
  "amount_variance",
  "id_drift",
  "many_to_one",
  "one_to_many",
  "duplicate_conflict",
  "no_candidate_found",
  "low_confidence",
  "currency_mismatch",
  "refund_reversal",
  "partial_payment",
  "model_error",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

/** Tier-3 model decision schema. */
export const Tier3DecisionSchema = z.object({
  matchedIds: z
    .array(z.string())
    .nullable()
    .describe("IDs of the matching records from the candidate pool. May contain MULTIPLE ids for many-to-one (one bank deposit covering several invoices). Null if no confident match exists — returning null is a good outcome when uncertain, never guess."),
  confidence: z.number().min(0).max(1).describe("Calibrated confidence. Below 0.7 will be forced to exception."),
  reasonCode: ReasonCodeSchema,
  reasoning: z.string().max(400).describe("One or two sentences of concrete evidence (amounts, dates, references)."),
});
export type Tier3Decision = z.infer<typeof Tier3DecisionSchema>;

export const Tier3SingleBatchItemDecisionSchema = z.object({
  targetRecordId: z.string().describe("ID of the target record being reconciled"),
  matchedIds: z.array(z.string()).nullable().describe("Matching candidate IDs from this record's candidate pool, or null"),
  confidence: z.number().min(0).max(1).describe("Calibrated confidence score (0 to 1)"),
  reasonCode: ReasonCodeSchema,
  reasoning: z.string().max(350).describe("Concise explanation with amounts, dates, and references"),
});
export type Tier3SingleBatchItemDecision = z.infer<typeof Tier3SingleBatchItemDecisionSchema>;

export const Tier3BatchDecisionSchema = z.object({
  decisions: z.array(Tier3SingleBatchItemDecisionSchema).describe("List of reconciliation decisions for each record in the batch"),
});
export type Tier3BatchDecision = z.infer<typeof Tier3BatchDecisionSchema>;

export const AuditEvidenceSchema = z.object({
  field: z.string().describe("Field compared: amount, date, reference, vendor, currency"),
  recordAVal: z.string().or(z.number()),
  recordBVal: z.string().or(z.number()),
  similarity: z.number().min(0).max(1),
  explanation: z.string(),
});
export type AuditEvidence = z.infer<typeof AuditEvidenceSchema>;

export const AuditTrailSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  ruleTriggered: z.string(),
  confidence: z.number(),
  evidence: z.array(AuditEvidenceSchema),
  timestamp: z.string().optional(),
  modelUsed: z.string().optional(),
});
export type AuditTrail = z.infer<typeof AuditTrailSchema>;

/** Final per-record outcome written to results/latest-run.json */
export const OutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matched"),
    recordId: z.string(),
    source: z.string(),
    matchedIds: z.array(z.string()),
    confidence: z.number(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    reasonCode: ReasonCodeSchema.optional(),
    reasoning: z.string().optional(),
    auditTrail: AuditTrailSchema.optional(),
  }),
  z.object({
    status: z.literal("exception"),
    recordId: z.string(),
    source: z.string(),
    reasonCode: ReasonCodeSchema,
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    candidatesConsidered: z.number(),
    reasoning: z.string().optional(),
    auditTrail: AuditTrailSchema.optional(),
  }),
]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const CashPositionCurrencySchema = z.object({
  currency: z.string(),
  reconciledAmount: z.number(),
  unreconciledAmount: z.number(),
  netPosition: z.number(),
  reconciledCount: z.number().optional(),
  unreconciledCount: z.number().optional(),
  reconciliationRate: z.number().optional(),
});
export type CashPositionCurrency = z.infer<typeof CashPositionCurrencySchema>;

export const RunResultSchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  model: z.string(),
  outcomes: z.array(OutcomeSchema),
  cashPosition: z.record(z.string(), CashPositionCurrencySchema).optional(),
  stats: z.object({
    totalRecords: z.number(),
    matched: z.number(),
    exceptions: z.number(),
    skippedInvalid: z.number().optional(),
    tier3Calls: z.number(),
    tier3Tokens: z.number(),
    tier3CostUsd: z.number(),
  }),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const AgentChatQuerySchema = z.object({
  prompt: z.string().min(1),
  focusRecordId: z.string().optional(),
});
export type AgentChatQuery = z.infer<typeof AgentChatQuerySchema>;

export const AgentChatResponseSchema = z.object({
  reply: z.string(),
  suggestedActions: z.array(z.string()).optional(),
  referencedRecords: z.array(z.string()).optional(),
  insights: z.array(z.string()).optional(),
  modelUsed: z.string(),
});
export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>;

export const GroundTruthCategorySchema = z.enum([
  "exact",
  "amount_variance",
  "timing_drift",
  "id_format_drift",
  "many_to_one",
  "one_to_many",
  "duplicate",
  "unmatchable",
  "benchrec_real",
  "currency_fx",
  "partial_payment",
  "refund_reversal",
  "timing_drift_wide",
  "amount_fee_wide",
  "identity_weak",
  "ambiguous_vendor",
  "many_to_one_wide",
  "extras_do_not_sum",
  "distractor_unmatchable",
  "fx_no_invoice",
  "sign_flip",
]);
export type GroundTruthCategory = z.infer<typeof GroundTruthCategorySchema>;

/** Ground truth entry — lives OUTSIDE the repo; eval-only. */
export const GroundTruthSchema = z.object({
  meta: z.object({ seed: z.number(), generatedAt: z.string(), counts: z.record(z.string(), z.number()) }),
  pairs: z.array(
    z.object({
      bankId: z.string().nullable(),
      extraBankIds: z.array(z.string()).optional(),
      ledgerIds: z.array(z.string()),
      processorId: z.string().nullable(),
      category: GroundTruthCategorySchema,
    })
  ),
});
export type GroundTruth = z.infer<typeof GroundTruthSchema>;
