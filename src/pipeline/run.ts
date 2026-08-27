/**
 * Pipeline orchestrator: tier1 -> tier2 -> tier3, writes results/latest-run.json
 * Usage: bun run src/pipeline/run.ts [--data DIR] [--out FILE] [--no-ai]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tier1Exact } from "./tier1-exact";
import { tier2Fuzzy } from "./tier2-fuzzy";
import { tier3Agentic } from "./tier3-agentic";
import { RunResultSchema, type FinRecord, type RunResult } from "../types";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const DATA = argVal("--data", "data");
const OUT = argVal("--out", "results/latest-run.json");
const NO_AI = args.includes("--no-ai");

export async function runPipeline(dataDir = DATA, outFile = OUT, useAi = !NO_AI): Promise<RunResult> {
  const startedAt = new Date();
  const t0 = performance.now();

  const bank = JSON.parse(readFileSync(join(dataDir, "bank-statement.json"), "utf8")) as FinRecord[];
  const ledger = JSON.parse(readFileSync(join(dataDir, "internal-ledger.json"), "utf8")) as FinRecord[];
  const processor = JSON.parse(readFileSync(join(dataDir, "processor-export.json"), "utf8")) as FinRecord[];
  const all = [...bank, ...ledger, ...processor];

  const t1 = tier1Exact(all);
  const t2 = tier2Fuzzy(t1.residual);
  let t3 = { outcomes: [] as RunResult["outcomes"], calls: 0, tokens: 0 };
  if (useAi && t2.residual.length > 0) {
    mkdirSync("logs", { recursive: true });
    t3 = await tier3Agentic(t2.residual, t2.candidatePools);
  } else {
    // no-AI mode: everything left becomes an honest exception
    for (const r of t2.residual) {
      t3.outcomes.push({ status: "exception", recordId: r.id, source: r.source, reasonCode: "no_candidate_found", tier: 2, candidatesConsidered: (t2.candidatePools.get(r.id) ?? []).length });
    }
  }

  const outcomes = [...t1.outcomes, ...t2.outcomes, ...t3.outcomes];
  const result: RunResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - t0),
    model: useAi ? process.env.MODEL ?? "z-ai/glm-5.2:free" : "none",
    outcomes,
    stats: {
      totalRecords: all.length,
      matched: outcomes.filter((o) => o.status === "matched").length,
      exceptions: outcomes.filter((o) => o.status === "exception").length,
      tier3Calls: t3.calls,
      tier3Tokens: t3.tokens,
    },
  };
  RunResultSchema.parse(result);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const r = await runPipeline();
  console.log(`done in ${r.durationMs}ms — matched=${r.stats.matched} exceptions=${r.stats.exceptions} tier3Calls=${r.stats.tier3Calls} tokens=${r.stats.tier3Tokens}`);
  console.log(`wrote ${OUT}`);
}
