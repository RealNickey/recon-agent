/**
 * loop-eval.ts — Automated loop evaluation runner and guard checker.
 *
 * Runs the hard pipeline, dev pipeline, and holdout pipeline, verifies all regression locks,
 * and prints a clean structured summary + JSON report for autonomous agents.
 *
 * Usage:
 *   bun run scripts/loop-eval.ts [--ai] [--json]
 *
 * Exit Codes:
 *   0 = All guards passed, no regression.
 *   1 = Hard eval ran but has regressions or errors.
 *   2 = Dev or Holdout regression lock BROKEN.
 */
import { readFileSync, existsSync } from "node:fs";
import { runPipeline } from "../src/pipeline/run";
import { scoreRun, type ScoreReport } from "../src/scoring";
import { GroundTruthSchema, RunResultSchema, type GroundTruth } from "../src/types";
import { resolveExternalTruthPath, PINNED_TRUTH_HASHES } from "../src/util";
import { runCrossValidation, type CrossValidationSummary } from "./cross-validate";

const args = process.argv.slice(2);
const USE_AI = args.includes("--ai");
const JSON_ONLY = args.includes("--json");
const IS_BLIND = args.includes("--blind");
const CHECK_CV = args.includes("--cv") || args.includes("--generalization");


function loadTruth(datasetName: string): { truth: GroundTruth; origin: string } | null {
  const envPath = resolveExternalTruthPath(datasetName);
  if (!envPath || !existsSync(envPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(envPath, "utf8"));
    return { truth: GroundTruthSchema.parse(raw), origin: envPath };
  } catch (err) {
    return null;
  }
}

