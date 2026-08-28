/**
 * Adversarial & Complex Scenario Generator for Recon Agent.
 * Generates frontier financial operations and settlement scenarios:
 * 1. Razorpay Multi-Leg Settlement (Gross Ledger → Processor Capture → Compound MDR/TDS Deductions → Net Bank Payout)
 * 2. Partial Refund & Chargeback Chains (Original Sale → Partial Refund → Dispute Reversal)
 * 3. Expanded Cross-Currency FX Corridors with Bid-Ask & Penny Drift (EUR/USD, GBP/USD, USD/INR, EUR/INR)
 * 4. Extended Value-Date Timing Drift (up to 30 days with UPI VPAs, IMPS RRNs, Bank UTRs)
 * 5. Near-Duplicate Collision Attacks (subtly conflicting suffixes / ambiguous counterparties)
 * 6. Partial Refunds with Gateway Fee Drift (processor retained non-refundable fee variance)
 * 7. Multi-Currency Split Deposits (lump-sum multi-currency cross-border settlement)
 * 8. Unmatchable Suspense Distractors (phantom bank debits & unallocated wires)
 *
 * Usage: bun run scripts/generate-adversarial.ts [--seed N] [--out DIR] [--eval]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, randInt, pick, randomDate, addDays, round2 } from "../src/util";
import type { FinRecord, GroundTruth, RunResult, Outcome } from "../src/types";
import { tier1Exact } from "../src/pipeline/tier1-exact";
import { tier2Fuzzy } from "../src/pipeline/tier2-fuzzy";
import { buildExceptionOutcome } from "../src/pipeline/run";
import { scoreRun } from "../src/scoring";

const INDIAN_VENDORS = [
  "Razorpay Software Pvt Ltd", "Zoho Technologies", "Freshworks Inc", "Swiggy Bundl",
  "Zomato Media", "Flipkart Internet", "Infosys Limited", "TCS Digital",
  "Wipro Enterprise", "Paytm Payments Bank", "PhonePe Pvt Ltd", "CRED Dreamplug"
];

const GLOBAL_VENDORS = [
  "Acme Global Inc", "Globex International", "Initech Corp", "Stark Industries",
  "Wayne Enterprises", "Hooli Cloud LLC", "Massive Dynamic UK", "Aperture Labs"
];

const BASE = "2026-06-01";

export function generateAdversarialDataset(seed = 2026) {
  const rng = mulberry32(seed);
  let ledgerSeq = 1000;
  let bankSeq = 5000;
  let procSeq = 9000;

  const bank: FinRecord[] = [];
  const ledger: FinRecord[] = [];
  const processor: FinRecord[] = [];
  const truth: GroundTruth["pairs"] = [];

  function mkLedger(desc: string, amount: number, date: string, ref: string, currency = "INR"): FinRecord {
    return { id: `L${ledgerSeq++}`, source: "ledger", date, amount: round2(amount), currency, description: desc, reference: ref };
  }
  function mkBank(desc: string, amount: number, date: string, ref: string, currency = "INR"): FinRecord {
    return { id: `B${bankSeq++}`, source: "bank", date, amount: round2(amount), currency, description: desc, reference: ref };
  }
  function mkProc(desc: string, amount: number, date: string, ref: string, currency = "INR"): FinRecord {
    return { id: `P${procSeq++}`, source: "processor", date, amount: round2(amount), currency, description: desc, reference: ref };
  }

  // 1. Razorpay Multi-Leg Settlement: Gross Ledger Sale → Processor Capture → Compound Deductions → Net Bank Payout
  for (let i = 0; i < 6; i++) {
    const v = pick(INDIAN_VENDORS, rng);
    const gross = randInt(rng, 50000, 250000);
    const date = randomDate(rng, BASE, 20);
    const orderId = `order_${randInt(rng, 100000, 999999)}`;
    const paymentId = `pay_${randInt(rng, 100000, 999999)}`;

    let net = gross;
    let feeDesc = "";
    if (i % 3 === 0) {
      // Razorpay MDR (2.36%) + Section 194J TDS (10%) = 12.36% compound deduction
      net = round2(gross * (1 - 0.1236));
      feeDesc = "MDR 2.36% + TDS 194J 10%";
    } else if (i % 3 === 1) {
      // Razorpay MDR (2.36%) + Section 194C TDS (2%) = 4.36% compound deduction
      net = round2(gross * (1 - 0.0436));
      feeDesc = "MDR 2.36% + TDS 194C 2%";
    } else {
      // Standard Razorpay MDR (2.36%)
      net = round2(gross * (1 - 0.0236));
      feeDesc = "MDR 2.36% (2% fee + 18% GST)";
    }

    const utr = `HDFCR52026${randInt(rng, 10000000, 99999999)}`;
    const l = mkLedger(`${v} customer checkout sale gross`, gross, date, orderId);
    const p = mkProc(`Razorpay Captured Payment fee (${feeDesc}) for ${orderId}`, gross, date, paymentId);
    const b = mkBank(`RAZORPAY NODAL SETTLEMENT NET FOR ${v.toUpperCase()} UTR:${utr}`, net, addDays(date, 1), `RZP-SETTLE-${orderId}`);

    ledger.push(l); processor.push(p); bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: p.id, category: "amount_variance" });
  }

  // 2. Partial Refund & Chargeback Chains: Original Sale → Partial Refund Line → Gateway Dispute/Chargeback Fee Reversal
  for (let i = 0; i < 4; i++) {
    const v = pick(INDIAN_VENDORS, rng);
    const invNum = `${randInt(rng, 10000, 99999)}`;
    const saleAmt = randInt(rng, 20000, 60000);
    const refAmt = randInt(rng, 5000, 15000);
    const date = randomDate(rng, BASE, 15);

    // Original Sale
    const lSale = mkLedger(`${v} original subscription sale INV-${invNum}`, saleAmt, date, `INV-${invNum}`);
    const bSale = mkBank(`${v.toUpperCase()} PAYMENT INV-${invNum}`, saleAmt, addDays(date, 1), `INV-${invNum}`);
    ledger.push(lSale); bank.push(bSale);
    truth.push({ bankId: bSale.id, ledgerIds: [lSale.id], processorId: null, category: "exact" });

    // Partial Refund Credit Note
    const lRef = mkLedger(`${v} partial refund credit note CN-${invNum}`, -refAmt, addDays(date, 5), `CN-${invNum}`);
    const bRef = mkBank(`REFUND REVERSAL FOR CN-${invNum} ${v.toUpperCase()}`, -refAmt, addDays(date, 6), `REFUND-${invNum}`);
    ledger.push(lRef); bank.push(bRef);
    truth.push({ bankId: bRef.id, ledgerIds: [lRef.id], processorId: null, category: "refund_reversal" });
  }

  // 3. Expanded Cross-Currency FX Corridors with Bid-Ask & Penny Rounding Drift (EUR/USD, GBP/USD, USD/INR, EUR/INR)
  for (let i = 0; i < 6; i++) {
    const v = pick(GLOBAL_VENDORS, rng);
    const date = randomDate(rng, BASE, 20);
    const code = `${randInt(rng, 10000, 99999)}`;
    const pennyDrift = ((i % 2 === 0 ? 1 : -1) * randInt(rng, 1, 3)) / 100; // 1-3 cents / paise drift

    if (i % 4 === 0) {
      // USD -> INR (corridor 75 - 95 INR/USD)
      const usd = randInt(rng, 1000, 5000);
      const effectiveRate = 83.5 + (rng() - 0.5) * 4.0; // 81.5 - 85.5
      const inr = round2(usd * effectiveRate + pennyDrift * 100);
      const l = mkLedger(`${v} cloud software license`, usd, date, `INV-US-${code}`, "USD");
      const b = mkBank(`INWARD REMITTANCE FOR ${v.toUpperCase()}`, inr, addDays(date, 2), `FX-INR-${code}`, "INR");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else if (i % 4 === 1) {
      // EUR -> INR (corridor 80 - 105 INR/EUR)
      const eur = randInt(rng, 1000, 4000);
      const effectiveRate = 90.0 + (rng() - 0.5) * 5.0; // 87.5 - 92.5
      const inr = round2(eur * effectiveRate + pennyDrift * 100);
      const l = mkLedger(`${v} design consulting retainer`, eur, date, `INV-EU-${code}`, "EUR");
      const b = mkBank(`INWARD SEPA SETTLEMENT ${v.toUpperCase()}`, inr, addDays(date, 2), `FX-EUR-${code}`, "INR");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else if (i % 4 === 2) {
      // GBP -> USD (corridor 1.15 - 1.45 USD/GBP)
      const gbp = randInt(rng, 2000, 8000);
      const effectiveRate = 1.28 + (rng() - 0.5) * 0.08;
      const usd = round2(gbp * effectiveRate + pennyDrift);
      const l = mkLedger(`${v} UK subsidiary engineering services`, gbp, date, `INV-UK-${code}`, "GBP");
      const b = mkBank(`WIRE FROM ${v.toUpperCase()} UK`, usd, addDays(date, 1), `WIRE-USD-${code}`, "USD");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else {
      // EUR -> USD (corridor 0.85 - 1.25 USD/EUR)
      const usd = randInt(rng, 3000, 10000);
      const rate = 0.92 + (rng() - 0.5) * 0.06;
      const eur = round2(usd * rate + pennyDrift);
      const l = mkLedger(`${v} international consulting`, usd, date, `INV-INT-${code}`, "USD");
      const b = mkBank(`${v.toUpperCase()} EUR SETTLEMENT`, eur, addDays(date, 1), `WIRE-EUR-${code}`, "EUR");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    }
  }

  // 4. Extended Value-Date Timing Drift: In-transit settlement drift (up to 30 days) with unstructured narrative memos
  for (let i = 0; i < 6; i++) {
    const v = pick(INDIAN_VENDORS, rng);
    const amt = randInt(rng, 15000, 95000);
    const date = randomDate(rng, BASE, 10);
    const lagDays = randInt(rng, 10, 28); // 10 - 28 days clearing drift

    if (i % 3 === 0) {
      // UPI VPA memo
      const vpa = `${v.toLowerCase().replace(/[^a-z]/g, "")}@okhdfcbank`;
      const l = mkLedger(`${v} payment invoice via UPI VPA ${vpa}`, amt, date, `INV-UPI-${randInt(rng, 1000, 9999)}`);
      const b = mkBank(`UPI CR ${vpa} IN-TRANSIT SETTLEMENT`, amt, addDays(date, lagDays), `UPI-${randInt(rng, 100000, 999999)}`);
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "timing_drift_wide" });
    } else if (i % 3 === 1) {
      // 12-digit IMPS RRN
      const rrn = `${randInt(rng, 100000, 999999)}${randInt(rng, 100000, 999999)}`;
      const l = mkLedger(`${v} urgent invoice payment RRN: ${rrn}`, amt, date, `INV-IMPS-${randInt(rng, 1000, 9999)}`);
      const b = mkBank(`IMPS CR RRN ${rrn} SETTLEMENT FROM ${v.toUpperCase()}`, amt, addDays(date, lagDays), `IMPS-${rrn}`);
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "timing_drift_wide" });
    } else {
      // 16-char Bank UTR
      const utr = `SBINR52026${randInt(rng, 10000000, 99999999)}`;
      const l = mkLedger(`${v} project retainer UTR:${utr}`, amt, date, `INV-RTGS-${randInt(rng, 1000, 9999)}`);
      const b = mkBank(`RTGS CR UTR ${utr} ${v.toUpperCase()}`, amt, addDays(date, lagDays), utr);
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "timing_drift_wide" });
    }
  }

  // 5. Near-Duplicate Collision Attacks (Engineered to test calibrated restraint & prevent false positive matching)
  for (let i = 0; i < 3; i++) {
    const v = pick(INDIAN_VENDORS, rng);
    const amt = randInt(rng, 30000, 80000);
    const date = randomDate(rng, BASE, 15);
    const baseCode = `${randInt(rng, 1000, 9999)}`;

    // Conflicting near-duplicate records sharing timestamps and rounded amounts with conflicting numeric suffixes
    const lA = mkLedger(`${v} enterprise license division north`, amt, date, `INV-${baseCode}1`);
    const lB = mkLedger(`${v} enterprise license division south`, amt, date, `INV-${baseCode}2`);
    // Bank payment with colliding near-duplicate identifier
    const b = mkBank(`NEFT SETTLEMENT FOR ${v.toUpperCase()} REF ${baseCode}3`, amt, addDays(date, 1), `WIRE-${baseCode}3`);

    ledger.push(lA, lB); bank.push(b);
    // Unresolvable collision: auto-matching would be guessing/hallucination. Must stay exceptions.
    truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "collision_near_duplicate" });
    truth.push({ bankId: null, ledgerIds: [lA.id], processorId: null, category: "collision_near_duplicate" });
    truth.push({ bankId: null, ledgerIds: [lB.id], processorId: null, category: "collision_near_duplicate" });
  }

  // 6. Partial Refunds & Gateway Fee Drift (Processor retained non-refundable fee variance)
  for (let i = 0; i < 3; i++) {
    const v = pick(INDIAN_VENDORS, rng);
    const invCode = `${randInt(rng, 10000, 99999)}`;
    const refundGross = randInt(rng, 20000, 50000);
    const retainedMdrFee = round2(refundGross * 0.0236); // 2.36% non-refundable MDR retained by gateway
    const refundNet = round2(refundGross - retainedMdrFee);
    const date = randomDate(rng, BASE, 15);

    const lCredit = mkLedger(`${v} full customer refund credit memo CN-${invCode}`, -refundGross, date, `CN-${invCode}`);
    const bRefund = mkBank(`GATEWAY REFUND NET OF NON-REFUNDABLE MDR FOR ${v.toUpperCase()}`, -refundNet, addDays(date, 1), `REFUND-RZP-${invCode}`);

    ledger.push(lCredit); bank.push(bRefund);
    // Unaccrued fee drift variance requires maker-checker journal adjustment, not unverified auto-match
    truth.push({ bankId: bRefund.id, ledgerIds: [], processorId: null, category: "partial_refund_fee_drift" });
    truth.push({ bankId: null, ledgerIds: [lCredit.id], processorId: null, category: "partial_refund_fee_drift" });
  }

  // 7. Multi-Currency Split Deposits (Single lump-sum bank deposit covering cross-border invoices in multiple currencies)
  for (let i = 0; i < 2; i++) {
    const v = pick(GLOBAL_VENDORS, rng);
    const date = randomDate(rng, BASE, 15);
    const code = `${randInt(rng, 10000, 99999)}`;

    const eurAmt = randInt(rng, 2000, 4000);
    const gbpAmt = randInt(rng, 1500, 3000);
    const rateEur = 1.08;
    const rateGbp = 1.28;
    const usdDeposit = round2(eurAmt * rateEur + gbpAmt * rateGbp);

    const lEur = mkLedger(`${v} EU consulting services invoice`, eurAmt, date, `INV-EU-${code}`, "EUR");
    const lGbp = mkLedger(`${v} UK engineering services invoice`, gbpAmt, date, `INV-UK-${code}`, "GBP");
    const bUsd = mkBank(`CONSOLIDATED CROSS-BORDER SETTLEMENT FROM ${v.toUpperCase()}`, usdDeposit, addDays(date, 1), `DEP-USD-${code}`, "USD");

    ledger.push(lEur, lGbp); bank.push(bUsd);
    // Multi-currency cross-border batch settlement cannot be deterministically resolved single-currency; honest exception
    truth.push({ bankId: bUsd.id, ledgerIds: [], processorId: null, category: "multi_currency_split" });
    truth.push({ bankId: null, ledgerIds: [lEur.id], processorId: null, category: "multi_currency_split" });
    truth.push({ bankId: null, ledgerIds: [lGbp.id], processorId: null, category: "multi_currency_split" });
  }

  // 8. Unmatchable Suspense Distractors (Phantom bank debits & unallocated wires with zero ledger records)
  for (let i = 0; i < 6; i++) {
    const v1 = INDIAN_VENDORS[i % INDIAN_VENDORS.length]!;
    const v2 = INDIAN_VENDORS[(i + 4) % INDIAN_VENDORS.length]!;
    const amt = 25000 + i * 5000;
    const date = randomDate(rng, BASE, 25);

    // Ledger side cancelled draft
    const l = mkLedger(`${v1} cancelled quote draft ${randInt(rng, 100, 999)}`, amt, date, `QUOTE-${randInt(rng, 1000, 9999)}`);
    ledger.push(l);
    truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "suspense_distractor" });

    // Bank side suspense entry
    const b = mkBank(`UNIDENTIFIED SUSPENSE PHANTOM ENTRY FOR ${v2.toUpperCase()}`, amt, date, `SUSPENSE-${randInt(rng, 1000, 9999)}`);
    bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "suspense_distractor" });
  }

  return { bank, ledger, processor, truth };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "data/adversarial";
  const seed = args.includes("--seed") ? parseInt(args[args.indexOf("--seed") + 1]!, 10) : 2026;
  const doEval = args.includes("--eval");

  const dataset = generateAdversarialDataset(seed);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "bank-statement.json"), JSON.stringify(dataset.bank, null, 2));
  writeFileSync(join(outDir, "internal-ledger.json"), JSON.stringify(dataset.ledger, null, 2));
  writeFileSync(join(outDir, "processor-export.json"), JSON.stringify(dataset.processor, null, 2));

  console.log(`Generated Adversarial Frontier dataset in ${outDir}:`);
  console.log(`- Bank records:      ${dataset.bank.length}`);
  console.log(`- Ledger records:    ${dataset.ledger.length}`);
  console.log(`- Processor records: ${dataset.processor.length}`);
  console.log(`- Ground truth pairs: ${dataset.truth.length}`);

  if (doEval) {
    const allRecords = [...dataset.bank, ...dataset.ledger, ...dataset.processor];
    const t1 = tier1Exact(allRecords);
    const t2 = t1.residual.length
      ? tier2Fuzzy(t1.residual)
      : { outcomes: [] as Outcome[], residual: [] as FinRecord[], candidatePools: new Map() };

    const outcomes = [...t1.outcomes, ...t2.outcomes];
    for (const r of t2.residual) {
      outcomes.push(buildExceptionOutcome(r, t2.candidatePools.get(r.id) ?? [], 2));
    }

    const runResult: RunResult = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 50,
      model: "deterministic-tiers",
      outcomes,
      stats: {
        totalRecords: allRecords.length,
        matched: outcomes.filter((o) => o.status === "matched").length,
        exceptions: outcomes.filter((o) => o.status === "exception").length,
        tier3Calls: 0,
        tier3Tokens: 0,
        tier3CostUsd: 0,
      },
    };

    const groundTruth: GroundTruth = {
      meta: { seed, generatedAt: new Date().toISOString(), counts: {} },
      pairs: dataset.truth,
    };

    const report = scoreRun(groundTruth, runResult, {
      dataset: `adversarial-seed-${seed}`,
      truthOrigin: "in-memory-adversarial-truth",
      resultsFile: "in-memory",
    });

    console.log(`\n=== ADVERSARIAL FRONTIER EVALUATION ===`);
    console.log(`Fitness: ${(report.fitness * 100).toFixed(2)}% | Recall: ${(report.recall * 100).toFixed(2)}% | Precision: ${(report.precision * 100).toFixed(2)}% | FPR: ${(report.falsePositiveRate * 100).toFixed(2)}%`);
    console.log(`Pairs: ${report.correctPairs}/${report.totalPairs} correct, ${report.falsePositives} false positives`);
    console.log(`Honest Exceptions: ${report.byCategory ? Object.values(report.byCategory).reduce((acc, c) => acc + c.honest, 0) : 0}`);
    console.log(`Tiers: T1=${report.tierBreakdown[1] ?? 0} | T2=${report.tierBreakdown[2] ?? 0}`);

    console.log("\nBreakdown by Category:");
    for (const [c, stat] of Object.entries(report.byCategory).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${c.padEnd(28)} pairs=${String(stat.pairs).padStart(2)}  ok=${String(stat.correctPairs).padStart(2)}  fp=${String(stat.falsePos).padStart(2)}  honest=${String(stat.honest).padStart(2)}`);
    }
  }
}


