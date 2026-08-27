/**
 * Eval harness — THE CORE DELIVERABLE.
 * Compares a pipeline run against the answer key and prints/saves metrics.
 *
 * Usage: bun run scripts/eval.ts [--results FILE] [--data DIR]
 *
 * Answer key resolution:
 *   GROUND_TRUTH_PATH            (points OUTSIDE this repo — required)
 *   GROUND_TRUTH_HOLDOUT_PATH    (used when --data includes "holdout")
 *
 * There is NO in-repo fallback. The ground truth must never live next to the
 * pipeline so an autonomous improvement agent cannot cheat by reading answers.
 *
 * FITNESS (the number the improvement loop optimizes):
 *   fitness = recall - 2 * falsePositiveRate
 *   Units are pair-level throughout. A wrong match hurts twice as much as an
 *   honest exception. Never game this.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { GroundTruthSchema, RunResultSchema, type GroundTruth } from "../src/types";
import { scoreRun } from "../src/scoring";
import { resolveExternalTruthPath } from "../src/util";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const RESULTS = argVal("--results", "results/latest-run.json");
const DATA = argVal("--data", "data");
const IS_HOLDOUT = DATA.includes("holdout");

function loadTruth(): { truth: GroundTruth; origin: string } {
  const envPath = resolveExternalTruthPath(IS_HOLDOUT);
  if (!envPath) {
    console.error("No answer key found. Set GROUND_TRUTH_PATH (outside this repo).");
    process.exit(1);
  }
  if (!existsSync(envPath)) {
    console.error("Answer key path does not exist (path omitted).");
    process.exit(1);
  }
  return { truth: GroundTruthSchema.parse(JSON.parse(readFileSync(envPath, "utf8"))), origin: "env" };
}

const { truth, origin } = loadTruth();
if (!existsSync(RESULTS)) {
  console.error(`Results file not found: ${RESULTS}`);
  process.exit(1);
}
const run = RunResultSchema.parse(JSON.parse(readFileSync(RESULTS, "utf8")));
const report = scoreRun(truth, run, {
  dataset: IS_HOLDOUT ? "holdout" : "dev",
  truthOrigin: origin,
  resultsFile: RESULTS,
});

mkdirSync("logs", { recursive: true });
const { falsePositiveList, ...rest } = report;
const logged = { ...rest, falsePositiveList: falsePositiveList.slice(0, 25) };
appendFileSync("logs/eval-history.jsonl", JSON.stringify(logged) + "\n");

console.log("\n=== RECONCILIATION EVAL ===");
console.log(`dataset: ${report.dataset}  answer key: ${origin} (hash ${report.truthHash})  results: ${RESULTS}`);
console.log(`fitness=${report.fitness}  recall=${report.recall}  precision=${report.precision}  FPR=${report.falsePositiveRate}`);
console.log(`pairs: ${report.correctPairs}/${report.totalPairs} correct, ${report.falsePositives} false positives  claimedGroups=${report.claimedGroups}`);
console.log(`tiers: T1=${report.tierBreakdown[1] ?? 0} T2=${report.tierBreakdown[2] ?? 0} T3=${report.tierBreakdown[3] ?? 0}  |  tier3 calls=${report.tier3Calls} tokens=${report.tier3Tokens} cost=usd${report.tier3CostUsd}  |  ${report.recordsPerSec} rec/s`);
console.log("\nby category (pairs: correct / falsePos / missed / honest):");
for (const [c, s] of Object.entries(report.byCategory).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${c.padEnd(18)} pairs=${String(s.pairs).padStart(3)}  ok=${String(s.correctPairs).padStart(3)}  fp=${String(s.falsePos).padStart(2)}  miss=${String(s.missed).padStart(2)}  honest=${String(s.honest).padStart(2)}`);
}

if (report.starvedCategories?.length) {
  console.log("\nSTARVED categories (0 correct pairs — do not ignore): " + report.starvedCategories.join(", "));
}

if (IS_HOLDOUT) {
  const histPath = "logs/eval-history.jsonl";
  if (existsSync(histPath)) {
    const prev = readFileSync(histPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x) => x && x.dataset === "holdout" && typeof x.fitness === "number");
    // last line is the run we just appended; compare against the one before it
    const prior = prev.length >= 2 ? prev[prev.length - 2] : null;
    if (prior) {
      const delta = report.fitness - prior.fitness;
      console.log(`holdout regression check: prior fitness=${prior.fitness}  now=${report.fitness}  delta=${delta.toFixed(4)}`);
      if (delta < -0.05) {
        console.error("HOLDOUT REGRESSION: fitness dropped more than 0.05 versus previous holdout eval.");
        process.exitCode = 2;
      }
    }
  }
}
if (falsePositiveList.length) {
  console.log("\nfalse positives (WORSE than exceptions — fix these first):");
  for (const f of falsePositiveList.slice(0, 15)) {
    console.log(`  ${f.recordId} [${f.category}] claimed=${JSON.stringify(f.claimed)}`);
  }
}
