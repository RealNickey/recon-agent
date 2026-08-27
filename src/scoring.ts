/**
 * Pair-level scoring used by the eval harness.
 *
 * A ground-truth pair is correct only if the pipeline recovered exactly its
 * member set AND the claimed group is a legal cross-source match: at least one
 * settlement-side record (bank or processor) and at least one ledger record.
 * A claimed group whose known outcome sources are all `ledger` is never correct,
 * even if the ID set happens to equal a truth pair. Source annotations are not
 * required on every referenced ID, so one-sided bank→ledger claims still score.
 *
 * A claimed match is a false positive only when it reaches outside that set
 * (wrong counterpart). A correct-but-incomplete claim is a miss, not an FP —
 * so "matched the wrong thing" stays distinct from "didn't match enough".
 *
 * Units are PAIR-LEVEL throughout:
 *   recall    = correctPairs / totalPairs
 *   precision = correctPairs / (correctPairs + falsePositives)   (1 if no claims)
 *   fpr       = falsePositives / totalPairs
 *   fitness   = recall − 2 × fpr
 *
 * FPR is per truth-pair, not per matched record. Mixing those units under-penalizes
 * wrong matches as volume grows and makes the fitness signal gameable.
 *
 * Extra claimed groups made entirely of unknown ids (not in the answer key) each
 * count as one FP. They do not inflate totalPairs, so FPR can exceed 1 — that is
 * intentional: inventing matches on unknown records is still wrong.
 */
import { GroundTruthSchema, RunResultSchema, type GroundTruth, type RunResult } from "./types";
import { contentHash } from "./util";

export interface CatStat {
  pairs: number;
  correctPairs: number;
  falsePos: number;
  missed: number;
  honest: number;
}

export interface FalsePositive {
  recordId: string;
  claimed: string[];
  category: string;
}

export interface ScoreReport {
  ts: string;
  dataset: string;
  truthOrigin: string;
  truthHash: string;
  resultsFile: string;
  fitness: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  falsePositives: number;
  totalPairs: number;
  correctPairs: number;
  matchedRecords: number;
  exceptionRecords: number;
  claimedGroups: number;
  starvedCategories: string[];
  tierBreakdown: Record<number, number>;
  tier3Calls: number;
  tier3Tokens: number;
  tier3CostUsd: number;
  durationMs: number;
  recordsPerSec: number;
  byCategory: Record<string, CatStat>;
  falsePositiveList: FalsePositive[];
}

const setEq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

function findFactory() {
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x)!;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return { find, union };
}

/** Recover claimed match groups from (possibly one-sided) matched outcomes. */
export function claimedMatchGroups(run: RunResult): string[][] {
  const { find, union } = findFactory();
  for (const o of run.outcomes) {
    if (o.status !== "matched") continue;
    find(o.recordId);
    for (const m of o.matchedIds) union(o.recordId, m);
  }
  const groups = new Map<string, Set<string>>();
  for (const o of run.outcomes) {
    if (o.status !== "matched") continue;
    const root = find(o.recordId);
    if (!groups.has(root)) groups.set(root, new Set());
    const s = groups.get(root)!;
    s.add(o.recordId);
    for (const m of o.matchedIds) s.add(m);
  }
  return [...groups.values()].map((g) => [...g].sort());
}

/** True only when every claimed id has a known source and all of them are ledger. Unannotated counterparts may be settlement-side (one-sided claims). */
export function isLedgerOnlyGroup(run: RunResult, claimed: string[]): boolean {
  if (claimed.length === 0) return false;
  const byId = new Map(run.outcomes.map((o) => [o.recordId, o.source]));
  const srcs = claimed.map((id) => byId.get(id));
  if (srcs.some((s) => s === undefined)) return false;
  return srcs.every((s) => s === "ledger");
}

function truthHasSettlementAndLedger(p: GroundTruth["pairs"][number]): boolean {
  const hasSettlement = Boolean(p.bankId || p.processorId || (p.extraBankIds && p.extraBankIds.length > 0));
  return hasSettlement && p.ledgerIds.length > 0;
}

