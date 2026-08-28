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
  type RejectedRecord,
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
  globalSeenIds: Set<string>,
  rejectedList: RejectedRecord[]
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
      rejectedList.push({
        rawRecord: row,
        source: expectedSource,
        reason: `Schema validation failed: ${p.error.issues.map((i) => i.message).join("; ")}`,
        file: filePath,
      });
      continue;
    }
    if (p.data.source !== expectedSource) {
      // Source mismatch: row declared source does not match file origin
      skipped++;
      rejectedList.push({
        rawRecord: row,
        source: expectedSource,
        reason: `Source mismatch: row declared source '${p.data.source}' does not match file origin '${expectedSource}'`,
        file: filePath,
      });
      continue;
    }
    if (globalSeenIds.has(p.data.id)) {
      // Global duplicate ID violation
      skipped++;
      rejectedList.push({
        rawRecord: row,
        source: expectedSource,
        reason: `Global duplicate ID violation: ID '${p.data.id}' already seen`,
        file: filePath,
      });
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

function exportExceptionLedger(outcomesList: Outcome[], recsMap: Map<string, FinRecord>) {
  const excs = outcomesList.filter((o) => o.status === "exception");
  const header = "Record ID,Source,Date,Amount,Currency,Reason Code,Candidates Considered,Suggested Action,SLA Priority,Reasoning\n";
  const rows = excs.map((o) => {
    const r = recsMap.get(o.recordId);
    const action =
      o.reasonCode === "no_candidate_found"
        ? "Request bank statement trace / counterparty confirmation"
        : o.reasonCode === "currency_mismatch"
        ? "Confirm FX execution rate and book realized FX gain/loss"
        : o.reasonCode === "amount_variance"
        ? "Audit statutory fee/TDS withholding schedule and post adjustment"
        : o.reasonCode === "duplicate_conflict"
        ? "Investigate duplicate settlement posting and issue credit reversal"
        : o.reasonCode === "timing_gap"
        ? "Check in-transit clearing window or stale check policy"
        : o.reasonCode === "refund_reversal"
        ? "Match credit memo against gateway refund authorization"
        : o.reasonCode === "partial_payment"
        ? "Post unallocated residual to short-payment receivables aging"
        : o.reasonCode === "low_confidence"
        ? "Route to Level 2 Maker-Checker Review with supporting candidate pool"
        : "Manual maker-checker controller review required";
    const sla =
      o.reasonCode === "duplicate_conflict" || (r && Math.abs(r.amount) >= 50000)
        ? "P1 - Immediate"
        : o.reasonCode === "currency_mismatch" || o.reasonCode === "refund_reversal"
        ? "P2 - Priority Close"
        : "P3 - Standard Close";
    return [
      o.recordId,
      o.source,
      r?.date ?? "",
      r?.amount ?? "",
      r?.currency ?? "",
      o.reasonCode,
      o.candidatesConsidered ?? 0,
      `"${action.replace(/"/g, '""')}"`,
      sla,
      `"${(o.reasoning ?? "").replace(/"/g, '""')}"`,
    ].join(",");
  });
  try {
    mkdirSync("results", { recursive: true });
    writeFileSync("results/exception-ledger.csv", header + rows.join("\n"));
  } catch {}
}

export async function runPipeline(dataDir = DATA, outFile = OUT, useAi = !NO_AI): Promise<RunResult> {
  if (!existsSync(dataDir)) {
    throw new Error(`Input dataset directory does not exist: ${dataDir}`);
  }

  const startedAt = new Date();
  const t0 = performance.now();

  const globalSeenIds = new Set<string>();
  const rejectedRecords: RejectedRecord[] = [];
  const bank = loadSourceFile(join(dataDir, "bank-statement.json"), "bank", globalSeenIds, rejectedRecords);
  const ledger = loadSourceFile(join(dataDir, "internal-ledger.json"), "ledger", globalSeenIds, rejectedRecords);
  const processor = loadSourceFile(join(dataDir, "processor-export.json"), "processor", globalSeenIds, rejectedRecords);

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

  const allCurrencies = new Set<string>([
    ...bank.records.map((r) => r.currency),
    ...ledger.records.map((r) => r.currency),
    ...processor.records.map((r) => r.currency),
  ]);

  const cashPosition: Record<string, any> = {};

  for (const cur of allCurrencies) {
    const curBank = bank.records.filter((b) => b.currency === cur);
    const curLedger = ledger.records.filter((l) => l.currency === cur);
    const curProc = processor.records.filter((p) => p.currency === cur);

    let reconciledBank = new Decimal(0);
    let unreconciledBank = new Decimal(0);
    let clearedDeposits = new Decimal(0);
    let clearedDisbursements = new Decimal(0);
    let inTransitDeposits = new Decimal(0);
    let outstandingPayments = new Decimal(0);
    let reconciledCount = 0;
    let unreconciledCount = 0;

    for (const b of curBank) {
      const out = byOutcome.get(b.id);
      const amt = new Decimal(b.amount);
      if (out?.status === "matched") {
        reconciledBank = reconciledBank.plus(amt);
        reconciledCount++;
        if (amt.gte(0)) {
          clearedDeposits = clearedDeposits.plus(amt);
        } else {
          clearedDisbursements = clearedDisbursements.plus(amt);
        }
      } else {
        unreconciledBank = unreconciledBank.plus(amt);
        unreconciledCount++;
        if (amt.gte(0)) {
          inTransitDeposits = inTransitDeposits.plus(amt);
        } else {
          outstandingPayments = outstandingPayments.plus(amt);
        }
      }
    }

    const subledgerBalance = curLedger.reduce((acc, l) => acc.plus(new Decimal(l.amount)), new Decimal(0));
    const processorBalance = curProc.reduce((acc, p) => acc.plus(new Decimal(p.amount)), new Decimal(0));
    const closingBank = reconciledBank.plus(unreconciledBank);

    // Calculate tax/MDR withheld differences on matched groups
    let statutoryTaxMdr = new Decimal(0);
    for (const l of curLedger) {
      const out = byOutcome.get(l.id);
      if (out?.status === "matched" && out.matchedIds) {
        const bankMatch = out.matchedIds.map((id) => allMap.get(id)).find((m) => m?.source === "bank" && m.currency === cur);
        if (bankMatch && bankMatch.amount < l.amount) {
          statutoryTaxMdr = statutoryTaxMdr.plus(new Decimal(l.amount).minus(new Decimal(bankMatch.amount)));
        }
      }
    }

    const totalBankRecords = curBank.length;
    const reconciliationRate = totalBankRecords > 0 ? +(reconciledCount / totalBankRecords).toFixed(4) : 1;
    const netVariance = closingBank.minus(subledgerBalance.plus(inTransitDeposits).plus(outstandingPayments));

    cashPosition[cur] = {
      currency: cur,
      reconciledAmount: reconciledBank.toNumber(),
      unreconciledAmount: unreconciledBank.toNumber(),
      netPosition: closingBank.toNumber(),
      bankBalance: closingBank.toNumber(),
      internalLedgerBalance: subledgerBalance.toNumber(),
      processorNodalBalance: processorBalance.toNumber(),
      taxWithheldMdr: statutoryTaxMdr.toNumber(),
      inTransitVariance: netVariance.toNumber(),
      reconciledCount,
      unreconciledCount,
      reconciliationRate,
      brs: {
        currency: cur,
        openingBankBalance: 0,
        clearedDeposits: clearedDeposits.toNumber(),
        clearedDisbursements: clearedDisbursements.toNumber(),
        closingBankBalance: closingBank.toNumber(),
        unreconciledInTransitDeposits: inTransitDeposits.toNumber(),
        unreconciledOutstandingPayments: outstandingPayments.toNumber(),
        subledgerBalance: subledgerBalance.toNumber(),
        processorNodalBalance: processorBalance.toNumber(),
        statutoryAccrualsMdrTds: statutoryTaxMdr.toNumber(),
        netVariance: netVariance.toNumber(),
      },
    };
  }

  exportExceptionLedger(outcomes, allMap);

  const result: RunResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - t0),
    model: canRunAi ? process.env.MODEL ?? "z-ai/glm-5.2:free" : "none",
    outcomes,
    inputManifest: manifest,
    rejectedRecords: rejectedRecords.length > 0 ? rejectedRecords : undefined,
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
