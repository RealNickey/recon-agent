/**
 * Adversarial & Complex Scenario Generator for Recon Agent.
 * Generates frontier financial operations and settlement scenarios:
 * 1. Razorpay Multi-Leg Settlement (Gross Ledger → Processor Capture → Compound MDR/TDS Deductions → Net Bank Payout)
 * 2. Partial Refund & Chargeback Chains (Original Sale → Partial Refund → Dispute Reversal)
 * 3. Expanded Cross-Currency FX Corridors with Bid-Ask Spreads (EUR/USD, GBP/USD, USD/INR, EUR/INR)
 * 4. Extended Value-Date Timing Drift (up to 30 days with UPI VPAs, IMPS RRNs, Bank UTRs)
 * 5. Coincidental Amount & Ambiguous Vendor Distractors (same-amount, same-date noise records)
 *
 * Usage: bun run scripts/generate-adversarial.ts [--seed N] [--out DIR] [--eval]
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, randInt, pick, randomDate, addDays, round2, shuffle } from "../src/util";
import type { FinRecord, GroundTruth, RunResult, Outcome } from "../src/types";
import { tier1Exact } from "../src/pipeline/tier1-exact";
import { tier2Fuzzy } from "../src/pipeline/tier2-fuzzy";
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

  // 3. Expanded Cross-Currency FX Corridors with Bid-Ask Spreads: EUR/USD, GBP/USD, USD/INR, EUR/INR
  for (let i = 0; i < 6; i++) {
    const v = pick(GLOBAL_VENDORS, rng);
    const date = randomDate(rng, BASE, 20);
    const code = `${randInt(rng, 10000, 99999)}`;

    if (i % 4 === 0) {
      // USD -> INR (corridor 75 - 95 INR/USD)
      const usd = randInt(rng, 1000, 5000);
      const effectiveRate = 83.5 + (rng() - 0.5) * 4.0; // 81.5 - 85.5
      const inr = round2(usd * effectiveRate);
      const l = mkLedger(`${v} cloud software license`, usd, date, `INV-US-${code}`, "USD");
      const b = mkBank(`INWARD REMITTANCE FOR ${v.toUpperCase()}`, inr, addDays(date, 2), `FX-INR-${code}`, "INR");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else if (i % 4 === 1) {
      // EUR -> INR (corridor 80 - 105 INR/EUR)
      const eur = randInt(rng, 1000, 4000);
      const effectiveRate = 90.0 + (rng() - 0.5) * 5.0; // 87.5 - 92.5
      const inr = round2(eur * effectiveRate);
      const l = mkLedger(`${v} design consulting retainer`, eur, date, `INV-EU-${code}`, "EUR");
      const b = mkBank(`INWARD SEPA SETTLEMENT ${v.toUpperCase()}`, inr, addDays(date, 2), `FX-EUR-${code}`, "INR");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else if (i % 4 === 2) {
      // GBP -> USD (corridor 1.15 - 1.45 USD/GBP)
      const gbp = randInt(rng, 2000, 8000);
      const effectiveRate = 1.28 + (rng() - 0.5) * 0.08;
      const usd = round2(gbp * effectiveRate);
      const l = mkLedger(`${v} UK subsidiary engineering services`, gbp, date, `INV-UK-${code}`, "GBP");
      const b = mkBank(`WIRE FROM ${v.toUpperCase()} UK`, usd, addDays(date, 1), `WIRE-USD-${code}`, "USD");
      ledger.push(l); bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "currency_fx" });
    } else {
      // EUR -> USD (corridor 0.85 - 1.25 USD/EUR)
      const usd = randInt(rng, 3000, 10000);
      const rate = 0.92 + (rng() - 0.5) * 0.06;
      const eur = round2(usd * rate);
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

  // 5. Coincidental Amount & Ambiguous Vendor Distractors (Engineered to provoke false positives)
  for (let i = 0; i < 8; i++) {
    const v1 = INDIAN_VENDORS[i % INDIAN_VENDORS.length]!;
    const v2 = INDIAN_VENDORS[(i + 4) % INDIAN_VENDORS.length]!;
    const amt = 25000 + i * 5000; // identical coincidental amounts
    const date = randomDate(rng, BASE, 25);

    // Ledger side distractor
    const l = mkLedger(`${v1} cancelled quote draft ${randInt(rng, 100, 999)}`, amt, date, `QUOTE-${randInt(rng, 1000, 9999)}`);
    ledger.push(l);
    truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "unmatchable" });

    // Bank side distractor from completely different vendor
    const b = mkBank(`UNIDENTIFIED SUSPENSE ENTRY FOR ${v2.toUpperCase()}`, amt, date, `SUSPENSE-${randInt(rng, 1000, 9999)}`);
    bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "unmatchable" });
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
      outcomes.push({
        status: "exception",
        recordId: r.id,
        source: r.source,
        reasonCode: "no_candidate_found",
        tier: 2,
        candidatesConsidered: (t2.candidatePools.get(r.id) ?? []).length,
        reasoning: "adversarial evaluation residual",
      });
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
    console.log(`Tiers: T1=${report.tierBreakdown[1] ?? 0} | T2=${report.tierBreakdown[2] ?? 0}`);
  }
}

