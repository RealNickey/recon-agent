/**
 * Adversarial & Complex Scenario Generator for Recon Agent.
 * Generates edge-cases that specifically test Agentic LLM reasoning (Tier 3)
 * where deterministic regex and static heuristic rules fail.
 *
 * Usage: bun run scripts/generate-adversarial.ts [--seed N] [--out DIR]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, randInt, pick, randomDate, addDays, round2, resolveExternalTruthPath } from "../src/util";
import type { FinRecord, GroundTruth } from "../src/types";

const VENDORS = [
  "Razorpay Software Pvt Ltd", "Zoho Technologies", "Freshworks Inc", "Swiggy Bundl",
  "Zomato Media", "Flipkart Internet", "Infosys Limited", "TCS Digital",
  "Wipro Enterprise", "Paytm Payments Bank", "PhonePe Pvt Ltd", "CRED Dreamplug"
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

  // 1. Natural Language Free-Text Memo (No structured invoice tokens)
  for (let i = 0; i < 8; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 10000, 85000);
    const date = randomDate(rng, BASE, 20);
    const l = mkLedger(`${v} — full payment for technical cloud architecture consulting retainer`, amt, date, `MEMO-${randInt(rng, 1000, 9999)}`);
    const b = mkBank(`NEFT CR ${v.toUpperCase()} CLOUD RETAINER ADVISORY SETTLEMENT`, amt, addDays(date, 2), `BANK-REF-${randInt(rng, 10000, 99999)}`);
    ledger.push(l); bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: null, category: "benchrec_real" as any });
  }

  // 2. Complex Multi-Source Payout with Razorpay Gateway MDR (2.36% deduction) + Processor Export
  for (let i = 0; i < 6; i++) {
    const v = pick(VENDORS, rng);
    const gross = randInt(rng, 50000, 250000);
    const net = round2(gross * 0.9764); // 2% MDR + 18% GST
    const fee = round2(gross * 0.0236);
    const date = randomDate(rng, BASE, 20);
    const orderId = `order_${randInt(rng, 100000, 999999)}`;
    const paymentId = `pay_${randInt(rng, 100000, 999999)}`;
    
    const l = mkLedger(`${v} customer checkout sale gross`, gross, date, orderId);
    const p = mkProc(`Razorpay Captured Payment fee ₹${fee}`, gross, date, paymentId);
    const b = mkBank(`RAZORPAY NODAL SETTLEMENT NET FOR ${v.toUpperCase()}`, net, addDays(date, 1), `RZP-SETTLE-${randInt(rng, 1000, 9999)}`);
    
    ledger.push(l); processor.push(p); bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: [l.id], processorId: p.id, category: "amount_variance" });
  }

  // 3. Multi-invoice batch with descriptive consolidated narrative
  for (let i = 0; i < 4; i++) {
    const v = pick(VENDORS, rng);
    const date = randomDate(rng, BASE, 15);
    const parts = [randInt(rng, 5000, 20000), randInt(rng, 10000, 30000), randInt(rng, 8000, 25000)];
    const ledgers: FinRecord[] = [];
    for (let j = 0; j < parts.length; j++) {
      const l = mkLedger(`${v} Phase ${j + 1} milestone payment`, parts[j]!, date, `TASK-${randInt(rng, 100, 999)}`);
      ledgers.push(l);
      ledger.push(l);
    }
    const total = round2(parts.reduce((a, b) => a + b, 0));
    const b = mkBank(`CONSOLIDATED RTGS WIRE FOR ALL 3 MILESTONES — ${v.toUpperCase()}`, total, addDays(date, 3), `RTGS-${randInt(rng, 10000, 99999)}`);
    bank.push(b);
    truth.push({ bankId: b.id, ledgerIds: ledgers.map(l => l.id), processorId: null, category: "many_to_one" });
  }

  // 4. Honest Unmatchable Distractors
  for (let i = 0; i < 10; i++) {
    const v = pick(VENDORS, rng);
    const amt = randInt(rng, 5000, 60000);
    const date = randomDate(rng, BASE, 25);
    if (i % 2 === 0) {
      const l = mkLedger(`${v} cancelled pending quote`, amt, date, `QUOTE-${randInt(rng, 1000, 9999)}`);
      ledger.push(l);
      truth.push({ bankId: null, ledgerIds: [l.id], processorId: null, category: "unmatchable" });
    } else {
      const b = mkBank(`UNIDENTIFIED SUSPENSE DEPOSIT FROM UNKNOWN ENTITY`, amt, date, `SUSPENSE-${randInt(rng, 1000, 9999)}`);
      bank.push(b);
      truth.push({ bankId: b.id, ledgerIds: [], processorId: null, category: "unmatchable" });
    }
  }

  return { bank, ledger, processor, truth };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "data/adversarial";
  const seed = args.includes("--seed") ? parseInt(args[args.indexOf("--seed") + 1]!, 10) : 2026;

  const dataset = generateAdversarialDataset(seed);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "bank-statement.json"), JSON.stringify(dataset.bank, null, 2));
  writeFileSync(join(outDir, "internal-ledger.json"), JSON.stringify(dataset.ledger, null, 2));
  writeFileSync(join(outDir, "processor-export.json"), JSON.stringify(dataset.processor, null, 2));

  console.log(`Generated Adversarial dataset in ${outDir}:`);
  console.log(`- Bank records:      ${dataset.bank.length}`);
  console.log(`- Ledger records:    ${dataset.ledger.length}`);
  console.log(`- Processor records: ${dataset.processor.length}`);
  console.log(`- Ground truth pairs: ${dataset.truth.length}`);
}
