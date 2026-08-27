/**
 * Optional: mix real reconciliation data (Kaggle BenchRec) into the synthetic set.
 * Uses Kaggle API v1 over plain HTTPS with basic auth — no Python/CLI needed.
 * Silently no-ops if creds are missing or anything fails.
 *
 * First run inspects the CSV and prints its actual columns, then maps defensively.
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
const SAMPLE = 15;

if (!user || !key) {
  console.log("no KAGGLE_USERNAME/KAGGLE_KEY — skipping BenchRec (synthetic-only is fine)");
  process.exit(0);
}

const url = "https://www.kaggle.com/api/v1/datasets/download/benchmarkteam/benchrec-real-world-cash-reconciliation-dataset";
try {
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`${user}:${key}`).toString("base64") },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(zip);
  const csvName = Object.keys(files).find((f) => f.toLowerCase().endsWith(".csv"));
  if (!csvName) throw new Error("no csv in archive");
  const text = new TextDecoder().decode(files[csvName]);
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data;
  const cols = parsed.meta.fields ?? [];
  console.log(`benchrec: ${rows.length} rows`);
  console.log(`columns: ${cols.join(" | ")}`);
  console.log(`sample row: ${JSON.stringify(rows[0])}`);

  // Column mapping — defensive: match by normalized header substring.
  const get = (r: Record<string, string>, ...names: string[]) => {
    for (const n of names) {
      const k = Object.keys(r).find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(n));
      if (k && r[k] !== undefined && r[k] !== "") return r[k];
    }
    return "";
  };

  const rng = mulberry32(1234);
  const shuffled = [...rows].sort(() => rng() - 0.5);
  const bank: FinRecord[] = [];
  const ledger: FinRecord[] = [];
  const pairs: GroundTruth["pairs"] = [];
  let bSeq = 70000, lSeq = 71000;

  for (const r of shuffled) {
    if (bank.length >= SAMPLE) break;
    const amtRaw = get(r, "amount", "amt", "value", "debit", "credit");
    const amt = parseFloat(String(amtRaw).replace(/[^0-9.\-]/g, ""));
    if (!isFinite(amt) || amt === 0) continue;
    const date = get(r, "date", "postingdate", "valuedate", "transactiondate").slice(0, 10) || "2026-06-15";
    const desc = (get(r, "description", "narrative", "memo", "details", "reference") || "benchrec txn").slice(0, 80);
    const ref = (get(r, "reference", "ref", "transactionid", "id", "checknumber") || `BR${bSeq}`).slice(0, 30);
    const absAmt = round2(Math.abs(amt));
    const b: FinRecord = { id: `B${bSeq++}`, source: "bank", date, amount: absAmt, currency: "USD", description: desc, reference: ref };
    const l: FinRecord = { id: `L${lSeq++}`, source: "ledger", date, amount: absAmt, currency: "USD", description: desc, reference: ref };
    bank.push(b); ledger.push(l);
    pairs.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "exact" });
  }

  if (bank.length === 0) throw new Error("no usable rows mapped — check column mapping against the printed columns above");

  const bankFile = join(DATA, "bank-statement.json");
  const ledgerFile = join(DATA, "internal-ledger.json");
  const truthFile = join(DATA, "ground-truth.json");
  if (existsSync(bankFile) && existsSync(ledgerFile) && existsSync(truthFile)) {
    const eb = JSON.parse(readFileSync(bankFile, "utf8")) as FinRecord[];
    const el = JSON.parse(readFileSync(ledgerFile, "utf8")) as FinRecord[];
    const et = JSON.parse(readFileSync(truthFile, "utf8")) as GroundTruth;
    writeFileSync(bankFile, JSON.stringify([...eb, ...bank], null, 2));
    writeFileSync(ledgerFile, JSON.stringify([...el, ...ledger], null, 2));
    et.pairs.push(...pairs);
    et.meta.counts["benchrec_real"] = bank.length;
    writeFileSync(truthFile, JSON.stringify(et, null, 2));
    console.log(`mixed ${bank.length} real records into dataset (category: exact, tagged benchrec_real in key)`);
  } else {
    console.log("synthetic dataset not generated yet — run bun run gen first; skipping merge");
  }
} catch (err) {
  console.log(`benchrec fetch failed (${err instanceof Error ? err.message : err}) — continuing synthetic-only`);
}
