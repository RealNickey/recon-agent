/**
 * Tier 2 — deterministic fuzzy matching. No AI.
 * Scores residual records against each other on amount tolerance, date window,
 * and description/reference similarity. Auto-commits only >= 0.95; everything
 * else goes to tier 3 with a small candidate pool.
 *
 * Design note: the candidate pool is deliberately generous (any non-zero
 * similarity signal, up to 8) — tier 2's job is RECALL of plausible pairs,
 * tier 3's job is the precision decision. A pool that starves tier 3 of
 * candidates is a pipeline bug, not caution.
 */
import Decimal from "decimal.js";
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
const MAX_POOL = 8;

function amountScore(a: FinRecord, b: FinRecord): number {
  const da = new Decimal(a.amount);
  const db = new Decimal(b.amount);
  if (da.isZero() || db.isZero()) return 0;
  const pctDiff = da.minus(db).abs().div(Decimal.max(da.abs(), db.abs())).toNumber();
  if (pctDiff <= 0.005) return 0.5; // within ~0.5% (fees/rounding)
  if (pctDiff <= 0.03) return 0.35; // plausible fee/FX band
  if (pctDiff <= 0.10) return 0.15; // weak but worth showing tier 3
  return 0;
}

function dateScore(a: FinRecord, b: FinRecord): number {
  const d = daysBetween(a.date, b.date);
  if (d === 0) return 0.25;
  if (d <= 2) return 0.18; // T+1/T+2 settlement
  if (d <= 5) return 0.08;
  return 0;
}

function descScore(a: FinRecord, b: FinRecord): number {
  const refSim = normalizeRef(a.reference) === normalizeRef(b.reference) ? 1 : 0;
  return Math.max(tokenSim(a.description, b.description), refSim) * 0.25;
}

function scorePair(a: FinRecord, b: FinRecord): number {
  if (a.source === b.source) return 0;
  return amountScore(a, b) + dateScore(a, b) + descScore(a, b);
}

export function tier2Fuzzy(residual: FinRecord[]): Tier2Result {
  const outcomes: Outcome[] = [];
  const candidatePools = new Map<string, Candidate[]>();
  const used = new Set<string>();

  // Candidate pools: any cross-source record with a non-zero signal. Recall-first.
  for (const r of residual) {
    const pool: Candidate[] = [];
    for (const other of residual) {
      if (other.id === r.id) continue;
      const s = scorePair(r, other);
      if (s > 0) pool.push({ candidate: other, score: s });
    }
    pool.sort((x, y) => y.score - x.score);
    candidatePools.set(r.id, pool.slice(0, MAX_POOL));
  }

  // Greedy auto-commit on high-confidence mutual pairs.
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
