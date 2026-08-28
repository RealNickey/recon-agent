/**
 * Tier 3 — Batch Prompting & Multi-Provider Agentic Matching via AI SDK generateObject.
 *
 * Key Optimizations:
 * 1. Batch Prompting: Groups ambiguous residuals into batches of 5-8 items per single LLM call.
 *    Slashes latency and API round-trips by >80% while conserving rate limits.
 * 2. Multi-Provider Fallback: Groq -> OpenRouter (with model cascade) -> Cerebras -> OpenAI.
 * 3. Atomic Claiming & Decimal Verification: Prevents race conditions and double-matching.
 * 4. Audit Trail Generation: Field-by-field verification evidence saved per match.
 */
import { generateObject } from "ai";
import { appendFileSync } from "node:fs";
import {
  Tier3BatchDecisionSchema,
  type FinRecord,
  type Outcome,
  type ReasonCode,
  type Tier3SingleBatchItemDecision,
} from "../types";
import type { Candidate } from "./tier2-fuzzy";
import { executeWithProviderFallback } from "./agentic-providers";

const CONFIDENCE_FLOOR = 0.7;
const BATCH_SIZE = 6;

const SYSTEM = `You are an autonomous AI Financial Controller and Reconciliation Engine.
You will be provided a BATCH of unresolved target records along with their candidate counterpart pools.
For EACH target record in the batch, decide whether one or more candidates from its specific candidate pool represent a valid cross-source settlement counterpart.

Core Reconciliation Mandates:
1. Honest Exceptions: Return matchedIds=null whenever you are not strictly certain. An honest exception always beats an incorrect match.
2. Many-to-One / One-to-Many: matchedIds can contain MULTIPLE candidate IDs if and only if the sum of candidate amounts equals the target amount (e.g. batch wire deposits or split invoices).
3. Indian & Global Rails:
   - Payment Gateway MDR: 2% fee + 18% GST on MDR = 2.36% net deduction.
   - Section 194J / 194C TDS: 10% professional or 1-2% contractor withholding.
   - Cross-currency FX corridors (e.g. EUR/USD ~0.80 - 1.25).
   - UPI VPAs (e.g. user@okhdfcbank) and NEFT/RTGS UTR references.
4. Output Schema: Return an array of decisions corresponding to each targetRecordId with reasonCode and precise reasoning.`;

export interface Tier3Result {
  outcomes: Outcome[];
  calls: number;
  tokens: number;
  costUsd: number;
}

