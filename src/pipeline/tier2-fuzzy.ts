/**
 * Tier 2 — deterministic fuzzy matching. No AI.
 * Scores residual records against each other on amount tolerance, date window,
 * and description similarity. Auto-commits only >= 0.95; passes the rest (with
 * a small candidate pool) to tier 3.
 */
import { amountsClose, daysBetween, tokenSim, normalizeRef } from "../normalize";
import type { FinRecord, Outcome } from "../types";
import type { TierResult } from "./tier1-exact";

export interface Candidate {
  candidate: FinRecord;
  score: number;
}

export interface Tier2Result extends TierResult {
  /** residual record id -> top candidate pool for tier 3 */
  candidatePools: Map<string, Candidate[]>;
}

const AUTO = 0.95;
const PASS_DOWN = 0.45;
const MAX_POOL = 8;

function scorePair(a: FinRecord, b: FinRecord): number {
  if (a.source === b.source) return 0;
  const amtScore = amountsClose(a.amount, b.amount, 0.05, 0.005) ? 0.5 : 0;
  if (amtScore === 0) return 0; // hard gate: money must be close
  const dDays = daysBetween(a.date, b.date);
  const dateScore = dDays === 0 ? 0.25 : dDays <= 2 ? 0.18 : dDays <= 5 ? 0.08 : 0;
  const refSim = normalizeRef(a.reference) === normalizeRef(b.reference) ? 1 : 0;
  const descScore = Math.max(tokenSim(a.description, b.description), refSim) * 0.25;
  return amtScore + dateScore + descScore;
}

export function tier2Fuzzy(residual: FinRecord[]): Tier2Result {
  const outcomes: Outcome[] = [];
  const candidatePools = new Map<string, Candidate[]>();
  const used = new Set<string>();

  // build candidate pools for everything first (needed for tier 3 regardless)
  for (const r of residual) {
    const pool: Candidate[] = [];
    for (const other of residual) {
      if (other.id === r.id) continue;
      const s = scorePair(r, other);
      if (s >= PASS_DOWN) pool.push({ candidate: other, score: s });
    }
    pool.sort((x, y) => y.score - x.score);
    candidatePools.set(r.id, pool.slice(0, MAX_POOL));
  }

  // greedy auto-commit on mutual best scores >= AUTO
  const scored: { a: FinRecord; b: FinRecord; s: number }[] = [];
  for (const r of residual) {
    const best = candidatePools.get(r.id)?.[0];
    if (best && best.score >= AUTO) scored.push({ a: r, b: best.candidate, s: best.score });
  }
  scored.sort((x, y) => y.s - x.s);
  for (const { a, b, s } of scored) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id); used.add(b.id);
    outcomes.push(
      { status: "matched", recordId: a.id, source: a.source, matchedIds: [b.id], confidence: s, tier: 2 },
      { status: "matched", recordId: b.id, source: b.source, matchedIds: [a.id], confidence: s, tier: 2 }
    );
  }

  const stillResidual = residual.filter((r) => !used.has(r.id));
  return { outcomes, residual: stillResidual, candidatePools };
}
