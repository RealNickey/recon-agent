/**
 * Tier 3 — agentic matching via Vercel AI SDK generateObject.
 * Only sees what tiers 1-2 left behind, with pre-filtered candidate pools.
 * Bounded concurrency via p-limit. Every call is logged to logs/reasoning-trace.jsonl.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import pLimit from "p-limit";
import { appendFileSync } from "node:fs";
import { Tier3DecisionSchema, type FinRecord, type Outcome } from "../types";
import type { Candidate } from "./tier2-fuzzy";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  name: "openrouter",
});

const MODEL = process.env.MODEL ?? "z-ai/glm-5.2:free";
const CONFIDENCE_FLOOR = 0.7;
const CONCURRENCY = 6;

const SYSTEM = `You are a financial reconciliation engine. Given one unresolved record and a small pool of candidate counterpart records from other sources, decide which candidate(s) it matches.

Rules:
- Return matchedIds=null when uncertain. An honest "no match" is always better than a wrong match.
- matchedIds may contain multiple ids ONLY for genuine many-to-one cases (e.g. one bank deposit whose amount equals the sum of several invoices).
- Use reasonCode to classify the situation: timing_gap (dates differ by 1-2 days), amount_variance (amounts differ slightly, fees/FX), id_drift (same invoice, different reference format), many_to_one, duplicate_conflict (multiple equally-valid candidates), no_candidate_found, low_confidence.
- Keep reasoning to 1-2 sentences of concrete evidence (amounts, dates, references).`;

export interface Tier3Result {
  outcomes: Outcome[];
  calls: number;
  tokens: number;
}

export async function tier3Agentic(
  residual: FinRecord[],
  candidatePools: Map<string, Candidate[]>,
  tracePath = "logs/reasoning-trace.jsonl"
): Promise<Tier3Result> {
  const limit = pLimit(CONCURRENCY);
  const outcomes: Outcome[] = [];
  let calls = 0;
  let tokens = 0;
  const claimed = new Set<string>(); // candidate ids already consumed by a many-to-one/1:1 match

  await Promise.all(
    residual.map((rec) =>
      limit(async () => {
        const pool = (candidatePools.get(rec.id) ?? []).filter((c) => !claimed.has(c.candidate.id));
        const started = Date.now();
        let decision;
        try {
          const res = await generateObject({
            model: openrouter(MODEL),
            schema: Tier3DecisionSchema,
            schemaName: "ReconciliationDecision",
            system: SYSTEM,
            prompt: JSON.stringify({ record: rec, candidates: pool.map((c) => ({ ...c.candidate, score: +c.score.toFixed(3) })) }),
            maxOutputTokens: 400,
            maxRetries: 2,
          });
          decision = res.object;
          calls++;
          tokens += res.usage?.totalTokens ?? 0;
        } catch (err) {
          decision = {
            matchedIds: null,
            confidence: 0,
            reasonCode: "low_confidence" as const,
            reasoning: `model error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
          };
          calls++;
        }

        appendFileSync(
          tracePath,
          JSON.stringify({ ts: new Date().toISOString(), recordId: rec.id, poolSize: pool.length, latencyMs: Date.now() - started, decision }) + "\n"
        );

        const confident = decision.confidence >= CONFIDENCE_FLOOR && decision.matchedIds && decision.matchedIds.length > 0;
        if (confident) {
          const ids = decision.matchedIds!.filter((id) => pool.some((c) => c.candidate.id === id));
          if (ids.length > 0) {
            for (const id of ids) claimed.add(id);
            outcomes.push({
              status: "matched",
              recordId: rec.id,
              source: rec.source,
              matchedIds: ids,
              confidence: decision.confidence,
              tier: 3,
              reasonCode: decision.reasonCode,
            });
            return;
          }
        }
        outcomes.push({
          status: "exception",
          recordId: rec.id,
          source: rec.source,
          reasonCode: decision.reasonCode,
          tier: 3,
          candidatesConsidered: pool.length,
        });
      })
    )
  );
  return { outcomes, calls, tokens };
}
