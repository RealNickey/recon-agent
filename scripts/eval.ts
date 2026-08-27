/**
 * Eval harness — THE CORE DELIVERABLE.
 * Compares a pipeline run against the answer key and prints/saves metrics.
 *
 * Usage: bun run scripts/eval.ts [--results FILE] [--data DIR]
 *
 * Answer key resolution order:
 *   1. process.env.GROUND_TRUTH_PATH        (points OUTSIDE this repo — preferred)
 *      For a holdout eval, GROUND_TRUTH_HOLDOUT_PATH is used instead.
 *   2. <dataDir>/ground-truth.json          (dev convenience fallback)
 *
 * FITNESS (the number the improvement loop optimizes):
 *   fitness = recall - 2 * falsePositiveRate
 *   A wrong match hurts twice as much as an honest exception. Never game this.
 *
 * Scoring is PAIR-LEVEL: a ground-truth pair is correct only if the pipeline
 * recovered exactly its member set. A claimed match is a false positive only
 * when it is WRONG — a correct-but-incomplete claim (e.g. matched one leg of a
 * duplicate pair, or a 1:1 subset of a many-to-one) is a miss, not a false
 * positive. This keeps the FP metric honest: FPs mean "you matched the wrong
 * thing", not "you didn't match enough".
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GroundTruthSchema, RunResultSchema, type GroundTruth, type RunResult } from "../src/types";
import { contentHash } from "../src/util";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const RESULTS = argVal("--results", "results/latest-run.json");
const DATA = argVal("--data", "data");
const IS_HOLDOUT = DATA.includes("holdout");

function loadTruth(dataDir: string): { truth: GroundTruth; origin: string } {
  const envPath = IS_HOLDOUT
    ? process.env.GROUND_TRUTH_HOLDOUT_PATH ?? process.env.GROUND_TRUTH_PATH
    : process.env.GROUND_TRUTH_PATH;
  if (envPath && existsSync(envPath)) {
    return { truth: GroundTruthSchema.parse(JSON.parse(readFileSync(envPath, "utf8"))), origin: "env" };
  }
  const local = join(dataDir, "ground-truth.json");
  if (existsSync(local)) {
    return { truth: GroundTruthSchema.parse(JSON.parse(readFileSync(local, "utf8"))), origin: "local" };
  }
  console.error("No answer key found. Set GROUND_TRUTH_PATH or generate data first.");
  process.exit(1);
}

const { truth, origin } = loadTruth(DATA);
const run: RunResult = RunResultSchema.parse(JSON.parse(readFileSync(RESULTS, "utf8")));

const byId = new Map(run.outcomes.map((o) => [o.recordId, o]));

interface CatStat { pairs: number; correctPairs: number; falsePos: number; missed: number; honest: number }
const cats = new Map<string, CatStat>();
function cat(c: string): CatStat {
  if (!cats.has(c)) cats.set(c, { pairs: 0, correctPairs: 0, falsePos: 0, missed: 0, honest: 0 });
  return cats.get(c)!;
}

let totalPairs = 0;
let correctPairs = 0;
let falsePositives = 0;
const fpList: { recordId: string; claimed: string[]; expected: string[] | null; category: string }[] = [];

// Union-find over matchedIds edges to recover claimed match groups.
const parent = new Map<string, string>();
function find(x: string): string {
  if (!parent.has(x)) parent.set(x, x);
  if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
  return parent.get(x)!;
}
function union(a: string, b: string) { parent.set(find(a), find(b)); }
for (const o of run.outcomes) {
  if (o.status === "matched") for (const m of o.matchedIds) union(o.recordId, m);
}
const claimedGroups = new Map<string, string[]>();
for (const o of run.outcomes) {
  if (o.status === "matched") {
    const root = find(o.recordId);
    if (!claimedGroups.has(root)) claimedGroups.set(root, []);
    claimedGroups.get(root)!.push(o.recordId);
  }
}
const claimedSets = [...claimedGroups.values()].map((g) => [...new Set(g)].sort());
const claimedById = new Map<string, string[]>();
for (const set of claimedSets) for (const id of set) claimedById.set(id, set);

const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// Every id that appears in ANY matchable truth pair (the "matchable universe").
const inMatchableUniverse = new Set<string>();
for (const p of truth.pairs) {
  if (p.category === "unmatchable") continue;
  for (const id of [p.bankId, ...p.ledgerIds, p.processorId]) if (id) inMatchableUniverse.add(id);
}

for (const p of truth.pairs) {
  const stat = cat(p.category);
  const ids = [p.bankId, ...p.ledgerIds, p.processorId].filter((x): x is string => !!x).sort();

  if (p.category === "unmatchable") {
    stat.pairs += ids.length;
    for (const id of ids) {
      const o = byId.get(id);
      if (!o || o.status === "exception") stat.honest++;
      else {
        // claimed a match on a record with NO counterpart — a genuine false positive
        stat.falsePos++;
        falsePositives++;
        fpList.push({ recordId: id, claimed: o.matchedIds, expected: null, category: p.category });
      }
    }
    continue;
  }

  if (ids.length < 2) continue;
  totalPairs++;
  stat.pairs++;

  const ok = ids.every((id) => {
    const claimed = claimedById.get(id);
    return claimed && setEq(claimed, ids);
  });

  if (ok) {
    correctPairs++;
    stat.correctPairs++;
  } else {
    // A claim is a FALSE POSITIVE only if it reaches outside this pair's true set
    // (wrong counterpart). A correct-but-incomplete claim is a miss.
    const wrongClaim = ids.some((id) => {
      const claimed = claimedById.get(id);
      return claimed && claimed.some((c) => !ids.includes(c));
    });
    if (wrongClaim) {
      stat.falsePos++;
      falsePositives++;
      const offender = ids.find((id) => (claimedById.get(id) ?? []).some((c) => !ids.includes(c)))!;
      fpList.push({ recordId: offender, claimed: claimedById.get(offender)!, expected: ids, category: p.category });
    } else {
      stat.missed++;
    }
  }
}

// Catch claimed matches on records outside the matchable universe entirely.
for (const set of claimedSets) {
  if (set.every((id) => !inMatchableUniverse.has(id))) {
    // a claimed group made of only unmatchable/unknown records — but unmatchable
    // records are already scored above, so only count truly unknown ones here
    const unknown = set.filter((id) => !truth.pairs.some((p) => [p.bankId, ...p.ledgerIds, p.processorId].includes(id)));
    if (unknown.length) {
      falsePositives += unknown.length;
      for (const id of unknown) fpList.push({ recordId: id, claimed: set.filter((x) => x !== id), expected: null, category: "unknown_record" });
    }
  }
}

const matchedRecords = run.outcomes.filter((o) => o.status === "matched").length;
const precision = matchedRecords > 0 ? (matchedRecords - falsePositives) / matchedRecords : 0;
const recall = totalPairs > 0 ? correctPairs / totalPairs : 0;
const fpr = matchedRecords > 0 ? falsePositives / matchedRecords : falsePositives > 0 ? 1 : 0;
const fitness = +(recall - 2 * fpr).toFixed(4);

const tierCounts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
for (const o of run.outcomes) if (o.status === "matched") tierCounts[o.tier]++;

const report = {
  ts: new Date().toISOString(),
  dataset: IS_HOLDOUT ? "holdout" : "dev",
  truthOrigin: origin,
  truthHash: contentHash(JSON.stringify(truth.pairs)),
  resultsFile: RESULTS,
  fitness,
  precision: +precision.toFixed(4),
  recall: +recall.toFixed(4),
  falsePositiveRate: +fpr.toFixed(4),
  falsePositives,
  totalPairs,
  correctPairs,
  matchedRecords,
  exceptionRecords: run.stats.exceptions,
  tierBreakdown: tierCounts,
  tier3Calls: run.stats.tier3Calls,
  tier3Tokens: run.stats.tier3Tokens,
  tier3CostUsd: run.stats.tier3CostUsd,
  durationMs: run.durationMs,
  recordsPerSec: +(run.stats.totalRecords / (run.durationMs / 1000)).toFixed(1),
  byCategory: Object.fromEntries(cats),
};

mkdirSync("logs", { recursive: true });
appendFileSync("logs/eval-history.jsonl", JSON.stringify(report) + "\n");

console.log("\n=== RECONCILIATION EVAL ===");
console.log(`dataset: ${report.dataset}  answer key: ${origin} (hash ${report.truthHash})  results: ${RESULTS}`);
console.log(`fitness=${report.fitness}  recall=${report.recall}  precision=${report.precision}  FPR=${report.falsePositiveRate}`);
console.log(`pairs: ${correctPairs}/${totalPairs} correct, ${falsePositives} false positives`);
console.log(`tiers: T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]}  |  tier3 calls=${run.stats.tier3Calls} tokens=${run.stats.tier3Tokens} cost=usd${run.stats.tier3CostUsd}  |  ${report.recordsPerSec} rec/s`);
console.log("\nby category (pairs: correct / falsePos / missed / honest):");
for (const [c, s] of [...cats.entries()].sort()) {
  console.log(`  ${c.padEnd(18)} pairs=${String(s.pairs).padStart(3)}  ok=${String(s.correctPairs).padStart(3)}  fp=${String(s.falsePos).padStart(2)}  miss=${String(s.missed).padStart(2)}  honest=${String(s.honest).padStart(2)}`);
}
if (fpList.length) {
  console.log("\nfalse positives (WORSE than exceptions — fix these first):");
  for (const f of fpList.slice(0, 15)) console.log(`  ${f.recordId} [${f.category}] claimed=${JSON.stringify(f.claimed)} expected=${JSON.stringify(f.expected)}`);
}
