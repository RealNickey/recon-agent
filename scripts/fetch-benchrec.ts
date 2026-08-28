/**
 * Optional: mix real reconciliation data (Kaggle BenchRec) into the synthetic set.
 * Uses Kaggle API v1 over plain HTTPS with basic auth — no Python/CLI needed.
 * Silently no-ops if creds are missing or anything fails.
 *
 * BenchRec structure (verified against the live dataset):
 *   - BenchRec_cash_v1.0_eval.csv      — the records, split into A_* and B_* sides (never both in one row)
 *   - BenchRec_cash_v1.0_solution.csv  — B_id -> targetAllocation (the match label)
 *   - Join key: B's targetAllocation == A's A_allocation (normalized whitespace)
 *
 * Duplicate A-side copies of the same allocation are collapsed, then a subset
 * that actually reconstructs the bank amount is selected. Extra A-rows that
 * share an allocation but do not participate in the amount identity are dropped
 * so they cannot poison the answer key.
 *
 * Answer key is written ONLY to GROUND_TRUTH_PATH (outside the repo).
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import Papa from "papaparse";
import { mulberry32, round2, resolveExternalTruthPath } from "../src/util";
import { fingerprintRecord, selectReconstructingA } from "../src/benchrec-select";
import { amountsClose } from "../src/normalize";
import type { FinRecord, GroundTruth } from "../src/types";

const user = process.env.KAGGLE_USERNAME;
const key = process.env.KAGGLE_KEY;
const DATA = "data";
const SAMPLE = 20;

if (!user || !key) {
  console.log("no KAGGLE_USERNAME/KAGGLE_KEY — skipping BenchRec (synthetic-only is fine)");
  process.exit(0);
}

const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const cleanAmt = (s: string | undefined) => {
  const n = parseFloat((s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? round2(Math.abs(n)) : null;
};
const cleanDate = (s: string | undefined) => (s ?? "").slice(0, 10) || "2023-01-01";

const url = "https://www.kaggle.com/api/v1/datasets/download/benchmarkteam/benchrec-real-world-cash-reconciliation-dataset";
try {
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`${user}:${key}`).toString("base64") },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const dec = (f: string) => Papa.parse<Record<string, string>>(new TextDecoder().decode(files[f]), { header: true, skipEmptyLines: true }).data;

  const evalRows = dec("BenchRec_cash_v1.0_eval.csv");
  const solution = dec("BenchRec_cash_v1.0_solution.csv");

  const A = evalRows.filter((r) => norm(r.A_id) !== "");
  const B = evalRows.filter((r) => norm(r.B_id) !== "");
  const bById = new Map(B.map((r) => [norm(r.B_id), r]));
  const aByAlloc = new Map<string, typeof A>();
  for (const r of A) {
    const k = norm(r.A_allocation);
    if (k) {
      const arr = aByAlloc.get(k) ?? [];
      arr.push(r);
      aByAlloc.set(k, arr);
    }
  }

  interface Group { b: (typeof B)[number]; aGroup: typeof A }
  const groups: Group[] = [];
  const seenB = new Set<string>();
  for (const s of solution) {
    const bId = norm(s.B_id);
    if (!bId || seenB.has(bId)) continue;
    seenB.add(bId);
    const k = norm(s.targetAllocation);
    const aGroup = aByAlloc.get(k);
    const bRow = bById.get(bId);
    if (aGroup && bRow) groups.push({ b: bRow, aGroup });
  }
  console.log(`benchrec: ${A.length} A records, ${B.length} B records, ${groups.length} reconstructable match groups`);

  type SelectedA = { amount: number; date: string; currency: string; reference: string; description: string };
  interface Reconstructed { b: (typeof B)[number]; bAmt: number; selected: SelectedA[] }

  // Reconstruct lazily after shuffle. Running subset-sum on all 30k groups
  // is a multi-minute job; we only need SAMPLE usable groups.
  const rng = mulberry32(2024);
  const shuffledGroups = [...groups].sort(() => rng() - 0.5);
  const reconstructed: Reconstructed[] = [];
  let skippedNoAmount = 0;
  let skippedNoSubset = 0;
  let skippedTooWide = 0;
  const wantMto = Math.ceil(SAMPLE / 2);
  const wantOto = Math.floor(SAMPLE / 2);
  let gotMto = 0;
  let gotOto = 0;

  for (const g of shuffledGroups) {
    if (gotMto >= wantMto && gotOto >= wantOto) break;
    const bAmt = cleanAmt(g.b.B_amount);
    if (bAmt === null) { skippedNoAmount++; continue; }

    const seen = new Set<string>();
    const uniqueA: SelectedA[] = [];
    for (const a of g.aGroup) {
      const aAmt = cleanAmt(a.A_amount);
      if (aAmt === null) continue;
      const row: SelectedA = {
        amount: aAmt,
        date: cleanDate(a.A_valueDate),
        currency: norm(a.A_currencyCode) || "USD",
        reference: norm(a.A_transactionReferences).slice(0, 40),
        description: norm(a.A_transactionAttributes).slice(0, 80) || "benchrec ledger txn",
      };
      const fp = fingerprintRecord(row);
      if (seen.has(fp)) continue;
      seen.add(fp);
      uniqueA.push(row);
    }
    if (uniqueA.length === 0) { skippedNoAmount++; continue; }

    let selected;
    if (uniqueA.length > 18) {
      // subset-sum is exponential; on oversized allocations only keep a 1:1
      // amount identity. Do not dump the extra A-rows into the answer key.
      const exact = uniqueA.filter((c) => amountsClose(c.amount, bAmt, 0.05, 0.001));
      const first = exact[0];
      if (!first) { skippedTooWide++; continue; }
      selected = [first];
    } else {
      selected = selectReconstructingA(bAmt, uniqueA);
      if (!selected) { skippedNoSubset++; continue; }
    }
    const isMto = selected.length > 1;
    if (isMto) {
      if (gotMto >= wantMto) continue;
      gotMto++;
    } else {
      if (gotOto >= wantOto) continue;
      gotOto++;
    }
    reconstructed.push({ b: g.b, bAmt, selected });
  }
  console.log(`  sampled ${reconstructed.length} usable groups (skipped no-amount=${skippedNoAmount} no-subset=${skippedNoSubset} too-wide=${skippedTooWide})`);
  const picked = reconstructed;

  const bank: FinRecord[] = [];
  const ledger: FinRecord[] = [];
  const pairs: GroundTruth["pairs"] = [];
  let bSeq = 70000, lSeq = 71000;
  const usedLedgerFp = new Set<string>();

  for (const g of picked) {
    const bId = `B${bSeq++}`;
    const bRef = norm(g.b.B_transactionReferences).slice(0, 40) || bId;
    bank.push({
      id: bId,
      source: "bank",
      date: cleanDate(g.b.B_valueDate),
      amount: g.bAmt,
      currency: norm(g.b.B_currencyCode) || "USD",
      description: norm(g.b.B_transactionAttributes).slice(0, 80) || "benchrec bank txn",
      reference: bRef,
    });

    const ledgerIds: string[] = [];
    for (const a of g.selected) {
      const fp = fingerprintRecord(a);
      if (usedLedgerFp.has(fp)) continue;
      usedLedgerFp.add(fp);
      const lId = `L${lSeq++}`;
      ledger.push({
        id: lId,
        source: "ledger",
        date: a.date,
        amount: a.amount,
        currency: a.currency,
        description: a.description,
        reference: a.reference || lId,
      });
      ledgerIds.push(lId);
    }
    if (ledgerIds.length === 0) {
      bank.pop();
      continue;
    }
    pairs.push({ bankId: bId, ledgerIds, processorId: null, category: "benchrec_real" });
  }

  if (bank.length === 0) throw new Error("no usable groups reconstructed");

  const bankFile = join(DATA, "bank-statement.json");
  const ledgerFile = join(DATA, "internal-ledger.json");
  const truthFile = resolveExternalTruthPath(false);
  if (existsSync(bankFile) && existsSync(ledgerFile) && truthFile && existsSync(truthFile)) {
    const eb = JSON.parse(readFileSync(bankFile, "utf8")) as FinRecord[];
    const el = JSON.parse(readFileSync(ledgerFile, "utf8")) as FinRecord[];
    const et = JSON.parse(readFileSync(truthFile, "utf8")) as GroundTruth;
    writeFileSync(bankFile, JSON.stringify([...eb, ...bank], null, 2));
    writeFileSync(ledgerFile, JSON.stringify([...el, ...ledger], null, 2));
    for (const p of pairs) et.pairs.push(p);
    et.meta.counts["benchrec_real"] = pairs.length;
    writeFileSync(truthFile, JSON.stringify(et, null, 2));
    console.log(`mixed ${pairs.length} real match groups (${bank.length} bank + ${ledger.length} ledger records) into dataset`);
    const mtoCount = pairs.filter((p) => p.ledgerIds.length > 1).length;
    console.log(`  of which many-to-one: ${mtoCount}, one-to-one: ${pairs.length - mtoCount}`);
  } else if (!truthFile) {
    console.log("GROUND_TRUTH_PATH unset — not merging BenchRec (would have nowhere safe to write the answer key)");
  } else {
    console.log("synthetic dataset not generated yet — run bun run gen first; skipping merge");
  }
} catch (err) {
  console.log(`benchrec fetch failed (${err instanceof Error ? err.message : err}) — continuing synthetic-only`);
}
