/**
 * Eval harness — THE CORE DELIVERABLE.
 * Compares results/latest-run.json against the answer key and prints/saves metrics.
 *
 * Usage: bun run scripts/eval.ts [--results FILE] [--data DIR]
 *
 * Answer key resolution order:
 *   1. process.env.GROUND_TRUTH_PATH  (points OUTSIDE this repo — preferred)
 *   2. <dataDir>/ground-truth.json    (dev convenience fallback)
 *
 * FITNESS (the number the improvement loop optimizes):
 *   fitness = recall - 2 * falsePositiveRate
 *   A wrong match hurts twice as much as an honest exception. Never game this.
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

function loadTruth(dataDir: string): { truth: GroundTruth; origin: string } {
  const envPath = process.env.GROUND_TRUTH_PATH;
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

// Index pipeline outcomes by record id
const byId = new Map(run.outcomes.map((o) => [o.recordId, o]));

interface CatStat { total: number; correct: number; falsePos: number; missed: number; honest: number }
const cats = new Map<string, CatStat>();
function cat(c: string): CatStat {
  if (!cats.has(c)) cats.set(c, { total: 0, correct: 0, falsePos: 0, missed: 0, honest: 0 });
  return cats.get(c)!;
}

let totalPairs = 0;
let correctPairs = 0;
let falsePositives = 0;
let claimedMatches = 0;
const fpList: { recordId: string; claimed: string[]; expected: string[] | null; category: string }[] = [];

// expected match set per record id, from the answer key
const expected = new Map<string, Set<string>>();
const matchable = new Set<string>();
for (const p of truth.pairs) {
  const ids = [p.bankId, ...p.ledgerIds, p.processorId].filter((x): x is string => !!x);
  if (p.category !== "unmatchable" && ids.length >= 2) {
    totalPairs++;
    for (const id of ids) {
      matchable.add(id);
      expected.set(id, new Set(ids.filter((x) => x !== id)));
    }
  }
}

// score every truth entry
for (const p of truth.pairs) {
  const stat = cat(p.category);
  const ids = [p.bankId, ...p.ledgerIds, p.processorId].filter((x): x is string => !!x);
  stat.total += ids.length;

  if (p.category === "unmatchable") {
    // honest = pipeline raised an exception; falsePos = it claimed a match
    for (const id of ids) {
      const o = byId.get(id);
      if (!o || o.status === "exception") stat.honest++;
      else {
        stat.falsePos++;
        falsePositives++;
        fpList.push({ recordId: id, claimed: o.matchedIds, expected: null, category: p.category });
      }
    }
    continue;
  }

  // matchable pair: correct if every record's claimed match set intersects expected
  let pairCorrect = ids.length >= 2;
  for (const id of ids) {
    const o = byId.get(id);
    const exp = expected.get(id) ?? new Set<string>();
    if (o?.status === "matched") {
      claimedMatches++;
      const hit = o.matchedIds.some((m) => exp.has(m));
      if (hit) stat.correct++;
      else {
        stat.falsePos++;
        falsePositives++;
        fpList.push({ recordId: id, claimed: o.matchedIds, expected: [...exp], category: p.category });
        pairCorrect = false;
      }
    } else {
      stat.missed++;
      pairCorrect = false;
    }
  }
  if (pairCorrect) correctPairs++;
}

// also catch claimed matches on records the key says nothing about (shouldn't happen, but count them)
for (const o of run.outcomes) {
  if (o.status === "matched" && !matchable.has(o.recordId) && !truth.pairs.some((p) => [p.bankId, ...p.ledgerIds, p.processorId].includes(o.recordId))) {
    falsePositives++;
    fpList.push({ recordId: o.recordId, claimed: o.matchedIds, expected: null, category: "unknown_record" });
  }
}

const matchedRecords = run.outcomes.filter((o) => o.status === "matched").length;
const precision = matchedRecords > 0 ? (matchedRecords - falsePositives) / matchedRecords : 0;
const recall = totalPairs > 0 ? correctPairs / totalPairs : 0;
const fpr = claimedMatches > 0 ? falsePositives / claimedMatches : falsePositives > 0 ? 1 : 0;
const fitness = +(recall - 2 * fpr).toFixed(4);

const tierCounts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
for (const o of run.outcomes) if (o.status === "matched") tierCounts[o.tier]++;

const report = {
  ts: new Date().toISOString(),
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
  durationMs: run.durationMs,
  recordsPerSec: +(run.stats.totalRecords / (run.durationMs / 1000)).toFixed(1),
  byCategory: Object.fromEntries(cats),
};

mkdirSync("logs", { recursive: true });
appendFileSync("logs/eval-history.jsonl", JSON.stringify(report) + "\n");

console.log("\n=== RECONCILIATION EVAL ===");
console.log(`answer key: ${origin} (hash ${report.truthHash})  results: ${RESULTS}`);
console.log(`fitness=${report.fitness}  recall=${report.recall}  precision=${report.precision}  FPR=${report.falsePositiveRate}`);
console.log(`pairs: ${correctPairs}/${totalPairs} correct, ${falsePositives} false positives`);
console.log(`tiers: T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]}  |  tier3 calls=${run.stats.tier3Calls} tokens=${run.stats.tier3Tokens}  |  ${report.recordsPerSec} rec/s`);
console.log("\nby category (correct / falsePos / missed / honest):");
for (const [c, s] of [...cats.entries()].sort()) {
  console.log(`  ${c.padEnd(18)} total=${String(s.total).padStart(3)}  ok=${String(s.correct).padStart(3)}  fp=${String(s.falsePos).padStart(2)}  miss=${String(s.missed).padStart(2)}  honest=${String(s.honest).padStart(2)}`);
}
if (fpList.length) {
  console.log("\nfalse positives (WORSE than exceptions — fix these first):");
  for (const f of fpList.slice(0, 15)) console.log(`  ${f.recordId} [${f.category}] claimed=${JSON.stringify(f.claimed)} expected=${JSON.stringify(f.expected)}`);
}
