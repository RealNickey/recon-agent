/**
 * Optional: mix real reconciliation data (Kaggle BenchRec) into the synthetic set.
 * Uses Kaggle API v1 over plain HTTPS with basic auth — no Python/CLI needed.
 * Silently no-ops if creds are missing or anything fails.
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
  console.log(`benchrec: ${rows.length} rows, columns: ${parsed.meta.fields?.join(", ")}`);

  // BenchRec has bank/book sides — map loosely onto our shape. Column names are
  // normalized defensively since the dataset's exact headers may vary.
  const rng = mulberry32(1234);
  const shuffled = [...rows].sort(() => rng() - 0.5).slice(0, SAMPLE * 2);
  const bank: FinRecord[] = [];
  const ledger: FinRecord[] = [];
  const pairs: GroundTruth["pairs"] = [];
  let bSeq = 70000, lSeq = 71000;

  const get = (r: Record<string, string>, ...names: string[]) => {
    for (const n of names) {
      const k = Object.keys(r).find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "").includes(n));
      if (k && r[k]) return r[k];
    }
    return "";
  };

  for (const r of shuffled) {
    const amt = parseFloat(get(r, "amount", "amt", "value"));
    if (!isFinite(amt)) continue;
    const date = get(r, "date", "postingdate", "valuedate").slice(0, 10) || "2026-06-15";
    const desc = get(r, "description", "narrative", "memo", "reference") || "benchrec txn";
    const ref = get(r, "reference", "ref", "transactionid", "id") || `BR${bSeq}`;
    const b: FinRecord = { id: `B${bSeq++}`, source: "bank", date, amount: round2(Math.abs(amt)), currency: "USD", description: desc.slice(0, 80), reference: ref.slice(0, 30) };
    const l: FinRecord = { id: `L${lSeq++}`, source: "ledger", date, amount: b.amount, currency: "USD", description: b.description, reference: b.reference };
    bank.push(b); ledger.push(l);
    pairs.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "exact" });
    if (bank.length >= SAMPLE) break;
  }

  if (bank.length === 0) throw new Error("no usable rows mapped");

  // merge into existing dataset
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
    console.log(`mixed ${bank.length} real records into dataset`);
  } else {
    console.log("synthetic dataset not generated yet — run bun run gen first; skipping merge");
  }
} catch (err) {
  console.log(`benchrec fetch failed (${err instanceof Error ? err.message : err}) — continuing synthetic-only`);
}
