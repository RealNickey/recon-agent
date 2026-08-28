/**
 * Pipeline orchestrator: tier1 -> tier2 -> tier3, writes results/latest-run.json
 * Usage: bun run src/pipeline/run.ts [--data DIR] [--out FILE] [--no-ai]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { tier1Exact } from "./tier1-exact";
import { tier2Fuzzy } from "./tier2-fuzzy";
import { tier3Agentic } from "./tier3-agentic";
import {
  RecordSchema,
  RunResultSchema,
  type FinRecord,
  type Outcome,
  type RunResult,
  type InputManifestEntry,
} from "../types";
import { hasApprovedProvider } from "./agentic-providers";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  const val = i >= 0 ? args[i + 1] : undefined;
  return val !== undefined ? val : dflt;
}
const DATA = argVal("--data", "data");
const OUT = argVal("--out", "results/latest-run.json");
const NO_AI = args.includes("--no-ai");

interface SourceLoadResult {
  records: FinRecord[];
  skipped: number;
  manifest: InputManifestEntry;
}

function loadSourceFile(
  filePath: string,
  expectedSource: FinRecord["source"],
  globalSeenIds: Set<string>
): SourceLoadResult {
  if (!existsSync(filePath)) {
    return {
      records: [],
      skipped: 0,
      manifest: {
        file: filePath,
        source: expectedSource,
        totalRows: 0,
        validRecords: 0,
        sha256: "none",
      },
    };
  }

  const rawContent = readFileSync(filePath, "utf8");
  const sha256 = createHash("sha256").update(rawContent).digest("hex");
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawContent);
  } catch {
    throw new Error(`Malformed JSON in financial source file: ${filePath}`);
  }
  if (!Array.isArray(rawJson)) {
    throw new Error(`Financial source file must contain a JSON array: ${filePath}`);
  }

  const records: FinRecord[] = [];
  let skipped = 0;

  for (const row of rawJson) {
    const p = RecordSchema.safeParse(row);
    if (!p.success) {
      skipped++;
      continue;
    }
    if (p.data.source !== expectedSource) {
      // Source mismatch: row declared source does not match file origin
      skipped++;
      continue;
    }
    if (globalSeenIds.has(p.data.id)) {
      // Global duplicate ID violation
      skipped++;
      continue;
    }
    globalSeenIds.add(p.data.id);
    records.push(p.data);
  }

  return {
    records,
    skipped,
    manifest: {
      file: filePath,
      source: expectedSource,
      totalRows: rawJson.length,
      validRecords: records.length,
      sha256,
    },
  };
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
  if (!existsSync(dataDir)) {
    throw new Error(`Input dataset directory does not exist: ${dataDir}`);
  }

  const startedAt = new Date();
  const t0 = performance.now();

  const globalSeenIds = new Set<string>();
  const bank = loadSourceFile(join(dataDir, "bank-statement.json"), "bank", globalSeenIds);
  const ledger = loadSourceFile(join(dataDir, "internal-ledger.json"), "ledger", globalSeenIds);
  const processor = loadSourceFile(join(dataDir, "processor-export.json"), "processor", globalSeenIds);

  const manifest: InputManifestEntry[] = [bank.manifest, ledger.manifest, processor.manifest];
  const skippedInvalid = bank.skipped + ledger.skipped + processor.skipped;
  const all = [...bank.records, ...ledger.records, ...processor.records];

  if (all.length === 0) {
    throw new Error(`Dataset directory '${dataDir}' contains zero valid financial records.`);
  }

  const allMap = new Map<string, FinRecord>(all.map((r) => [r.id, r]));

  const t1 = tier1Exact(all);
  const t2 = t1.residual.length
    ? tier2Fuzzy(t1.residual)
    : { outcomes: [] as Outcome[], residual: [] as FinRecord[], candidatePools: new Map() };

  let t3 = { outcomes: [] as Outcome[], calls: 0, tokens: 0, costUsd: 0 };
  const canRunAi = useAi && hasApprovedProvider();
  if (canRunAi && t2.residual.length > 0) {
    mkdirSync("logs", { recursive: true });
    t3 = await tier3Agentic(t2.residual, t2.candidatePools);
  } else {
    for (const r of t2.residual) {
      t3.outcomes.push(exceptionReason(r, (t2.candidatePools.get(r.id) ?? []).length));
    }
  }

  const outcomes = [...t1.outcomes, ...t2.outcomes, ...t3.outcomes];

  // Referential Integrity and Reciprocal/Group Consistency Invariant Check
  const byOutcome = new Map<string, Outcome>();
  for (const o of outcomes) {
    if (byOutcome.has(o.recordId)) {
      throw new Error(`Duplicate outcome generated for record ID '${o.recordId}'`);
    }
    byOutcome.set(o.recordId, o);
  }

  // 1. Coverage check: every input record has exactly one outcome
  for (const r of all) {
    if (!byOutcome.has(r.id)) {
      throw new Error(`Missing outcome for record ID '${r.id}'`);
    }
  }
  if (byOutcome.size !== all.length) {
    throw new Error(`Outcome size mismatch: outcomes=${byOutcome.size}, inputRecords=${all.length}`);
  }

  // 2. Referential integrity and symmetry check for matched outcomes
  for (const o of outcomes) {
    if (o.status === "matched") {
      if (!o.matchedIds || o.matchedIds.length === 0) {
        throw new Error(`Matched outcome for '${o.recordId}' has empty matchedIds`);
      }
      for (const mid of o.matchedIds) {
        if (mid === o.recordId) {
          throw new Error(`Record '${o.recordId}' self-matched in matchedIds`);
        }
        if (!allMap.has(mid)) {
          throw new Error(`Record '${o.recordId}' matched unknown counterpart ID '${mid}'`);
        }
        const counterpartOut = byOutcome.get(mid);
        if (!counterpartOut || counterpartOut.status !== "matched") {
          throw new Error(`Asymmetric match: '${o.recordId}' claims '${mid}', but '${mid}' is not matched`);
        }
        if (!counterpartOut.matchedIds.includes(o.recordId)) {
          throw new Error(`Asymmetric claim: '${o.recordId}' claims '${mid}', but '${mid}' does not claim '${o.recordId}'`);
        }
      }
    }
  }

  const cashPosMap: Record<string, { reconciled: Decimal; unreconciled: Decimal }> = {};
  for (const b of bank.records) {
    if (!cashPosMap[b.currency]) {
      cashPosMap[b.currency] = { reconciled: new Decimal(0), unreconciled: new Decimal(0) };
    }
    const out = byOutcome.get(b.id);
    const amt = new Decimal(b.amount);
    if (out?.status === "matched") {
      cashPosMap[b.currency]!.reconciled = cashPosMap[b.currency]!.reconciled.plus(amt);
    } else {
      cashPosMap[b.currency]!.unreconciled = cashPosMap[b.currency]!.unreconciled.plus(amt);
    }
  }

  const cashPosition: Record<string, { currency: string; reconciledAmount: number; unreconciledAmount: number; netPosition: number }> = {};
  for (const [cur, pos] of Object.entries(cashPosMap)) {
    cashPosition[cur] = {
      currency: cur,
      reconciledAmount: pos.reconciled.toNumber(),
      unreconciledAmount: pos.unreconciled.toNumber(),
      netPosition: pos.reconciled.plus(pos.unreconciled).toNumber(),
    };
  }

  const result: RunResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - t0),
    model: canRunAi ? process.env.MODEL ?? "z-ai/glm-5.2:free" : "none",
    outcomes,
    inputManifest: manifest,
    cashPosition,
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
