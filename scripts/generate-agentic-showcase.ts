/**
 * Generates the AI Agent Showcase Challenge Dataset.
 *
 * This dataset features messy real-world remittance narratives, entity aliases,
 * multi-invoice batch wire memos, compound Razorpay MDR + Section 194J TDS deductions,
 * and cross-currency FX treasury postings.
 *
 * Usage: bun run scripts/generate-agentic-showcase.ts [--out data/agent-showcase]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FinRecord } from "../src/types";

export function generateAgentShowcaseDataset(outDir = "data/agent-showcase") {
  mkdirSync(outDir, { recursive: true });

  const bank: FinRecord[] = [
    // 1. Natural Language Memo & Alias (Acme Corp -> Acme Systems International)
    {
      id: "B-SHOWCASE-101",
      source: "bank",
      date: "2026-06-15",
      amount: 14500.0,
      currency: "USD",
      description: "FedWire credit from Acme Systems International for cloud infrastructure PO-ACME-8841",
      reference: "FEDWIRE-TX-990142",
    },
    // 2. Multi-Invoice Many-to-One Batch Wire Remittance
    {
      id: "B-SHOWCASE-102",
      source: "bank",
      date: "2026-06-18",
      amount: 8750.0,
      currency: "USD",
      description: "Globex Corporation batch settlement wire covering invoices INV-GBX-101 and INV-GBX-102",
      reference: "WIRE-BATCH-4412",
    },
    // 3. Indian Payment Gateway Settlement with Compound MDR (2.36%) & Section 194J TDS (10%)
    {
      id: "B-SHOWCASE-103",
      source: "bank",
      date: "2026-06-20",
      amount: 438200.0,
      currency: "INR",
      description: "HDFC Nodal Settl Stark Tech Consulting net 10% TDS & 2.36% gateway fee ST-9910",
      reference: "UTR-HDFC-9910842",
    },
    // 4. Cross-Currency FX Treasury Remittance with Implied Rate Memo
    {
      id: "B-SHOWCASE-104",
      source: "bank",
      date: "2026-06-22",
      amount: 10850.0,
      currency: "USD",
      description: "International wire credit Tyrell Robotics Corp for EUR invoice TYR-4412 at 1.085 FX rate",
      reference: "SWIFT-EUR-10850",
    },
    // 5. Vendor Name Typo & Date Lag
    {
      id: "B-SHOWCASE-105",
      source: "bank",
      date: "2026-06-25",
      amount: 6200.0,
      currency: "USD",
      description: "ACH payment from Wayn Enterprizes for Q2 security consulting WYN-3301",
      reference: "ACH-WYN-3301",
    },
    // 6. Split Deposit Part 1
    {
      id: "B-SHOWCASE-106",
      source: "bank",
      date: "2026-06-26",
      amount: 3000.0,
      currency: "USD",
      description: "Initech LLC partial wire tranche 1 for project delta INI-7711",
      reference: "WIRE-INI-7711-A",
    },
    // 7. Split Deposit Part 2
    {
      id: "B-SHOWCASE-107",
      source: "bank",
      date: "2026-06-27",
      amount: 2000.0,
      currency: "USD",
      description: "Initech LLC partial wire tranche 2 final settlement INI-7711",
      reference: "WIRE-INI-7711-B",
    },
    // 8. Genuine Unmatchable Distractor 1 (Unidentified Bank Credit - Suspense Candidate)
    {
      id: "B-SHOWCASE-901",
      source: "bank",
      date: "2026-06-28",
      amount: 9940.0,
      currency: "USD",
      description: "Direct wire credit unknown originator ref missing - unallocated funds",
      reference: "SUSPENSE-WIRE-9940",
    },
    // 9. Genuine Unmatchable Distractor 2 (Bank Service Fee)
    {
      id: "B-SHOWCASE-902",
      source: "bank",
      date: "2026-06-30",
      amount: 150.0,
      currency: "USD",
      description: "Monthly treasury wire clearing and account maintenance charge",
      reference: "BANK-FEE-JUN26",
    },
  ];

  const ledger: FinRecord[] = [
    // Counterpart 1: Acme Corp
    {
      id: "L-SHOWCASE-101",
      source: "ledger",
      date: "2026-06-14",
      amount: 14500.0,
      currency: "USD",
      description: "Acme Corp Cloud Infrastructure Hosting Retainer",
      reference: "PO-ACME-8841",
    },
    // Counterpart 2A: Globex Inv 1
    {
      id: "L-SHOWCASE-102A",
      source: "ledger",
      date: "2026-06-16",
      amount: 5000.0,
      currency: "USD",
      description: "Globex Ltd Enterprise Software License June",
      reference: "INV-GBX-101",
    },
    // Counterpart 2B: Globex Inv 2
    {
      id: "L-SHOWCASE-102B",
      source: "ledger",
      date: "2026-06-17",
      amount: 3750.0,
      currency: "USD",
      description: "Globex Ltd Onsite Implementation Services",
      reference: "INV-GBX-102",
    },
    // Counterpart 3: Stark Industries Gross Invoice
    {
      id: "L-SHOWCASE-103",
      source: "ledger",
      date: "2026-06-19",
      amount: 500000.0,
      currency: "INR",
      description: "Stark Industries Engineering Consulting Contract",
      reference: "ST-9910",
    },
    // Counterpart 4: Tyrell Corp Base Invoice in EUR
    {
      id: "L-SHOWCASE-104",
      source: "ledger",
      date: "2026-06-21",
      amount: 10000.0,
      currency: "EUR",
      description: "Tyrell Corp AI Robotics Subsystem Deliverable",
      reference: "TYR-4412",
    },
    // Counterpart 5: Wayne Enterprises
    {
      id: "L-SHOWCASE-105",
      source: "ledger",
      date: "2026-06-23",
      amount: 6200.0,
      currency: "USD",
      description: "Wayne Enterprises Cyber Security Assessment Q2",
      reference: "WYN-3301",
    },
    // Counterpart 6: Initech Single Master Invoice for $5000
    {
      id: "L-SHOWCASE-106",
      source: "ledger",
      date: "2026-06-24",
      amount: 5000.0,
      currency: "USD",
      description: "Initech LLC Full-Stack Application Upgrade",
      reference: "INI-7711",
    },
    // Distractor 3: Unapproved Draft Memo in Ledger
    {
      id: "L-SHOWCASE-903",
      source: "ledger",
      date: "2026-06-29",
      amount: 18450.0,
      currency: "USD",
      description: "Draft Pending Approval - Unverified Vendor Memo",
      reference: "DRAFT-MEMO-99",
    },
  ];

  const processor: FinRecord[] = [
    // Processor Capture for Stark Tech (Net of 2.36% MDR)
    {
      id: "P-SHOWCASE-103",
      source: "processor",
      date: "2026-06-19",
      amount: 488200.0,
      currency: "INR",
      description: "Razorpay Standard Gateway Capture ST-9910 net 2.36% MDR",
      reference: "pay_stark_9910",
    },
    // Processor Charge for Acme Corp
    {
      id: "P-SHOWCASE-101",
      source: "processor",
      date: "2026-06-14",
      amount: 14500.0,
      currency: "USD",
      description: "Stripe Enterprise Wire Transfer Acme PO-ACME-8841",
      reference: "ch_acme_8841",
    },
  ];

  writeFileSync(join(outDir, "bank-statement.json"), JSON.stringify(bank, null, 2));
  writeFileSync(join(outDir, "internal-ledger.json"), JSON.stringify(ledger, null, 2));
  writeFileSync(join(outDir, "processor-export.json"), JSON.stringify(processor, null, 2));

  console.log(`✅ Generated Agent Showcase Challenge Dataset in ${outDir}:`);
  console.log(`   - Bank: ${bank.length} records`);
  console.log(`   - Ledger: ${ledger.length} records`);
  console.log(`   - Processor: ${processor.length} records`);
  console.log(`   - Total Transactions: ${bank.length + ledger.length + processor.length}`);
}

if (import.meta.main) {
  const outDir = process.argv[2] || "data/agent-showcase";
  generateAgentShowcaseDataset(outDir);
}