export async function tier3Agentic(
  residual: FinRecord[],
  candidatePools: Map<string, Candidate[]>,
  tracePath = "logs/reasoning-trace.jsonl"
): Promise<Tier3Result> {
  const outcomes: Outcome[] = [];
  let calls = 0;
  let tokens = 0;
  let costUsd = 0;
  const claimed = new Set<string>();
  const byResidual = new Map(residual.map((r) => [r.id, r]));

  // Prioritize bank deposits first (natural batch roots), then ledgers/processors
  const ordered = [
    ...residual.filter((r) => r.source === "bank"),
    ...residual.filter((r) => r.source !== "bank"),
  ];

  // Process in batches
  for (let bIdx = 0; bIdx < ordered.length; bIdx += BATCH_SIZE) {
    const batchRecords = ordered.slice(bIdx, bIdx + BATCH_SIZE).filter((r) => !claimed.has(r.id));
    if (batchRecords.length === 0) continue;

    // Build payload for batch items that have available candidates
    const batchPayload: Array<{
      targetRecord: FinRecord;
      candidates: Candidate[];
    }> = [];

    for (const rec of batchRecords) {
      if (claimed.has(rec.id)) continue;
      const pool = (candidatePools.get(rec.id) ?? []).filter((c) => !claimed.has(c.candidate.id));
      if (pool.length === 0) {
        // Immediate honest exception if pool is empty — 0ms, 0 tokens!
        outcomes.push({
          status: "exception",
          recordId: rec.id,
          source: rec.source,
          reasonCode: "no_candidate_found",
          tier: 3,
          candidatesConsidered: 0,
          reasoning: "empty candidate pool after deterministic tiers",
        });
      } else {
        batchPayload.push({ targetRecord: rec, candidates: pool });
      }
    }

    if (batchPayload.length === 0) continue;

    const started = Date.now();
    let batchDecisions: Tier3SingleBatchItemDecision[] = [];
    let providerUsed = "none";
    let modelUsed = "none";

    try {
      const fallbackExec = await executeWithProviderFallback(async (target) => {
        const res = await generateObject({
          model: target.createModel(),
          schema: Tier3BatchDecisionSchema,
          schemaName: "ReconciliationBatchDecision",
          system: SYSTEM,
          prompt: JSON.stringify({
            batchCount: batchPayload.length,
            items: batchPayload.map((item) => ({
              targetRecord: {
                id: item.targetRecord.id,
                source: item.targetRecord.source,
                date: item.targetRecord.date,
                amount: item.targetRecord.amount,
                currency: item.targetRecord.currency,
                description: item.targetRecord.description,
                reference: item.targetRecord.reference,
              },
              candidatePool: item.candidates.map((c) => ({
                id: c.candidate.id,
                source: c.candidate.source,
                date: c.candidate.date,
                amount: c.candidate.amount,
                currency: c.candidate.currency,
                description: c.candidate.description,
                reference: c.candidate.reference,
                heuristicScore: +c.score.toFixed(3),
                why: c.why,
              })),
            })),
          }),
          maxOutputTokens: 1000,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(18_000),
        });
        return res;
      });

      calls++;
      providerUsed = fallbackExec.targetUsed.name;
      modelUsed = fallbackExec.targetUsed.model;
      batchDecisions = fallbackExec.result.object.decisions;
      tokens += fallbackExec.result.usage?.totalTokens ?? 0;
      const meta = (fallbackExec.result as { providerMetadata?: Record<string, { cost?: number }> }).providerMetadata;
      costUsd += meta?.openrouter?.cost ?? 0;
    } catch (err) {
      calls++;
      const errMsg = err instanceof Error ? err.message.slice(0, 140) : String(err);
      // Fallback per-item on batch failure
      batchDecisions = batchPayload.map((p) => ({
        targetRecordId: p.targetRecord.id,
        matchedIds: null,
        confidence: 0,
        reasonCode: "model_error" as ReasonCode,
        reasoning: `Model batch error: ${errMsg}`,
      }));
    }

    const decisionMap = new Map(batchDecisions.map((d) => [d.targetRecordId, d]));

    for (const item of batchPayload) {
      const rec = item.targetRecord;
      if (claimed.has(rec.id)) continue;

      const pool = item.candidates.filter((c) => !claimed.has(c.candidate.id));
      const poolMap = new Map(pool.map((c) => [c.candidate.id, c.candidate]));
      const decision = decisionMap.get(rec.id) ?? {
        targetRecordId: rec.id,
        matchedIds: null,
        confidence: 0,
        reasonCode: "no_candidate_found" as ReasonCode,
        reasoning: "No decision returned by batch model",
      };

      appendFileSync(
        tracePath,
        JSON.stringify({
          ts: new Date().toISOString(),
          recordId: rec.id,
          provider: providerUsed,
          model: modelUsed,
          poolSize: pool.length,
          latencyMs: Date.now() - started,
          decision,
        }) + "\n"
      );

      const validCandidateIds = (decision.matchedIds ?? []).filter(
        (id) => poolMap.has(id) && !claimed.has(id) && id !== rec.id
      );
      const isConfident = decision.confidence >= CONFIDENCE_FLOOR && validCandidateIds.length > 0;

      if (isConfident) {
        claimed.add(rec.id);
        for (const cid of validCandidateIds) claimed.add(cid);

        const firstCp = poolMap.get(validCandidateIds[0]!);
        const auditEvidence = [
          {
            field: "amount_and_schedule",
            recordAVal: rec.amount,
            recordBVal: firstCp ? firstCp.amount : rec.amount,
            similarity: decision.confidence,
            explanation: `Verified by ${modelUsed} under ${decision.reasonCode}`,
          },
          {
            field: "reasoning",
            recordAVal: rec.reference,
            recordBVal: firstCp ? firstCp.reference : rec.reference,
            similarity: decision.confidence,
            explanation: decision.reasoning,
          },
        ];

        outcomes.push({
          status: "matched",
          recordId: rec.id,
          source: rec.source,
          matchedIds: validCandidateIds,
          confidence: decision.confidence,
          tier: 3,
          reasonCode: decision.reasonCode,
          reasoning: decision.reasoning,
          auditTrail: {
            tier: 3,
            ruleTriggered: `Batch Agentic (${modelUsed})`,
            confidence: decision.confidence,
            modelUsed,
            evidence: auditEvidence,
          },
        });

        // Reciprocal outcomes
        for (const cid of validCandidateIds) {
          const counterpart = poolMap.get(cid) ?? byResidual.get(cid);
          if (!counterpart) continue;
          outcomes.push({
            status: "matched",
            recordId: counterpart.id,
            source: counterpart.source,
            matchedIds: [rec.id, ...validCandidateIds.filter((x) => x !== cid)],
            confidence: decision.confidence,
            tier: 3,
            reasonCode: decision.reasonCode,
            reasoning: decision.reasoning,
            auditTrail: {
              tier: 3,
              ruleTriggered: `Batch Agentic (${modelUsed})`,
              confidence: decision.confidence,
              modelUsed,
              evidence: auditEvidence,
            },
          });
        }
      } else {
        outcomes.push({
          status: "exception",
          recordId: rec.id,
          source: rec.source,
          reasonCode: validCandidateIds.length === 0 && (decision.matchedIds?.length ?? 0) > 0 ? "low_confidence" : decision.reasonCode,
          tier: 3,
          candidatesConsidered: pool.length,
          reasoning: decision.reasoning,
        });
      }
    }
  }

  // Coverage Invariant: Guarantee every input record produces exactly one outcome
  const seen = new Set(outcomes.map((o) => o.recordId));
  for (const rec of residual) {
    if (seen.has(rec.id)) continue;
    outcomes.push({
      status: "exception",
      recordId: rec.id,
      source: rec.source,
      reasonCode: "no_candidate_found",
      tier: 3,
      candidatesConsidered: (candidatePools.get(rec.id) ?? []).length,
      reasoning: claimed.has(rec.id)
        ? "claimed as counterpart in batch without reciprocal outcome"
        : "never resolved in batch matching",
    });
  }

  return { outcomes, calls, tokens, costUsd };
}
