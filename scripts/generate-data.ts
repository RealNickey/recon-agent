/**
 * Deterministic synthetic dataset generator.
 * Usage: bun run scripts/generate-data.ts [--seed N] [--out DIR]
 * Writes bank-statement.json, internal-ledger.json, processor-export.json, ground-truth.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, randInt, pick, randomDate, addDays, round2, shuffle } from "../src/util";
import type { FinRecord, GroundTruth } from "../src/types";

const args = process.argv.slice(2);
function argVal(flag: string, dflt: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const SEED = parseInt(argVal("--seed", "42"), 10);
const OUT = argVal("--out", "data");

const rng = mulberry32(SEED);
const VENDORS = [
  "Acme Corp", "Globex Ltd", "Initech LLC", "Umbrella Inc", "Stark Industries",
  "Wayne Enterprises", "Hooli", "Massive Dynamic", "Soylent Co", "Tyrell Corp",
  "Wonka Labs", "Cyberdyne Systems", "Aperture Science", "Oscorp", "Vandelay Industries",
];

let ledgerSeq = 1000;
let bankSeq = 5000;
let procSeq = 9000;

interface Built {
  bank: FinRecord[];
  ledger: FinRecord[];
  processor: FinRecord[];
  truth: GroundTruth["pairs"];
}

const built: Built = { bank: [], ledger: [], processor: [], truth: [] };

function mkLedger(desc: string, amount: number, date: string, ref: string): FinRecord {
  return { id: `L${ledgerSeq++}`, source: "ledger", date, amount: round2(amount), currency: "USD", description: desc, reference: ref };
}
function mkBank(desc: string, amount: number, date: string, ref: string): FinRecord {
  return { id: `B${bankSeq++}`, source: "bank", date, amount: round2(amount), currency: "USD", description: desc, reference: ref };
}
function mkProc(desc: string, amount: number, date: string, ref: string): FinRecord {
  return { id: `P${procSeq++}`, source: "processor", date, amount: round2(amount), currency: "USD", description: desc, reference: ref };
}

const BASE = "2026-06-01";
const SPAN = 30;

function addExact(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 50, 9000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN);
    const inv = `INV-${randInt(rng, 10000, 99999)}`;
    const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
    const b = mkBank(`${v} payment ${inv}`, amt, date, inv);
    const p = rng() < 0.5 ? mkProc(`${v} ${inv}`, amt, date, inv) : null;
    built.ledger.push(l); built.bank.push(b); if (p) built.processor.push(p);
    built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: p?.id ?? null, category: "exact" });
  }
}

function addAmountVariance(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 100, 8000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN);
    const inv = `INV-${randInt(rng, 10000, 99999)}`;
    // half within tolerance (<= $0.05 rounding), half outside (fee 0.5–3%)
    const within = i % 2 === 0;
    const bankAmt = within ? amt + round2((rng() - 0.5) * 0.08) : amt * (1 - (0.005 + rng() * 0.025));
    const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
    const b = mkBank(`${v} payment ${inv}`, bankAmt, date, inv);
    built.ledger.push(l); built.bank.push(b);
    built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "amount_variance" });
  }
}

function addTimingDrift(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 100, 7000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN - 3);
    const inv = `INV-${randInt(rng, 10000, 99999)}`;
    const lag = randInt(rng, 1, 2); // T+1 / T+2 settlement
    const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
    const b = mkBank(`${v} payment ${inv}`, amt, addDays(date, lag), inv);
    built.ledger.push(l); built.bank.push(b);
    built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "timing_drift" });
  }
}

function addIdFormatDrift(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 100, 6000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN);
    const num = `${randInt(rng, 10000, 99999)}`;
    const variants = [`INV-${num}`, num, `INV${num}`, `inv ${num}`, `INV-${num}-A`];
    const lRef = variants[0];
    const bRef = pick(variants.slice(1), rng);
    const l = mkLedger(`${v} invoice ${lRef}`, amt, date, lRef);
    const b = mkBank(`${v} payment ${bRef}`, amt, date, bRef);
    built.ledger.push(l); built.bank.push(b);
    built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "id_format_drift" });
  }
}

function addManyToOne(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const date = randomDate(rng, BASE, SPAN - 1);
    const k = randInt(rng, 2, 3);
    const parts: number[] = [];
    const ledgers: FinRecord[] = [];
    for (let j = 0; j < k; j++) {
      const amt = randInt(rng, 80, 2500) + randInt(rng, 0, 99) / 100;
      parts.push(amt);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      ledgers.push(mkLedger(`${v} invoice ${inv}`, amt, date, inv));
    }
    const total = round2(parts.reduce((a, b) => a + b, 0));
    const b = mkBank(`${v} batch payment`, total, addDays(date, 1), `BATCH-${randInt(rng, 1000, 9999)}`);
    built.ledger.push(...ledgers); built.bank.push(b);
    built.truth.push({ bankId: b.id, ledgerIds: ledgers.map((l) => l.id), processorId: null, category: "many_to_one" });
  }
}

function addDuplicate(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 100, 5000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN);
    const inv = `INV-${randInt(rng, 10000, 99999)}`;
    // ledger has the invoice twice (double-posted); bank has ONE payment
    const l1 = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
    const l2 = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
    const b = mkBank(`${v} payment ${inv}`, amt, date, inv);
    built.ledger.push(l1, l2); built.bank.push(b);
    built.truth.push({ bankId: b.id, ledgerIds: [l1.id, l2.id], processorId: null, category: "duplicate" });
  }
}

function addUnmatchable(n: number) {
  for (let i = 0; i < n; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 40, 6000) + randInt(rng, 0, 99) / 100;
    const date = randomDate(rng, BASE, SPAN);
    const inv = `INV-${randInt(rng, 10000, 99999)}`;
    if (i % 2 === 0) {
      const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv); // no bank counterpart
      built.ledger.push(l);
      built.truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "unmatchable" });
    } else {
      const b = mkBank(`${v} payment ${inv}`, amt, date, inv); // no ledger counterpart
      built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "unmatchable" });
    }
  }
}

addExact(15);
addAmountVariance(8);
addTimingDrift(8);
addIdFormatDrift(8);
addManyToOne(6);
addDuplicate(5);
addUnmatchable(10);

const counts: Record<string, number> = {};
for (const p of built.truth) counts[p.category] = (counts[p.category] ?? 0) + 1;

const truth: GroundTruth = {
  meta: { seed: SEED, generatedAt: new Date().toISOString(), counts },
  pairs: built.truth,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "bank-statement.json"), JSON.stringify(shuffle(built.bank, rng), null, 2));
writeFileSync(join(OUT, "internal-ledger.json"), JSON.stringify(shuffle(built.ledger, rng), null, 2));
writeFileSync(join(OUT, "processor-export.json"), JSON.stringify(shuffle(built.processor, rng), null, 2));
writeFileSync(join(OUT, "ground-truth.json"), JSON.stringify(truth, null, 2));

console.log(`seed=${SEED} out=${OUT}`);
console.log(`bank=${built.bank.length} ledger=${built.ledger.length} processor=${built.processor.length} truthPairs=${truth.pairs.length}`);
console.log(`categories: ${JSON.stringify(counts)}`);