export function scoreRun(
  truth: GroundTruth,
  run: RunResult,
  opts: { dataset?: string; truthOrigin?: string; resultsFile?: string } = {}
): ScoreReport {
  GroundTruthSchema.parse(truth);
  RunResultSchema.parse(run);

  const byId = new Map(run.outcomes.map((o) => [o.recordId, o]));
  const cats = new Map<string, CatStat>();
  const cat = (c: string): CatStat => {
    if (!cats.has(c)) cats.set(c, { pairs: 0, correctPairs: 0, falsePos: 0, missed: 0, honest: 0 });
    return cats.get(c)!;
  };

  let totalPairs = 0;
  let correctPairs = 0;
  let falsePositives = 0;
  const fpList: FalsePositive[] = [];
  const countedFpGroups = new Set<string>();

  const claimedSets = claimedMatchGroups(run);
  const claimedById = new Map<string, string[]>();
  for (const set of claimedSets) for (const id of set) claimedById.set(id, set);

  const truthIds = new Set<string>();
  for (const p of truth.pairs) {
    const ids = [p.bankId, ...(p.extraBankIds ?? []), ...p.ledgerIds, p.processorId].filter((x): x is string => !!x);
    for (const id of ids) truthIds.add(id);
  }

  const markFp = (stat: CatStat, recordId: string, claimed: string[], category: string) => {
    const key = [...claimed].sort().join("\0");
    if (countedFpGroups.has(key)) {
      // same claimed group already penalized (e.g. two truth pairs merged together)
      // still attribute it on the category stat once per truth pair, but the global
      // FP counter stays at one per claimed group so a single bad group cannot
      // dominate fitness just by overlapping many truth pairs.
      stat.falsePos++;
      fpList.push({ recordId, claimed, category });
      return;
    }
    countedFpGroups.add(key);
    stat.falsePos++;
    falsePositives++;
    fpList.push({ recordId, claimed, category });
  };

  for (const p of truth.pairs) {
    const stat = cat(p.category);
    const ids = [p.bankId, ...(p.extraBankIds ?? []), ...p.ledgerIds, p.processorId].filter((x): x is string => !!x).sort();

    if (p.category === "unmatchable") {
      stat.pairs += 1;
      const matchedUnmatchable = ids.filter((id) => byId.get(id)?.status === "matched");
      if (matchedUnmatchable.length === 0) {
        stat.honest += ids.length;
      } else {
        const offender = matchedUnmatchable[0]!;
        markFp(stat, offender, claimedById.get(offender) ?? [], p.category);
      }
      continue;
    }

    if (ids.length < 2) continue;
    totalPairs++;
    stat.pairs++;

    const ok =
      truthHasSettlementAndLedger(p) &&
      ids.every((id) => {
        const claimed = claimedById.get(id);
        return claimed !== undefined && setEq(claimed, ids) && !isLedgerOnlyGroup(run, claimed);
      });

    if (ok) {
      correctPairs++;
      stat.correctPairs++;
    } else {
      const wrongClaim = ids.some((id) => {
        const claimed = claimedById.get(id);
        return claimed !== undefined && claimed.some((c) => !ids.includes(c));
      });
      if (wrongClaim) {
        const offender = ids.find((id) => (claimedById.get(id) ?? []).some((c) => !ids.includes(c)))!;
        markFp(stat, offender, claimedById.get(offender)!, p.category);
      } else {
        stat.missed++;
      }
    }
  }

  for (const set of claimedSets) {
    const unknown = set.filter((id) => !truthIds.has(id));
    if (unknown.length === set.length && set.length > 0) {
      const key = [...set].sort().join("\0");
      if (!countedFpGroups.has(key)) {
        countedFpGroups.add(key);
        falsePositives++;
        fpList.push({ recordId: unknown[0]!, claimed: set.filter((x) => x !== unknown[0]), category: "unknown_record" });
      }
    }
  }

  const matchedRecords = run.outcomes.filter((o) => o.status === "matched").length;
  const decided = correctPairs + falsePositives;
  const precision = decided > 0 ? correctPairs / decided : 1;
  const recall = totalPairs > 0 ? correctPairs / totalPairs : 0;
  const fpr = totalPairs > 0 ? falsePositives / totalPairs : falsePositives > 0 ? 1 : 0;
  const fitness = +(recall - 2 * fpr).toFixed(4);

  const starvedCategories = [...cats.entries()]
    .filter(([c, s]) => c !== "unmatchable" && s.pairs > 0 && s.correctPairs === 0)
    .map(([c]) => c)
    .sort();

  const tierCounts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const o of run.outcomes) if (o.status === "matched") tierCounts[o.tier] = (tierCounts[o.tier] ?? 0) + 1;

  return {
    ts: new Date().toISOString(),
    dataset: opts.dataset ?? "dev",
    truthOrigin: opts.truthOrigin ?? "unknown",
    truthHash: contentHash(JSON.stringify(truth.pairs)),
    resultsFile: opts.resultsFile ?? "",
    fitness,
    precision: +precision.toFixed(4),
    recall: +recall.toFixed(4),
    falsePositiveRate: +fpr.toFixed(4),
    falsePositives,
    totalPairs,
    correctPairs,
    matchedRecords,
    exceptionRecords: run.stats.exceptions,
    claimedGroups: claimedSets.length,
    starvedCategories,
    tierBreakdown: tierCounts,
    tier3Calls: run.stats.tier3Calls,
    tier3Tokens: run.stats.tier3Tokens,
    tier3CostUsd: run.stats.tier3CostUsd,
    durationMs: run.durationMs,
    recordsPerSec: run.durationMs > 0 ? +(run.stats.totalRecords / (run.durationMs / 1000)).toFixed(1) : 0,
    byCategory: Object.fromEntries(cats),
    falsePositiveList: fpList,
  };
}