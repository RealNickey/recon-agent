import { z } from "zod";

/** A single financial record in any source. `source` identifies which file it came from. */
export const RecordSchema = z.object({
  id: z.string(),
  source: z.enum(["bank", "ledger", "processor"]),
  date: z.string(), // YYYY-MM-DD
  amount: z.number(),
  currency: z.string(),
  description: z.string(),
  reference: z.string(),
});
export type FinRecord = z.infer<typeof RecordSchema>;

/** Tier-3 model decision schema. */
export const Tier3DecisionSchema = z.object({
  matchedIds: z
    .array(z.string())
    .nullable()
    .describe("IDs of the matching records from the candidate pool. May contain MULTIPLE ids for many-to-one (one bank deposit covering several invoices). Null if no confident match exists — returning null is a good outcome when uncertain, never guess."),
  confidence: z.number().min(0).max(1).describe("Calibrated confidence. Below 0.7 will be forced to exception."),
  reasonCode: z.enum([
    "timing_gap",
    "amount_variance",
    "id_drift",
    "many_to_one",
    "duplicate_conflict",
    "no_candidate_found",
    "low_confidence",
  ]),
  reasoning: z.string().max(400).describe("One or two sentences of concrete evidence."),
});
export type Tier3Decision = z.infer<typeof Tier3DecisionSchema>;

export type ReasonCode = Tier3Decision["reasonCode"];

/** Final per-record outcome written to results/latest-run.json */
export const OutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matched"),
    recordId: z.string(),
    source: z.string(),
    matchedIds: z.array(z.string()),
    confidence: z.number(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    reasonCode: z.custom<ReasonCode>().optional(),
  }),
  z.object({
    status: z.literal("exception"),
    recordId: z.string(),
    source: z.string(),
    reasonCode: z.custom<ReasonCode>(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    candidatesConsidered: z.number(),
  }),
]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const RunResultSchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  model: z.string(),
  outcomes: z.array(OutcomeSchema),
  stats: z.object({
    totalRecords: z.number(),
    matched: z.number(),
    exceptions: z.number(),
    tier3Calls: z.number(),
    tier3Tokens: z.number(),
  }),
});
export type RunResult = z.infer<typeof RunResultSchema>;

/** Ground truth entry — lives OUTSIDE the repo; eval-only. */
export const GroundTruthSchema = z.object({
  meta: z.object({ seed: z.number(), generatedAt: z.string(), counts: z.record(z.string(), z.number()) }),
  pairs: z.array(
    z.object({
      bankId: z.string().nullable(),
      ledgerIds: z.array(z.string()),
      processorId: z.string().nullable(),
      category: z.enum([
        "exact",
        "amount_variance",
        "timing_drift",
        "id_format_drift",
        "many_to_one",
        "duplicate",
        "unmatchable",
      ]),
    })
  ),
});
export type GroundTruth = z.infer<typeof GroundTruthSchema>;
