/**
 * Tier 3 — Batch Prompting & Multi-Provider Agentic Matching via AI SDK ToolLoopAgent & OpenTelemetry Tracing.
 *
 * Key Optimizations & Safety Controls:
 * 1. Proposal-Only Architecture: AI decisions are treated as untrusted proposals.
 *    Every proposal is deterministically verified with Decimal fixed-point arithmetic before claiming.
 * 2. Fail-Closed Provider Check: Returns verified honest exceptions with zero network I/O when unconfigured.
 * 3. Atomic Multi-ID Validation: Atomic acceptance/rejection of candidate groups.
 * 4. OpenTelemetry Spans & Audit Trail Generation: Mathematical proof of amounts, dates, and currency relationships.
 */
import {
  type FinRecord,
  type Outcome,
  type ReasonCode,
} from "../types";
import type { Candidate } from "./tier2-fuzzy";
import { hasApprovedProvider } from "./agentic-providers";
import {
  CONFIDENCE_FLOOR,
  verifyUntrustedProposal,
  executeAgentBatchReconciliation,
  type AgentBatchItem,
} from "./agentic-orchestrator";
import {
  daysBetween,
  recordsShareInvoice,
  isUnmatchableNoise,
} from "../normalize";
import {
  startSpan,
  enrichSpan,
  endSpan,
  writeTraceLogEntry,
} from "./telemetry";

const BATCH_SIZE = 6;

export interface Tier3Result {
  outcomes: Outcome[];
  calls: number;
  tokens: number;
  costUsd: number;
}

function buildTier3Exception(
  rec: FinRecord,
  pool: Candidate[],
  reasonCode: ReasonCode,
  reasoning: string,
  ruleTriggered = "Tier-3 Exception: Low Confidence / No Candidate",
  confidence = 0.0
): Outcome {
  const poolSize = pool.length;
  const topCand = pool[0]?.candidate;
  const topScore = pool[0]?.score ?? 0;
  const finalConf = confidence > 0 ? confidence : poolSize === 0 ? 0.0 : Math.min(0.49, +topScore.toFixed(2));

  const evidence: Array<{ field: string; recordAVal: string | number; recordBVal: string | number; similarity: number; explanation: string }> = [];

  if (poolSize > 0 && topCand) {
    evidence.push({
      field: "amount",
      recordAVal: `${rec.amount} ${rec.currency}`,
      recordBVal: `${topCand.amount} ${topCand.currency}`,
      similarity: Math.abs(rec.amount - topCand.amount) <= 0.05 ? 1.0 : 0.5,
      explanation: `Amount comparison: ${rec.amount} ${rec.currency} vs ${topCand.amount} ${topCand.currency}`,
    });
    evidence.push({
      field: "date",
      recordAVal: rec.date,
      recordBVal: topCand.date,
      similarity: daysBetween(rec.date, topCand.date) === 0 ? 1.0 : Math.max(0, +(1 - daysBetween(rec.date, topCand.date) / 30).toFixed(2)),
      explanation: `${daysBetween(rec.date, topCand.date)} day(s) drift between transaction postings`,
    });
    evidence.push({
      field: "reference",
      recordAVal: rec.reference,
      recordBVal: topCand.reference,
      similarity: recordsShareInvoice(rec, topCand) ? 1.0 : 0.4,
      explanation: `Reference comparison: "${rec.reference}" vs "${topCand.reference}"`,
    });
    evidence.push({
      field: "candidate_pool",
      recordAVal: `${poolSize} candidate(s) evaluated`,
      recordBVal: `Top candidate score: ${topScore.toFixed(2)}`,
      similarity: +topScore.toFixed(2),
      explanation: `Candidate pool evaluated; confidence below 0.70 threshold or candidate collision`,
    });
  } else {
    evidence.push({
      field: "candidate_pool",
      recordAVal: "0 candidates",
      recordBVal: "None",
      similarity: 0.0,
      explanation: "No cross-source counterpart survived amount/date/currency settlement blocking",
    });
    evidence.push({
      field: "settlement_window",
      recordAVal: rec.date,
      recordBVal: "N/A",
      similarity: 0.0,
      explanation: "No transaction records found within settlement clearing window",
    });
  }

  return {
    status: "exception",
    recordId: rec.id,
    source: rec.source,
    reasonCode,
    tier: 3,
    candidatesConsidered: poolSize,
    reasoning,
    auditTrail: {
      tier: 3,
      ruleTriggered,
      confidence: finalConf,
      evidence,
    },
  };
}

