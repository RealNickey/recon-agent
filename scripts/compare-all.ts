/**
 * Runs full comparison across all datasets: With AI vs Without AI
 * Usage: bun run scripts/compare-all.ts
 */
import { runPipeline } from "../src/pipeline/run";
import type { RunResult } from "../src/types";

interface ComparisonRow {
  dataset: string;
  totalRecords: number;
  noAiMatched: number;
  noAiExceptions: number;
  aiMatched: number;
  aiExceptions: number;
  matchedDelta: number;
  exceptionsDelta: number;
  aiModelUsed: string;
}

async function runComparison() {
  const datasets = [
    { name: "Dev Dataset (Seed 42)", dir: "data" },
    { name: "Holdout Dataset (Seed 777)", dir: "data/holdout" },
    { name: "Hard Dataset (Seed 999)", dir: "data/hard" },
    { name: "Agent Showcase (Messy Remittances)", dir: "data/agent-showcase" },
  ];

  const results: ComparisonRow[] = [];

  console.log("================================================================================");
  console.log("📊 RUNNING FULL COMPARISON: DETERMINISTIC (NO AI) VS AGENTIC AI PIPELINE");
  console.log("================================================================================\n");

  for (const ds of datasets) {
    console.log(`⏳ Evaluating ${ds.name}...`);
    
    // 1. Without AI
    const noAiRes: RunResult = await runPipeline(ds.dir, `results/temp-${ds.dir.replace(/\//g, "-")}-noai.json`, false);
    
    // 2. With AI
    const aiRes: RunResult = await runPipeline(ds.dir, `results/temp-${ds.dir.replace(/\//g, "-")}-ai.json`, true);

    const deltaMatched = aiRes.stats.matched - noAiRes.stats.matched;
    const deltaExcs = aiRes.stats.exceptions - noAiRes.stats.exceptions;

    results.push({
      dataset: ds.name,
      totalRecords: noAiRes.stats.totalRecords,
      noAiMatched: noAiRes.stats.matched,
      noAiExceptions: noAiRes.stats.exceptions,
      aiMatched: aiRes.stats.matched,
      aiExceptions: aiRes.stats.exceptions,
      matchedDelta: deltaMatched,
      exceptionsDelta: deltaExcs,
      aiModelUsed: aiRes.model,
    });
  }

  console.log("\n================================================================================");
  console.log("📈 FINAL COMPARISON SUMMARY TABLE");
  console.log("================================================================================");
  console.table(results);

  console.log("\n================================================================================");
  console.log("✅ Evaluation Complete across all populations.");
  console.log("================================================================================\n");
}

runComparison().catch(console.error);
