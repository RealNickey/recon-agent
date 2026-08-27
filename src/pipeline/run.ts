/**
 * Pipeline orchestrator: tier1 -> tier2 -> tier3, writes results/latest-run.json
 * Usage: bun run src/pipeline/run.ts [--data DIR] [--out FILE] [--no-ai]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tier1Exact } from "./tier1-exact";
import { tier2Fuzzy } from "./tier2-fuzzy";
import { tier3Agentic } from "./tier3-agentic";
import { RecordSchema, RunResultSchema, type FinRecord, type Outcome, type RunResult } from "../types";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const DATA = argVal("--data", "data");
const OUT = argVal("--out", "results/latest-run.json");
const NO_AI = args.includes("--no-ai");

function loadRecords(path: string): { records: FinRecord[]; skipped: number } {
  if (!existsSync(path)) return { records: [], skipped: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`malformed JSON: ${path}`);
  }
  if (!Array.isArray(raw)) throw new Error(`${path} is not a JSON array`);
  const records: FinRecord[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of raw) {
    const p = RecordSchema.safeParse(row);
    if (!p.success) {
      skipped++;
      continue;
    }
    if (seen.has(p.data.id)) {
      skipped++;
      continue;
    }
    seen.add(p.data.id);
    records.push(p.data);
  }
  return { records, skipped };
}

function exceptionReason(r: FinRecord, poolSize: number): Outcome {
  const reason =
    poolSize === 0
      ? "no_candidate_found"
      : r.currency !== "USD"
        ? "currency_mismatch"
        : "low_confidence";
  return {
    status: "exception",
    recordId: r.id,
    source: r.source,
    reasonCode: reason,
    tier: 2,
    candidatesConsidered: poolSize,
    reasoning:
      poolSize === 0
        ? "no cross-source candidate survived amount/date/vendor blocking"
        : "left unmatched after deterministic tiers; awaiting agentic review or honest exception",
  };
}

export async function runPipeline(dataDir = DATA, outFile = OUT, useAi = !NO_AI): Promise<RunResult> {
  const startedAt = new Date();
  const t0 = performance.now();

  const bank = loadRecords(join(dataDir, "bank-statement.json"));
  const ledger = loadRecords(join(dataDir, "internal-ledger.json"));
  const processor = loadRecords(join(dataDir, "processor-export.json"));
  const skippedInvalid = bank.skipped + ledger.skipped + processor.skipped;
  const all = [...bank.records, ...ledger.records, ...processor.records];

  const t1 = all.length ? tier1Exact(all) : { outcomes: [] as Outcome[], residual: [] as FinRecord[] };
  const t2 = t1.residual.length ? tier2Fuzzy(t1.residual) : { outcomes: [] as Outcome[], residual: [] as FinRecord[], candidatePools: new Map() };

  let t3 = { outcomes: [] as Outcome[], calls: 0, tokens: 0, costUsd: 0 };
  if (useAi && t2.residual.length > 0) {
    mkdirSync("logs", { recursive: true });
    t3 = await tier3Agentic(t2.residual, t2.candidatePools);
  } else {
    for (const r of t2.residual) {
      t3.outcomes.push(exceptionReason(r, (t2.candidatePools.get(r.id) ?? []).length));
    }
  }

  const outcomes = [...t1.outcomes, ...t2.outcomes, ...t3.outcomes];

  // coverage invariant: every valid input record has exactly one outcome
  const seenOut = new Set<string>();
  for (const o of outcomes) {
    if (seenOut.has(o.recordId)) {
      throw new Error(`duplicate outcome for ${o.recordId}`);
    }
    seenOut.add(o.recordId);
  }
  for (const r of all) {
    if (!seenOut.has(r.id)) {
      throw new Error(`missing outcome for ${r.id}`);
    }
  }
  if (seenOut.size !== all.length) {
    throw new Error(`outcome/input size mismatch: outcomes=${seenOut.size} inputs=${all.length}`);
  }

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
      skippedInvalid,
      tier3Calls: t3.calls,
      tier3Tokens: t3.tokens,
      tier3CostUsd: +t3.costUsd.toFixed(6),
    },
  };
  RunResultSchema.parse(result);
  mkdirSync(dirname(outFile) || ".", { recursive: true });
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const r = await runPipeline();
  console.log(`done in ${r.durationMs}ms — matched=${r.stats.matched} exceptions=${r.stats.exceptions} skipped=${r.stats.skippedInvalid ?? 0} tier3Calls=${r.stats.tier3Calls} tokens=${r.stats.tier3Tokens} cost=usd${r.stats.tier3CostUsd}`);
  console.log(`wrote ${OUT}`);
}
