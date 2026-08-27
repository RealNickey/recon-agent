/**
 * Tier 3 — agentic matching via Vercel AI SDK generateObject.
 * Only sees what tiers 1-2 left behind, with pre-filtered candidate pools.
 *
 * Sequential (not fully parallel) so claimed-id exclusion is race-free.
 * Bounded inner retries via generateObject maxRetries. Empty pools skip the
 * model entirely. Every call is logged to logs/reasoning-trace.jsonl.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { appendFileSync } from "node:fs";
import { Tier3DecisionSchema, type FinRecord, type Outcome, type ReasonCode } from "../types";
import type { Candidate } from "./tier2-fuzzy";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  name: "openrouter",
});

const MODEL = process.env.MODEL ?? "z-ai/glm-5.2:free";
const CONFIDENCE_FLOOR = 0.7;

const SYSTEM = `You are a financial reconciliation engine. Given one unresolved record and a small pool of candidate counterpart records from other sources, decide which candidate(s) it matches.

Rules:
- Return matchedIds=null when uncertain. An honest "no match" is always better than a wrong match.
- matchedIds may contain multiple ids ONLY for genuine many-to-one cases (e.g. one bank deposit whose amount equals the sum of several invoices) or one-to-many split settlements.
- Never invent ids. Every matchedId MUST be in the candidate pool.
- Use reasonCode to classify: timing_gap, amount_variance, id_drift, many_to_one, one_to_many, duplicate_conflict, no_candidate_found, low_confidence, currency_mismatch, refund_reversal, partial_payment.
- Keep reasoning to 1-2 sentences of concrete evidence (amounts, dates, references, currencies).`;

export interface Tier3Result {
  outcomes: Outcome[];
  calls: number;
  tokens: number;
  costUsd: number;
}

function emptyDecision(reason: ReasonCode, reasoning: string) {
  return { matchedIds: null as string[] | null, confidence: 0, reasonCode: reason, reasoning };
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
  let consecutiveErrors = 0;

  // Bank first: a deposit is the natural many-to-one root, so it claims invoices
  // before invoices independently guess a 1:1. Then remaining residuals.
  const ordered = [
    ...residual.filter((r) => r.source === "bank"),
    ...residual.filter((r) => r.source !== "bank"),
  ];

  for (const rec of ordered) {
    if (claimed.has(rec.id)) {
      continue; // already consumed as a counterpart of an earlier match
    }
    const pool = (candidatePools.get(rec.id) ?? []).filter((c) => !claimed.has(c.candidate.id));
    const started = Date.now();
    let decision = emptyDecision("no_candidate_found", "empty candidate pool after deterministic tiers");

    if (pool.length === 0) {
      appendFileSync(
        tracePath,
        JSON.stringify({ ts: new Date().toISOString(), recordId: rec.id, poolSize: 0, latencyMs: Date.now() - started, decision, skippedModel: true }) + "\n"
      );
      outcomes.push({
        status: "exception",
        recordId: rec.id,
        source: rec.source,
        reasonCode: "no_candidate_found",
        tier: 3,
        candidatesConsidered: 0,
        reasoning: decision.reasoning,
      });
      continue;
    }

    if (consecutiveErrors >= 2) {
      decision = emptyDecision("model_error", "circuit breaker tripped after consecutive model errors");
      outcomes.push({
        status: "exception",
        recordId: rec.id,
        source: rec.source,
        reasonCode: "low_confidence",
        tier: 3,
        candidatesConsidered: pool.length,
        reasoning: "agentic tier circuit breaker tripped; emitted honest exception",
      });
      continue;
    }

    try {
      const res = await generateObject({
        model: openrouter(MODEL),
        schema: Tier3DecisionSchema,
        schemaName: "ReconciliationDecision",
        system: SYSTEM,
        prompt: JSON.stringify({
          record: rec,
          candidates: pool.map((c) => ({
            id: c.candidate.id,
            source: c.candidate.source,
            date: c.candidate.date,
            amount: c.candidate.amount,
            currency: c.candidate.currency,
            description: c.candidate.description,
            reference: c.candidate.reference,
            score: +c.score.toFixed(3),
            why: c.why,
          })),
        }),
        maxOutputTokens: 400,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(10_000),
      });
      decision = res.object;
      calls++;
      consecutiveErrors = 0;
      tokens += res.usage?.totalTokens ?? 0;
      const meta = (res as { providerMetadata?: Record<string, { cost?: number }> }).providerMetadata;
      costUsd += meta?.openrouter?.cost ?? 0;
    } catch (err) {
      consecutiveErrors++;
      decision = emptyDecision("model_error", `model error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
      calls++;
    }

    appendFileSync(
      tracePath,
      JSON.stringify({ ts: new Date().toISOString(), recordId: rec.id, poolSize: pool.length, latencyMs: Date.now() - started, decision }) + "\n"
    );

    const poolIds = new Set(pool.map((c) => c.candidate.id));
    const ids = (decision.matchedIds ?? []).filter((id) => poolIds.has(id) && !claimed.has(id) && id !== rec.id);
    const confident = decision.confidence >= CONFIDENCE_FLOOR && ids.length > 0;

    if (confident) {
      claimed.add(rec.id);
      for (const id of ids) claimed.add(id);
      const reasoning = decision.reasoning;
      outcomes.push({
        status: "matched",
        recordId: rec.id,
        source: rec.source,
        matchedIds: ids,
        confidence: decision.confidence,
        tier: 3,
        reasonCode: decision.reasonCode,
        reasoning,
      });
      // Reciprocal outcomes so union-find / inspectors see a closed group even
      // if the counterpart never got its own model call.
      const byResidual = new Map(residual.map((r) => [r.id, r]));
      const byCand = new Map(pool.map((c) => [c.candidate.id, c.candidate]));
      for (const id of ids) {
        const other = byCand.get(id) ?? byResidual.get(id);
        if (!other) continue;
        outcomes.push({
          status: "matched",
          recordId: other.id,
          source: other.source,
          matchedIds: [rec.id, ...ids.filter((x) => x !== id)],
          confidence: decision.confidence,
          tier: 3,
          reasonCode: decision.reasonCode,
          reasoning,
        });
      }
    } else {
      outcomes.push({
        status: "exception",
        recordId: rec.id,
        source: rec.source,
        reasonCode: ids.length === 0 && (decision.matchedIds?.length ?? 0) > 0 ? "low_confidence" : decision.reasonCode,
        tier: 3,
        candidatesConsidered: pool.length,
        reasoning: decision.reasoning,
      });
    }
  }

  // Any residual that was skipped because a counterpart claimed it already has
  // a matched outcome. Residuals that never ran and were never claimed become
  // exceptions so every input record has exactly one outcome.
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
        ? "claimed as a counterpart but no reciprocal outcome was written"
        : "never considered — empty pool or skipped",
    });
  }

  return { outcomes, calls, tokens, costUsd };
}