async function main() {
  const t0 = performance.now();

  // 1. Run Hard Pipeline & Eval
  if (!JSON_ONLY) console.log("⏳ [1/3] Running Hard Pipeline...");
  const hardTruthObj = loadTruth("hard");
  if (!hardTruthObj) {
    console.error("❌ GROUND_TRUTH_HARD_PATH not found or invalid.");
    process.exit(1);
  }
  const hardRun = await runPipeline("data/hard", "results/hard-run.json", USE_AI);
  const hardScore = scoreRun(hardTruthObj.truth, hardRun, {
    dataset: "hard",
    truthOrigin: hardTruthObj.origin,
    resultsFile: "results/hard-run.json",
  });
  if (PINNED_TRUTH_HASHES.hard && hardScore.truthHash !== PINNED_TRUTH_HASHES.hard) {
    console.error(`❌ HARD TRUTH HASH MISMATCH: expected ${PINNED_TRUTH_HASHES.hard}, got ${hardScore.truthHash}`);
    process.exit(1);
  }

  // 2. Run Dev Pipeline & Eval (Regression Lock)
  if (!JSON_ONLY) console.log("⏳ [2/3] Checking Dev Regression Lock...");
  const devTruthObj = loadTruth("dev");
  let devScore: ScoreReport | null = null;
  if (devTruthObj) {
    const devRun = await runPipeline("data", "results/latest-run.json", false);
    devScore = scoreRun(devTruthObj.truth, devRun, {
      dataset: "dev",
      truthOrigin: devTruthObj.origin,
      resultsFile: "results/latest-run.json",
    });
    if (PINNED_TRUTH_HASHES.dev && devScore.truthHash !== PINNED_TRUTH_HASHES.dev) {
      console.error(`❌ DEV TRUTH HASH MISMATCH: expected ${PINNED_TRUTH_HASHES.dev}, got ${devScore.truthHash}`);
      process.exit(2);
    }
  }

  // 3. Run Holdout Pipeline & Eval (Regression Lock)
  if (!JSON_ONLY) console.log("⏳ [3/3] Checking Holdout Regression Lock...");
  const holdoutTruthObj = loadTruth("holdout");
  let holdoutScore: ScoreReport | null = null;
  if (holdoutTruthObj) {
    const holdoutRun = await runPipeline("data/holdout", "results/holdout-run.json", false);
    holdoutScore = scoreRun(holdoutTruthObj.truth, holdoutRun, {
      dataset: "holdout",
      truthOrigin: holdoutTruthObj.origin,
      resultsFile: "results/holdout-run.json",
    });
    if (PINNED_TRUTH_HASHES.holdout && holdoutScore.truthHash !== PINNED_TRUTH_HASHES.holdout) {
      console.error(`❌ HOLDOUT TRUTH HASH MISMATCH: expected ${PINNED_TRUTH_HASHES.holdout}, got ${holdoutScore.truthHash}`);
      process.exit(2);
    }
  }

  // 4. Optional Cross-Validation Generalization Check
  let cvSummary: CrossValidationSummary | null = null;
  let cvPassed = true;
  if (CHECK_CV) {
    if (!JSON_ONLY) console.log("⏳ [4/4] Running Multi-Seed Generalization Check (Seeds 123, 555, 2026)...");
    cvSummary = await runCrossValidation([123, 555, 2026], "all", USE_AI);
    cvPassed = cvSummary.totalFalsePositives === 0 && cvSummary.minFitness >= 0.85;
  }

  const durationSec = +((performance.now() - t0) / 1000).toFixed(2);

  // Guards verification
  const devPassed = !devScore || devScore.fitness >= 1.0;
  const holdoutPassed = !holdoutScore || holdoutScore.fitness >= 1.0;
  const locksPassed = devPassed && holdoutPassed && cvPassed;

  const resultSummary = {
    pass: locksPassed,
    guards: {
      devLock: devPassed ? "PASSED (1.0000)" : `FAILED (${devScore?.fitness})`,
      holdoutLock: holdoutPassed ? "PASSED (1.0000)" : `FAILED (${holdoutScore?.fitness})`,
      generalization: CHECK_CV ? (cvPassed ? `PASSED (mean=${cvSummary?.meanFitness})` : `FAILED (min=${cvSummary?.minFitness}, FPs=${cvSummary?.totalFalsePositives})`) : "SKIPPED",
    },
    hard: {
      fitness: hardScore.fitness,
      recall: hardScore.recall,
      precision: hardScore.precision,
      falsePositiveRate: hardScore.falsePositiveRate,
      falsePositives: hardScore.falsePositives,
      pairs: `${hardScore.correctPairs}/${hardScore.totalPairs}`,
      starvedCategories: hardScore.starvedCategories,
      tierBreakdown: hardScore.tierBreakdown,
      cashPosition: hardRun.cashPosition ?? null,
    },
    dev: devScore
      ? {
          fitness: devScore.fitness,
          pairs: `${devScore.correctPairs}/${devScore.totalPairs}`,
          falsePositives: devScore.falsePositives,
        }
      : null,
    holdout: holdoutScore
      ? {
          fitness: holdoutScore.fitness,
          pairs: `${holdoutScore.correctPairs}/${holdoutScore.totalPairs}`,
          falsePositives: holdoutScore.falsePositives,
        }
      : null,
    crossValidation: cvSummary
      ? {
          meanFitness: cvSummary.meanFitness,
          minFitness: cvSummary.minFitness,
          totalFalsePositives: cvSummary.totalFalsePositives,
        }
      : null,
    durationSec,
  };

  if (JSON_ONLY) {
    console.log(JSON.stringify(resultSummary, null, 2));
  } else {
    console.log("\n=================== LOOP EVAL SUMMARY ===================");
    console.log(`⏱️ Duration: ${durationSec}s | Hard AI: ${USE_AI ? "ENABLED" : "DISABLED"}`);
    console.log(`\n🔒 REGRESSION LOCKS:`);
    console.log(`   Dev Lock (Seed 42 + BenchRec):     ${devPassed ? "✅ LOCKED (1.0000)" : "❌ BROKEN (" + devScore?.fitness + ")"}`);
    console.log(`   Holdout Lock (Seed 777 Synthetic):  ${holdoutPassed ? "✅ LOCKED (1.0000)" : "❌ BROKEN (" + holdoutScore?.fitness + ")"}`);
    if (CHECK_CV) {
      console.log(`   Generalization Guard:              ${cvPassed ? "✅ PASSED (mean " + cvSummary?.meanFitness.toFixed(4) + ")" : "❌ FAILED"}`);
    }

    console.log(`\n🎯 HARD EVALUATION (Seed 999):`);
    console.log(`   Fitness:     ${hardScore.fitness} (Recall: ${hardScore.recall}, Precision: ${hardScore.precision}, FPR: ${hardScore.falsePositiveRate})`);
    console.log(`   Pairs:       ${hardScore.correctPairs}/${hardScore.totalPairs} correct, ${hardScore.falsePositives} false positives`);
    console.log(`   Tiers:       T1=${hardScore.tierBreakdown[1] ?? 0} | T2=${hardScore.tierBreakdown[2] ?? 0} | T3=${hardScore.tierBreakdown[3] ?? 0}`);

    if (hardRun.cashPosition) {
      const cpStr = Object.values(hardRun.cashPosition)
        .map((p) => `${p.currency} Reconciled=$${p.reconciledAmount.toLocaleString()} Unreconciled=$${p.unreconciledAmount.toLocaleString()}`)
        .join(" | ");
      console.log(`   Cash Pos:    ${cpStr}`);
    }

    if (hardScore.starvedCategories.length > 0) {
      console.log(`   🔴 Starved:  ${hardScore.starvedCategories.join(", ")}`);
    } else {
      console.log(`   ✅ Starved:  None (all categories have at least 1 correct pair)`);
    }

    if (!IS_BLIND && hardScore.falsePositiveList.length > 0) {
      console.log(`\n⚠️ FALSE POSITIVES (${hardScore.falsePositives}):`);
      for (const fp of hardScore.falsePositiveList.slice(0, 5)) {
        console.log(`   ${fp.recordId} [${fp.category}] claimed: ${JSON.stringify(fp.claimed)}`);
      }
    }

    console.log("=========================================================\n");
  }

  if (!locksPassed) {
    console.error("❌ REGRESSION LOCK OR GENERALIZATION VIOLATION: fitness dropped or regression detected. Revert change!");
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error in loop-eval:", err);
  process.exit(1);
});
