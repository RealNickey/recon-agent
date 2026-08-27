/**
 * Optional: mix real reconciliation data (Kaggle BenchRec) into the synthetic set.
 * Uses Kaggle API v1 over plain HTTPS with basic auth — no Python/CLI needed.
 * Silently no-ops if creds are missing or anything fails.
 *
 * BenchRec structure (verified against the live dataset):
 *   - BenchRec_cash_v1.0_eval.csv      — the records, split into A_* and B_* sides (never both in one row)
 *   - BenchRec_cash_v1.0_solution.csv  — B_id -> targetAllocation (the match label)
 *   - Join key: B's targetAllocation == A's A_allocation (normalized whitespace)
 *   - ~94% of B records join; ~47% of joins are genuine many-to-one groups
 *
 * We reconstruct real match groups (one B record + its A-side group) and merge a
 * sample into our three-source dataset as category "benchrec_real", with the
 * answer key updated so eval scores them like everything else.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import Papa from "papaparse";
import { mulberry32, round2 } from "../src/util";
import type { FinRecord, GroundTruth } from "../src/types";

const user = process.env.KAGGLE_USERNAME;
const key = process.env.KAGGLE_KEY;
const DATA = "data";
const SAMPLE = 20; // real match groups to mix in

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

  // Build real match groups: one B record + its A-side group
  interface Group { b: (typeof B)[number]; aGroup: typeof A }
  const groups: Group[] = [];
  for (const s of solution) {
    const k = norm(s.targetAllocation);
    const aGroup = aByAlloc.get(k);
    const bRow = bById.get(norm(s.B_id));
    if (aGroup && bRow) groups.push({ b: bRow, aGroup });
  }
  console.log(`benchrec: ${A.length} A records, ${B.length} B records, ${groups.length} reconstructable match groups`);

  // Sample a mix: prefer some many-to-one (aGroup>1) and some 1:1
  const rng = mulberry32(2024);
  const shuffled = [...groups].sort(() => rng() - 0.5);
  const mto = shuffled.filter((g) => g.aGroup.length > 1);
  const oto = shuffled.filter((g) => g.aGroup.length === 1);
  const picked = [...mto.slice(0, Math.ceil(SAMPLE / 2)), ...oto.slice(0, Math.floor(SAMPLE / 2))];

  const bank: FinRecord[] = [];
  const ledger: FinRecord[] = [];
  const pairs: GroundTruth["pairs"] = [];
  let bSeq = 70000, lSeq = 71000;

  for (const g of picked) {
    const bAmt = cleanAmt(g.b.B_amount);
    if (bAmt === null) continue;
    const bId = `B${bSeq++}`;
    const bRef = norm(g.b.B_transactionReferences).slice(0, 40) || bId;
    bank.push({
      id: bId,
      source: "bank",
      date: cleanDate(g.b.B_valueDate),
      amount: bAmt,
      currency: norm(g.b.B_currencyCode) || "USD",
      description: norm(g.b.B_transactionAttributes).slice(0, 80) || "benchrec bank txn",
      reference: bRef,
    });
    const ledgerIds: string[] = [];
    for (const a of g.aGroup) {
      const aAmt = cleanAmt(a.A_amount);
      if (aAmt === null) continue;
      const lId = `L${lSeq++}`;
      ledger.push({
        id: lId,
        source: "ledger",
        date: cleanDate(a.A_valueDate),
        amount: aAmt,
        currency: norm(a.A_currencyCode) || "USD",
        description: norm(a.A_transactionAttributes).slice(0, 80) || "benchrec ledger txn",
        reference: norm(a.A_transactionReferences).slice(0, 40) || lId,
      });
      ledgerIds.push(lId);
    }
    if (ledgerIds.length > 0) {
      pairs.push({ bankId: bId, ledgerIds, processorId: null, category: "benchrec_real" });
    }
  }

  if (bank.length === 0) throw new Error("no usable groups reconstructed");

  const bankFile = join(DATA, "bank-statement.json");
  const ledgerFile = join(DATA, "internal-ledger.json");
  const truthFile = join(DATA, "ground-truth.json");
  if (existsSync(bankFile) && existsSync(ledgerFile) && existsSync(truthFile)) {
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
  } else {
    console.log("synthetic dataset not generated yet — run bun run gen first; skipping merge");
  }
} catch (err) {
  console.log(`benchrec fetch failed (${err instanceof Error ? err.message : err}) — continuing synthetic-only`);
}
