/**
 * Multi-Seed Cross-Validation & Generalization Suite.
 * Proves that the reconciliation engine generalizes robustly across independent
 * synthetic populations rather than memorizing a single dataset.
 *
 * Usage: bun run scripts/cross-validate.ts [--seeds N] [--mode standard|hard|all]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { generateDataset } from "./generate-data";
import { tier1Exact } from "../src/pipeline/tier1-exact";
import { tier2Fuzzy } from "../src/pipeline/tier2-fuzzy";
import { tier3Agentic } from "../src/pipeline/tier3-agentic";
import { scoreRun, type ScoreReport } from "../src/scoring";
import type { FinRecord, GroundTruth, Outcome, RunResult } from "../src/types";

import { hasApprovedProvider } from "../src/pipeline/agentic-providers";

const args = process.argv.slice(2);
const SEED_LIST = [42, 123, 555, 777, 999, 2026, 4040];
const modeArg = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "all";
const useAiArg = args.includes("--ai");

interface SeedResult {
  seed: number;
  mode: "standard" | "hard";
  totalRecords: number;
  totalPairs: number;
  correctPairs: number;
  falsePositives: number;
  fitness: number;
  recall: number;
  precision: number;
  fpr: number;
  durationMs: number;
  tier1: number;
  tier2: number;
  tier3: number;
}

export interface CrossValidationSummary {
  timestamp: string;
  totalRuns: number;
  modesEvaluated: string[];
  seeds: number[];
  meanFitness: number;
  minFitness: number;
  maxFitness: number;
  stdDevFitness: number;
  meanRecall: number;
  meanPrecision: number;
  meanFPR: number;
  totalFalsePositives: number;
  results: SeedResult[];
}

export async function runCrossValidation(
  seeds = SEED_LIST,
  mode: "standard" | "hard" | "all" = "all",
  useAi = useAiArg
): Promise<CrossValidationSummary> {
  const results: SeedResult[] = [];
  const modesToTest: ("standard" | "hard")[] = mode === "all" ? ["standard", "hard"] : [mode];

  console.log(`\n===============================================================`);
  console.log(`🔄 RECON AGENT — MULTI-SEED GENERALIZATION BENCHMARK`);
  console.log(`Evaluating across ${seeds.length} seeds in modes: [${modesToTest.join(", ")}] | AI: ${useAi ? "ENABLED" : "DISABLED (Deterministic)"}`);
  console.log(`===============================================================\n`);

  for (const testMode of modesToTest) {
    for (const seed of seeds) {
      const t0 = performance.now();
      const dataset = generateDataset(seed, testMode);
      const allRecords = [...dataset.bank, ...dataset.ledger, ...dataset.processor];

      // Run complete 3-tier pipeline cascade
      const t1 = tier1Exact(allRecords);
      const t2 = t1.residual.length
        ? tier2Fuzzy(t1.residual)
        : { outcomes: [] as Outcome[], residual: [] as FinRecord[], candidatePools: new Map() };

      let t3 = { outcomes: [] as Outcome[], calls: 0, tokens: 0, costUsd: 0 };
      if (useAi && hasApprovedProvider() && t2.residual.length > 0) {
        t3 = await tier3Agentic(t2.residual, t2.candidatePools);
      } else {
        for (const r of t2.residual) {
          const pool = t2.candidatePools.get(r.id) ?? [];
          t3.outcomes.push({
            status: "exception",
            recordId: r.id,
            source: r.source,
            reasonCode: pool.length === 0 ? "no_candidate_found" : r.currency !== "USD" ? "currency_mismatch" : "low_confidence",
            tier: 2,
            candidatesConsidered: pool.length,
            reasoning: pool.length === 0 ? "no cross-source candidate survived blocking" : "honest exception after deterministic tiers",
          });
        }
      }

      const outcomes = [...t1.outcomes, ...t2.outcomes, ...t3.outcomes];
      const durationMs = Math.round(performance.now() - t0);

      const runResult: RunResult = {
        startedAt: new Date(Date.now() - durationMs).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs,
        model: useAi && hasApprovedProvider() ? process.env.MODEL ?? "agentic-ai" : "deterministic-tiers",
        outcomes,
        stats: {
          totalRecords: allRecords.length,
          matched: outcomes.filter((o) => o.status === "matched").length,
          exceptions: outcomes.filter((o) => o.status === "exception").length,
          tier3Calls: t3.calls,
          tier3Tokens: t3.tokens,
          tier3CostUsd: t3.costUsd,
        },
      };

      const groundTruth: GroundTruth = {
        meta: { seed, generatedAt: new Date().toISOString(), counts: {} },
        pairs: dataset.truth,
      };

      const report: ScoreReport = scoreRun(groundTruth, runResult, {
        dataset: `${testMode}-seed-${seed}`,
        truthOrigin: "in-memory-cross-validation",
        resultsFile: "in-memory",
      });

      results.push({
        seed,
        mode: testMode,
        totalRecords: allRecords.length,
        totalPairs: report.totalPairs,
        correctPairs: report.correctPairs,
        falsePositives: report.falsePositives,
        fitness: report.fitness,
        recall: report.recall,
        precision: report.precision,
        fpr: report.falsePositiveRate,
        durationMs,
        tier1: report.tierBreakdown[1] ?? 0,
        tier2: report.tierBreakdown[2] ?? 0,
        tier3: report.tierBreakdown[3] ?? 0,
      });

      const icon = report.fitness >= 0.95 ? "🟢" : report.fitness >= 0.70 ? "🟡" : "🔴";
      console.log(
        `${icon} [Mode: ${testMode.padEnd(8)}] Seed ${String(seed).padEnd(5)} | Fitness: ${(report.fitness * 100).toFixed(1)}% | Pairs: ${report.correctPairs}/${report.totalPairs} | FPs: ${report.falsePositives} | Recall: ${(report.recall * 100).toFixed(1)}% | ${durationMs}ms`
      );
    }
  }

  // Aggregate Metrics
  const fitnesses = results.map((r) => r.fitness);
  const meanFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
  const minFitness = Math.min(...fitnesses);
  const maxFitness = Math.max(...fitnesses);
  const variance = fitnesses.reduce((acc, f) => acc + Math.pow(f - meanFitness, 2), 0) / fitnesses.length;
  const stdDevFitness = Math.sqrt(variance);

  const meanRecall = results.map((r) => r.recall).reduce((a, b) => a + b, 0) / results.length;
  const meanPrecision = results.map((r) => r.precision).reduce((a, b) => a + b, 0) / results.length;
  const meanFPR = results.map((r) => r.fpr).reduce((a, b) => a + b, 0) / results.length;
  const totalFPs = results.reduce((acc, r) => acc + r.falsePositives, 0);

  const summary: CrossValidationSummary = {
    timestamp: new Date().toISOString(),
    totalRuns: results.length,
    modesEvaluated: modesToTest,
    seeds,
    meanFitness: +meanFitness.toFixed(4),
    minFitness: +minFitness.toFixed(4),
    maxFitness: +maxFitness.toFixed(4),
    stdDevFitness: +stdDevFitness.toFixed(4),
    meanRecall: +meanRecall.toFixed(4),
    meanPrecision: +meanPrecision.toFixed(4),
    meanFPR: +meanFPR.toFixed(4),
    totalFalsePositives: totalFPs,
    results,
  };

  console.log(`\n---------------------------------------------------------------`);
  console.log(`📊 AGGREGATE GENERALIZATION RESULTS (${results.length} populations):`);
  console.log(`   Mean Fitness:    ${(meanFitness * 100).toFixed(2)}% (StdDev: ±${(stdDevFitness * 100).toFixed(2)}%)`);
  console.log(`   Fitness Range:   ${(minFitness * 100).toFixed(2)}% — ${(maxFitness * 100).toFixed(2)}%`);
  console.log(`   Mean Recall:     ${(meanRecall * 100).toFixed(2)}%`);
  console.log(`   Mean Precision:  ${(meanPrecision * 100).toFixed(2)}%`);
  console.log(`   Mean FPR:        ${(meanFPR * 100).toFixed(2)}% (Total FPs across all runs: ${totalFPs})`);
  console.log(`---------------------------------------------------------------\n`);

  mkdirSync("results", { recursive: true });
  writeFileSync("results/cross-validation.json", JSON.stringify(summary, null, 2));
  console.log(`Wrote summary to results/cross-validation.json`);

  return summary;
}

if (import.meta.main) {
  const seeds = args.includes("--seeds") ? parseInt(args[args.indexOf("--seeds") + 1]!, 10) : 5;
  const seedList = SEED_LIST.slice(0, Math.max(seeds, 2));
  await runCrossValidation(seedList, modeArg as any);
}