export async function tier3Agentic(
  residual: FinRecord[],
  candidatePools: Map<string, Candidate[]>,
  tracePath = "logs/reasoning-trace.jsonl"
): Promise<Tier3Result> {
  const rootSpan = startSpan("recon.tier3.agentic_pipeline", {
    "recon.tier": 3,
    "recon.residual_count": residual.length,
  });

  const outcomes: Outcome[] = [];
  let calls = 0;
  let tokens = 0;
  let costUsd = 0;
  const claimed = new Set<string>();
  const byResidual = new Map(residual.map((r) => [r.id, r]));

  // Fail-closed offline guard: zero network I/O if no approved provider is configured
  if (!hasApprovedProvider()) {
    for (const rec of residual) {
      const pool = candidatePools.get(rec.id) ?? [];
      outcomes.push(
        buildTier3Exception(
          rec,
          pool,
          pool.length === 0 ? "no_candidate_found" : "low_confidence",
          "no approved AI provider configured; offline fail-safe verified",
          "Tier-3 Fail-Safe: Offline Provider Guard"
        )
      );
    }
    enrichSpan(rootSpan.spanId, {
      "recon.decision": "offline_fail_safe_completed",
      "recon.outcomes_count": outcomes.length,
    });
    endSpan(rootSpan.spanId, "ok", undefined, tracePath);
    return { outcomes, calls: 0, tokens: 0, costUsd: 0 };
  }

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
    const batchPayload: AgentBatchItem[] = [];

    for (const rec of batchRecords) {
      if (claimed.has(rec.id)) continue;
      if (isUnmatchableNoise(rec)) {
        outcomes.push(
          buildTier3Exception(
            rec,
            [],
            "no_candidate_found",
            "unmatchable distractor record identified during audit",
            "Honest Exception: Unmatchable Noise Distractor"
          )
        );
        continue;
      }
      const pool = (candidatePools.get(rec.id) ?? []).filter((c) => !claimed.has(c.candidate.id) && !isUnmatchableNoise(c.candidate));
      if (pool.length === 0) {
        outcomes.push(
          buildTier3Exception(
            rec,
            [],
            "no_candidate_found",
            "empty candidate pool after deterministic tiers",
            "Honest Exception: Empty Candidate Pool"
          )
        );
      } else {
        batchPayload.push({ targetRecord: rec, candidates: pool });
      }
    }

    if (batchPayload.length === 0) continue;

    const started = Date.now();
    const batchResult = await executeAgentBatchReconciliation(batchPayload, tracePath);

    calls += batchResult.calls;
    tokens += batchResult.tokens;
    costUsd += batchResult.costUsd;

    const decisionMap = new Map(batchResult.decisions.map((d) => [d.targetRecordId, d]));

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
        reasoning: "No decision returned by agent batch orchestrator",
      };

      writeTraceLogEntry(
        {
          type: "tier3_batch_decision",
          recordId: rec.id,
          provider: batchResult.providerUsed,
          model: batchResult.modelUsed,
          poolSize: pool.length,
          latencyMs: Date.now() - started,
          decision,
        },
        tracePath
      );

      // Atomic candidate pool validation: ALL proposed IDs must be valid and in candidate pool
      const proposedIds = decision.matchedIds ?? [];
      const allCandsInPool = proposedIds.length > 0 && proposedIds.every(
        (id) => poolMap.has(id) && !claimed.has(id) && id !== rec.id
      );

      let verificationPassed = false;
      let verificationEvidence: Array<{ field: string; recordAVal: string | number; recordBVal: string | number; similarity: number; explanation: string }> = [];

      if (decision.confidence >= CONFIDENCE_FLOOR && allCandsInPool) {
        const candidateObjects = proposedIds.map((id) => poolMap.get(id)!);
        const verification = verifyUntrustedProposal(rec, candidateObjects);
        if (verification.valid) {
          verificationPassed = true;
          verificationEvidence = verification.evidence;
        }
      }

      if (verificationPassed) {
        claimed.add(rec.id);
        for (const cid of proposedIds) claimed.add(cid);

        outcomes.push({
          status: "matched",
          recordId: rec.id,
          source: rec.source,
          matchedIds: proposedIds,
          confidence: decision.confidence,
          tier: 3,
          reasonCode: decision.reasonCode,
          reasoning: decision.reasoning,
          auditTrail: {
            tier: 3,
            ruleTriggered: `Agentic Proposal + Deterministic Verifier (${batchResult.modelUsed})`,
            confidence: decision.confidence,
            modelUsed: batchResult.modelUsed,
            evidence: verificationEvidence,
          },
        });

        // Reciprocal outcomes
        for (const cid of proposedIds) {
          const counterpart = poolMap.get(cid) ?? byResidual.get(cid);
          if (!counterpart) continue;
          outcomes.push({
            status: "matched",
            recordId: counterpart.id,
            source: counterpart.source,
            matchedIds: [rec.id, ...proposedIds.filter((x) => x !== cid)],
            confidence: decision.confidence,
            tier: 3,
            reasonCode: decision.reasonCode,
            reasoning: decision.reasoning,
            auditTrail: {
              tier: 3,
              ruleTriggered: `Agentic Proposal + Deterministic Verifier (${batchResult.modelUsed})`,
              confidence: decision.confidence,
              modelUsed: batchResult.modelUsed,
              evidence: verificationEvidence,
            },
          });
        }
      } else {
        outcomes.push(
          buildTier3Exception(
            rec,
            pool,
            proposedIds.length > 0 ? "low_confidence" : decision.reasonCode,
            decision.reasoning,
            "Tier-3 Verification Rejected / Low Confidence",
            decision.confidence
          )
        );
      }
    }
  }

  // Coverage Invariant: Guarantee every input record produces exactly one outcome
  const seen = new Set(outcomes.map((o) => o.recordId));
  for (const rec of residual) {
    if (seen.has(rec.id)) continue;
    const pool = candidatePools.get(rec.id) ?? [];
    outcomes.push(
      buildTier3Exception(
        rec,
        pool,
        "no_candidate_found",
        claimed.has(rec.id)
          ? "claimed as counterpart in batch without reciprocal outcome"
          : "never resolved in batch matching",
        "Tier-3 Residual Unresolved"
      )
    );
  }

  enrichSpan(rootSpan.spanId, {
    "recon.decision": "tier3_batch_completed",
    "recon.outcomes_count": outcomes.length,
    "gen_ai.usage.total_tokens": tokens,
  });
  endSpan(rootSpan.spanId, "ok", undefined, tracePath);

  return { outcomes, calls, tokens, costUsd };
}
