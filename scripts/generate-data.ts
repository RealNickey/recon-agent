/**
 * Deterministic synthetic dataset generator.
 * Usage: bun run scripts/generate-data.ts [--seed N] [--out DIR] [--mode standard|hard]
 *
 * Writes bank-statement.json, internal-ledger.json, processor-export.json
 * into --out. The answer key is NEVER written next to those files.
 *
 * If GROUND_TRUTH_PATH (or GROUND_TRUTH_HOLDOUT_PATH / GROUND_TRUTH_HARD_PATH)
 * is set to a path OUTSIDE this repo, the answer key is written there.
 * Otherwise we print a warning and skip the key — the pipeline can still run,
 * eval cannot.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mulberry32, randInt, pick, randomDate, addDays, round2, shuffle, resolveExternalTruthPath } from "../src/util";
import type { FinRecord, GroundTruth } from "../src/types";

const VENDORS = [
  "Acme Corp", "Globex Ltd", "Initech LLC", "Umbrella Inc", "Stark Industries",
  "Wayne Enterprises", "Hooli", "Massive Dynamic", "Soylent Co", "Tyrell Corp",
  "Wonka Labs", "Cyberdyne Systems", "Aperture Science", "Oscorp", "Vandelay Industries",
];

const BASE = "2026-06-01";
const SPAN = 30;

export interface BuiltDataset {
  bank: FinRecord[];
  ledger: FinRecord[];
  processor: FinRecord[];
  truth: GroundTruth["pairs"];
}

export function generateDataset(seed: number, mode: "standard" | "hard" = "standard"): BuiltDataset {
  const rng = mulberry32(seed);
  let ledgerSeq = 1000;
  let bankSeq = 5000;
  let procSeq = 9000;

  const built: BuiltDataset = { bank: [], ledger: [], processor: [], truth: [] };

  function mkLedger(desc: string, amount: number, date: string, ref: string, currency = "USD"): FinRecord {
    return { id: `L${ledgerSeq++}`, source: "ledger", date, amount: round2(amount), currency, description: desc, reference: ref };
  }
  function mkBank(desc: string, amount: number, date: string, ref: string, currency = "USD"): FinRecord {
    return { id: `B${bankSeq++}`, source: "bank", date, amount: round2(amount), currency, description: desc, reference: ref };
  }
  function mkProc(desc: string, amount: number, date: string, ref: string, currency = "USD"): FinRecord {
    return { id: `P${procSeq++}`, source: "processor", date, amount: round2(amount), currency, description: desc, reference: ref };
  }

  // --- Standard mode generator functions (preserved exactly for seed 42/777 lock) ---

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
      const lag = randInt(rng, 1, 2);
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
      const lRef = variants[0]!;
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
        const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
        built.ledger.push(l);
        built.truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "unmatchable" });
      } else {
        const b = mkBank(`${v} payment ${inv}`, amt, date, inv);
        built.bank.push(b);
        built.truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "unmatchable" });
      }
    }
  }

  function addOneToMany(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const date = randomDate(rng, BASE, SPAN - 1);
      const k = randInt(rng, 2, 3);
      const parts: number[] = [];
      const banks: FinRecord[] = [];
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      for (let j = 0; j < k; j++) {
        const amt = randInt(rng, 80, 1500) + randInt(rng, 0, 99) / 100;
        parts.push(amt);
        banks.push(mkBank(`${v} installment ${j + 1} ${inv}`, amt, addDays(date, j), `${inv}-${j + 1}`));
      }
      const total = round2(parts.reduce((a, b) => a + b, 0));
      const l = mkLedger(`${v} invoice ${inv}`, total, date, inv);
      built.ledger.push(l); built.bank.push(...banks);
      built.truth.push({
        bankId: banks[0]!.id,
        ledgerIds: [l.id],
        processorId: null,
        extraBankIds: banks.slice(1).map((b) => b.id),
        category: "one_to_many",
      });
    }
  }

  function addCurrencyFx(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const usd = randInt(rng, 200, 4000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const rate = 0.85 + rng() * 0.3;
      const eur = round2(usd * rate);
      const l = mkLedger(`${v} invoice ${inv}`, usd, date, inv, "USD");
      const b = mkBank(`${v} payment ${inv}`, eur, date, inv, "EUR");
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    }
  }

  function addPartialPayment(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 400, 5000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const paid = round2(amt * (0.4 + rng() * 0.3));
      const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
      const b = mkBank(`${v} partial ${inv}`, paid, date, inv);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "partial_payment" });
    }
  }

  function addRefundReversal(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 80, 2000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN - 2);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const l = mkLedger(`${v} credit memo ${inv}`, -amt, date, inv);
      const b = mkBank(`${v} refund ${inv}`, -amt, addDays(date, 1), inv);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "refund_reversal" });
    }
  }

  // --- Hard mode generator functions ---

  function addTimingDriftWide(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 100, 7000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN - 15);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const lag = randInt(rng, 5, 14);
      const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
      const b = mkBank(`${v} payment ${inv}`, amt, addDays(date, lag), inv);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "timing_drift_wide" });
    }
  }

  function addAmountFeeWide(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 500, 8000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const feePct = 0.035 + rng() * 0.045; // 3.5% to 8.0% fee
      const bankAmt = round2(amt * (1 - feePct));
      const l = mkLedger(`${v} invoice ${inv}`, amt, date, inv);
      const b = mkBank(`${v} payment ${inv} net of fee`, bankAmt, addDays(date, 1), inv);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "amount_fee_wide" });
    }
  }

  function addIdentityWeak(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 200, 6000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN - 2);
      const code = `${randInt(rng, 100000, 999999)}`;
      const lRef = `PO-${code}`;
      const bRef = `WIRE-${randInt(rng, 1000, 9999)}`;
      const l = mkLedger(`${v} monthly retainer ${lRef}`, amt, date, lRef);
      const b = mkBank(`${v.toUpperCase()} RET PO#${code}`, amt, addDays(date, 1), bRef);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "identity_weak" });
    }
  }

  function addAmbiguousVendor(n: number) {
    for (let i = 0; i < n / 2; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 150, 4000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN);
      const inv1 = `INV-${randInt(rng, 10000, 99999)}`;
      const inv2 = `INV-${randInt(rng, 10000, 99999)}`;
      const l1 = mkLedger(`${v} delivery fee ${inv1}`, amt, date, inv1);
      const l2 = mkLedger(`${v} delivery fee ${inv2}`, amt, date, inv2);
      const b1 = mkBank(`${v} payment ${inv1}`, amt, date, inv1);
      const b2 = mkBank(`${v} payment ${inv2}`, amt, date, inv2);
      built.ledger.push(l1, l2); built.bank.push(b1, b2);
      built.truth.push({ bankId: b1.id, ledgerIds: [l1.id], processorId: null, category: "ambiguous_vendor" });
      built.truth.push({ bankId: b2.id, ledgerIds: [l2.id], processorId: null, category: "ambiguous_vendor" });
    }
  }

  function addManyToOneWide(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const date = randomDate(rng, BASE, SPAN - 2);
      const k = randInt(rng, 4, 6);
      const parts: number[] = [];
      const ledgers: FinRecord[] = [];
      for (let j = 0; j < k; j++) {
        const amt = randInt(rng, 100, 1500) + randInt(rng, 0, 99) / 100;
        parts.push(amt);
        const inv = `INV-${randInt(rng, 10000, 99999)}`;
        ledgers.push(mkLedger(`${v} project milestone ${inv}`, amt, date, inv));
      }
      const total = round2(parts.reduce((a, b) => a + b, 0));
      const b = mkBank(`${v} consolidated batch wire`, total, addDays(date, 1), `BATCH-${randInt(rng, 1000, 9999)}`);
      built.ledger.push(...ledgers); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: ledgers.map((l) => l.id), processorId: null, category: "many_to_one_wide" });
    }
  }

  function addExtrasDoNotSum(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const date = randomDate(rng, BASE, SPAN - 1);
      const k = randInt(rng, 2, 3);
      const parts: number[] = [];
      const matchableLedgers: FinRecord[] = [];
      for (let j = 0; j < k; j++) {
        const amt = randInt(rng, 200, 2000) + randInt(rng, 0, 99) / 100;
        parts.push(amt);
        const inv = `INV-${randInt(rng, 10000, 99999)}`;
        matchableLedgers.push(mkLedger(`${v} order ${inv}`, amt, date, inv));
      }
      const total = round2(parts.reduce((a, b) => a + b, 0));
      const b = mkBank(`${v} batch settlement`, total, addDays(date, 1), `BATCH-${randInt(rng, 1000, 9999)}`);
      built.ledger.push(...matchableLedgers); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: matchableLedgers.map((l) => l.id), processorId: null, category: "many_to_one_wide" });

      for (let j = 0; j < 2; j++) {
        const extraAmt = randInt(rng, 150, 1800) + randInt(rng, 0, 99) / 100;
        const extraInv = `INV-${randInt(rng, 10000, 99999)}`;
        const extraL = mkLedger(`${v} order ${extraInv}`, extraAmt, date, extraInv);
        built.ledger.push(extraL);
        built.truth.push({ bankId: null, ledgerIds: [extraL.id], processorId: null, category: "extras_do_not_sum" });
      }
    }
  }

  function addDistractorUnmatchable(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 100, 5000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      if (i % 2 === 0) {
        const l = mkLedger(`${v} uncollected invoice ${inv}`, amt, date, inv);
        built.ledger.push(l);
        built.truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "distractor_unmatchable" });
      } else {
        const b = mkBank(`${v} unallocated wire ${inv}`, amt, date, `UNALLOC-${randInt(rng, 1000, 9999)}`);
        built.bank.push(b);
        built.truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "distractor_unmatchable" });
      }
    }
  }

  function addFxNoInvoice(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const usd = randInt(rng, 300, 5000) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN - 2);
      const rate = 0.85 + rng() * 0.25;
      const eur = round2(usd * rate);
      const lRef = `TX-INT-${randInt(rng, 10000, 99999)}`;
      const bRef = `WIRE-SEPA-${randInt(rng, 10000, 99999)}`;
      const l = mkLedger(`${v} overseas consulting`, usd, date, lRef, "USD");
      const b = mkBank(`${v.toUpperCase()} EUR SETTLE`, eur, addDays(date, 1), bRef, "EUR");
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "fx_no_invoice" });
    }
  }

  function addSignFlip(n: number) {
    for (let i = 0; i < n; i++) {
      const v = pick(VENDORS, rng);
      const amt = randInt(rng, 100, 2500) + randInt(rng, 0, 99) / 100;
      const date = randomDate(rng, BASE, SPAN - 2);
      const inv = `INV-${randInt(rng, 10000, 99999)}`;
      const l = mkLedger(`${v} return adjustment ${inv}`, -amt, date, inv);
      const b = mkBank(`${v} credit reversal ${inv}`, -amt, addDays(date, 1), inv);
      built.ledger.push(l); built.bank.push(b);
      built.truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "sign_flip" });
    }
  }

  if (mode === "hard") {
    addExact(10);
    addTimingDriftWide(8);
    addAmountFeeWide(8);
    addIdentityWeak(8);
    addAmbiguousVendor(6);
    addManyToOneWide(6);
    addExtrasDoNotSum(4);
    addDistractorUnmatchable(10);
    addFxNoInvoice(6);
    addSignFlip(6);
    addUnmatchable(10);
  } else {
    addExact(15);
    addAmountVariance(8);
    addTimingDrift(8);
    addIdFormatDrift(8);
    addManyToOne(6);
    addDuplicate(5);
    addUnmatchable(10);
    addOneToMany(4);
    addCurrencyFx(4);
    addPartialPayment(4);
    addRefundReversal(4);
  }

  return built;
}

// CLI Execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  function argVal(flag: string, dflt: string): string {
    const i = args.indexOf(flag);
    const val = i >= 0 ? args[i + 1] : undefined;
    return val !== undefined ? val : dflt;
  }

  const OUT = argVal("--out", "data");
  const isHard = OUT.includes("hard") || args.includes("--hard") || argVal("--mode", "") === "hard";
  const isHoldout = !isHard && OUT.includes("holdout");
  const defaultSeed = isHard ? "999" : isHoldout ? "777" : "42";
  const SEED = parseInt(argVal("--seed", defaultSeed), 10);
  const MODE = isHard ? "hard" : "standard";

  const built = generateDataset(SEED, MODE);
  const rng = mulberry32(SEED);

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

  const datasetName = isHard ? "hard" : isHoldout ? "holdout" : "dev";
  const truthPath = resolveExternalTruthPath(datasetName);
  if (truthPath) {
    mkdirSync(dirname(truthPath), { recursive: true });
    writeFileSync(truthPath, JSON.stringify(truth, null, 2));
    console.log(`answer key written outside repo for dataset: ${datasetName}`);
  } else {
    console.error(`REFUSED: answer key path unset for ${datasetName}. Source files were written, but the answer key was NOT. Set GROUND_TRUTH_PATH outside this repo.`);
    process.exit(1);
  }

  console.log(`seed=${SEED} out=${OUT} mode=${MODE}`);
  console.log(`bank=${built.bank.length} ledger=${built.ledger.length} processor=${built.processor.length} truthPairs=${truth.pairs.length}`);
  console.log(`categories: ${JSON.stringify(counts)}`);
}
