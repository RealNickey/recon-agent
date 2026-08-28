/**
 * error-analysis.ts — Diagnostic debugger for reconciliation errors.
 *
 * Reads hard run outcomes and ground truth to explain WHY missed pairs and
 * false positives occurred.
 *
 * Usage:
 *   bun run scripts/error-analysis.ts [--data data/hard] [--results results/hard-run.json] [--category <category>]
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GroundTruthSchema, RunResultSchema, type FinRecord, type GroundTruth, type RunResult } from "../src/types";
import { claimedMatchGroups, isLedgerOnlyGroup, UNMATCHABLE_CATEGORIES } from "../src/scoring";
import { resolveExternalTruthPath } from "../src/util";
import { daysBetween, amountsClose, sameInvoice, vendorOverlap, tokenSim, normalizeRef, invoiceToken } from "../src/normalize";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  const val = i >= 0 ? args[i + 1] : undefined;
  return val !== undefined ? val : dflt;
}

const DATA_DIR = argVal("--data", "data/hard");
const RESULTS_FILE = argVal("--results", "results/hard-run.json");
const FILTER_CAT = argVal("--category", "");

function loadJson(path: string) {
  if (!existsSync(path)) throw new Error(`file not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const envPath = resolveExternalTruthPath("hard");
  if (!envPath || !existsSync(envPath)) {
    console.error("❌ GROUND_TRUTH_HARD_PATH not found or invalid.");
    process.exit(1);
  }

  const truth: GroundTruth = GroundTruthSchema.parse(loadJson(envPath));
  const run: RunResult = RunResultSchema.parse(loadJson(RESULTS_FILE));

  const bankRecords: FinRecord[] = loadJson(join(DATA_DIR, "bank-statement.json"));
  const ledgerRecords: FinRecord[] = loadJson(join(DATA_DIR, "internal-ledger.json"));
  const procRecords: FinRecord[] = existsSync(join(DATA_DIR, "processor-export.json"))
    ? loadJson(join(DATA_DIR, "processor-export.json"))
    : [];

  const allRecords = new Map<string, FinRecord>();
  for (const r of [...bankRecords, ...ledgerRecords, ...procRecords]) {
    allRecords.set(r.id, r);
  }

  const byOutcome = new Map(run.outcomes.map((o) => [o.recordId, o]));
  const claimedSets = claimedMatchGroups(run);
  const claimedById = new Map<string, string[]>();
  for (const set of claimedSets) {
    for (const id of set) claimedById.set(id, set);
  }

  const missedList: Array<{ pair: typeof truth.pairs[0]; reason: string; details: string[] }> = [];
  const fpList: Array<{ pair: typeof truth.pairs[0]; claimed: string[]; reason: string }> = [];

  for (const p of truth.pairs) {
    if (FILTER_CAT && p.category !== FILTER_CAT) continue;

    const ids = [p.bankId, ...(p.extraBankIds ?? []), ...p.ledgerIds, p.processorId]
      .filter((x): x is string => !!x)
      .sort();

    if (UNMATCHABLE_CATEGORIES.has(p.category)) {
      const matched = ids.filter((id) => byOutcome.get(id)?.status === "matched");
      if (matched.length > 0) {
        const off = matched[0]!;
        fpList.push({
          pair: p,
          claimed: claimedById.get(off) ?? [],
          reason: `Unmatchable record ${off} was matched to: ${JSON.stringify(claimedById.get(off))}`,
        });
      }
      continue;
    }

    if (ids.length < 2) continue;

    const ok = ids.every((id) => {
      const claimed = claimedById.get(id);
      return claimed !== undefined && claimed.length === ids.length && ids.every((x) => claimed.includes(x)) && !isLedgerOnlyGroup(run, claimed);
    });

    if (ok) continue;

    const wrongClaim = ids.some((id) => {
      const claimed = claimedById.get(id);
      return claimed !== undefined && claimed.some((c) => !ids.includes(c));
    });

    if (wrongClaim) {
      const off = ids.find((id) => (claimedById.get(id) ?? []).some((c) => !ids.includes(c)))!;
      fpList.push({
        pair: p,
        claimed: claimedById.get(off) ?? [],
        reason: `Wrong counterpart claimed for ${off}`,
      });
    } else {
      // It's a pure miss
      const details: string[] = [];
      for (const id of ids) {
        const rec = allRecords.get(id);
        const out = byOutcome.get(id);
        if (rec) {
          details.push(`  - [${rec.id}] (${rec.source}) date=${rec.date} amt=${rec.amount} ${rec.currency} ref="${rec.reference}" desc="${rec.description}" -> outcome: ${out?.status ?? "none"} (${(out as any)?.reasonCode ?? ""})`);
        }
      }

      // Diagnose why T1 / T2 missed
      let diag = "Unresolved";
      const recA = allRecords.get(ids[0]!);
      const recB = allRecords.get(ids[1]!);
      if (recA && recB) {
        const days = daysBetween(recA.date, recB.date);
        const sameInv = sameInvoice(recA.reference, recB.reference);
        const vOverlap = vendorOverlap(recA.description, recB.description);
        const amtClose = amountsClose(recA.amount, recB.amount, 0.05, 0.03);

        const diags: string[] = [];
        if (days > 2) diags.push(`Timing drift: ${days} days (T2 limit is 2 days)`);
        if (recA.currency !== recB.currency) diags.push(`Currency mismatch: ${recA.currency} vs ${recB.currency}`);
        if (!sameInv) diags.push(`Invoice token mismatch: "${invoiceToken(recA.reference)}" vs "${invoiceToken(recB.reference)}"`);
        if (!amtClose) diags.push(`Amount difference: ${recA.amount} vs ${recB.amount}`);
        if (vOverlap < 0.2) diags.push(`Low vendor overlap: ${(vOverlap * 100).toFixed(0)}%`);
        diag = diags.join(" | ") || "Complex multi-factor discrepancy";
      }

      missedList.push({ pair: p, reason: diag, details });
    }
  }

  console.log("\n=================== ERROR ANALYSIS REPORT ===================");
  console.log(`Dataset: ${DATA_DIR} | Results: ${RESULTS_FILE}`);
  console.log(`Total Missed Pairs: ${missedList.length} | Total False Positive Groups: ${fpList.length}`);

  if (fpList.length > 0) {
    console.log(`\n🚨 FALSE POSITIVES (${fpList.length}):`);
    for (const fp of fpList) {
      console.log(`\n❌ Category: [${fp.pair.category}]`);
      console.log(`   Truth IDs: ${JSON.stringify([fp.pair.bankId, ...(fp.pair.extraBankIds ?? []), ...fp.pair.ledgerIds].filter(Boolean))}`);
      console.log(`   Claimed:   ${JSON.stringify(fp.claimed)}`);
      console.log(`   Reason:    ${fp.reason}`);
    }
  }

  if (missedList.length > 0) {
    console.log(`\n🔍 MISSED PAIRS (${missedList.length}):`);
    const byCat = new Map<string, number>();
    for (const m of missedList) {
      byCat.set(m.pair.category, (byCat.get(m.pair.category) ?? 0) + 1);
    }
    console.log(`   Missed by Category: ${[...byCat.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

    for (const m of missedList.slice(0, 10)) {
      console.log(`\n📌 Category: [${m.pair.category}]`);
      console.log(`   Diagnostic: ${m.reason}`);
      for (const line of m.details) console.log(line);
    }
    if (missedList.length > 10) {
      console.log(`\n   ... and ${missedList.length - 10} more missed pairs (filter with --category <name> to inspect).`);
    }
  }

  console.log("\n💡 ACTIONABLE HYPOTHESES FOR IMPROVEMENT LOOP:");
  console.log("   1. timing_drift_wide (5-14 days): T2 auto-commit requires inSettleWindow <= 2 days. Candidates with identical invoice token and identical amount but days 3-15 can be matched or fed into Tier 3.");
  console.log("   2. identity_weak (PO# in desc): Invoice reference is in description (e.g. 'PO#123456') while reference field has wire ID. Extracting embedded reference tokens enables matching.");
  console.log("   3. fx_no_invoice (EUR/USD with FX rate): Records share vendor description and date within 1-2 days, but have different currencies with typical EUR/USD FX rate (0.80 - 1.25).");
  console.log("=============================================================\n");
}

main();
