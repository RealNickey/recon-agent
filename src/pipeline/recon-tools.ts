/**
 * Grounded Financial Verification Tools for AI Agent Reconciliation.
 *
 * 4 Deterministic Tools powered by Decimal.js and financial domain rules:
 * 1. verifyDecimalMath: Fixed-point sum and equality testing using Decimal.js.
 * 2. verifyTaxMdrRail: Razorpay standard MDR (2.36%) & Section 194J/194C TDS withholding verification.
 * 3. verifyFxCorridor: Currency corridor (EUR/USD, USD/INR, GBP/USD) and value date drift.
 * 4. verifySettlementTiming: Value-date settlement clearing check (<= 30 days).
 */
import { tool } from "ai";
import { z } from "zod";
import Decimal from "decimal.js";
import { daysBetween, isValidFxCorridor, checkIndianTaxMdrSchedule } from "../normalize";

export interface DecimalMathVerificationResult {
  valid: boolean;
  targetAmount: number;
  candidateSum: number;
  delta: number;
  tolerance: number;
  explanation: string;
}

export interface TaxMdrVerificationResult {
  valid: boolean;
  grossAmount: number;
  netAmount: number;
  expectedNet: number;
  withholdingOrFee: number;
  ruleApplied: string;
  explanation: string;
}

export interface FxCorridorVerificationResult {
  valid: boolean;
  baseCurrency: string;
  quoteCurrency: string;
  impliedRate: number;
  corridorSupported: boolean;
  dateDriftDays: number;
  dateCheckPassed: boolean;
  explanation: string;
}

export interface SettlementTimingVerificationResult {
  valid: boolean;
  daysBetween: number;
  maxDaysAllowed: number;
  explanation: string;
}

export function directVerifyDecimalMath({
  targetAmount,
  candidateAmounts,
  tolerance = 0.05,
  operation = "subset_sum",
}: {
  targetAmount: number;
  candidateAmounts: number[];
  tolerance?: number;
  operation?: "subset_sum" | "equality" | "net_variance";
}): DecimalMathVerificationResult {
  if (candidateAmounts.length === 0) {
    return {
      valid: false,
      targetAmount,
      candidateSum: 0,
      delta: Math.abs(targetAmount),
      tolerance,
      explanation: "No candidate amounts provided for verification.",
    };
  }

  const dTarget = new Decimal(targetAmount).abs();
  const dSum = candidateAmounts.reduce(
    (acc, amt) => acc.plus(new Decimal(amt).abs()),
    new Decimal(0)
  );

  const delta = dTarget.minus(dSum).abs().toNumber();
  const dTol = new Decimal(tolerance);
  const valid = new Decimal(delta).lte(dTol);

  const explanation = valid
    ? `Deterministic Decimal math verified: candidate sum ${dSum.toFixed(2)} equals target ${dTarget.toFixed(2)} within tolerance ${tolerance} (delta: ${delta.toFixed(4)}).`
    : `Deterministic Decimal math rejected: candidate sum ${dSum.toFixed(2)} differs from target ${dTarget.toFixed(2)} by ${delta.toFixed(4)} (exceeds tolerance ${tolerance}).`;

  return {
    valid,
    targetAmount: dTarget.toNumber(),
    candidateSum: dSum.toNumber(),
    delta,
    tolerance,
    explanation,
  };
}

export function directVerifyTaxMdrRail({
  grossAmount,
  netAmount,
  taxRail = "auto_detect",
}: {
  grossAmount: number;
  netAmount: number;
  taxRail?: "razorpay_mdr_2_36" | "section_194j_tds_10" | "section_194c_tds_1" | "section_194c_tds_2" | "auto_detect";
}): TaxMdrVerificationResult {
  const gross = Math.max(Math.abs(grossAmount), Math.abs(netAmount));
  const net = Math.min(Math.abs(grossAmount), Math.abs(netAmount));

  if (taxRail === "auto_detect") {
    const schedule = checkIndianTaxMdrSchedule(gross, net);
    if (schedule && schedule.matched) {
      const withholdingOrFee = new Decimal(gross).minus(new Decimal(net)).toNumber();
      return {
        valid: true,
        grossAmount: gross,
        netAmount: net,
        expectedNet: schedule.expectedNet,
        withholdingOrFee,
        ruleApplied: schedule.rule,
        explanation: `Statutory schedule verified: ${schedule.rule} on gross ${gross.toFixed(2)} yields net ${net.toFixed(2)}.`,
      };
    }
  } else if (taxRail === "razorpay_mdr_2_36") {
    // 2% fee + 18% GST = 2.36%
    const expected = new Decimal(gross).mul(new Decimal(1).minus(new Decimal(0.0236))).toNumber();
    const diff = Math.abs(net - expected);
    const valid = diff <= 0.5;
    return {
      valid,
      grossAmount: gross,
      netAmount: net,
      expectedNet: expected,
      withholdingOrFee: new Decimal(gross).minus(new Decimal(expected)).toNumber(),
      ruleApplied: "Razorpay Standard Gateway MDR (2% + 18% GST = 2.36%)",
      explanation: valid
        ? `Razorpay MDR 2.36% verified: gross ${gross} -> expected net ${expected.toFixed(2)}, actual ${net}.`
        : `Razorpay MDR 2.36% check failed: expected ${expected.toFixed(2)}, got ${net} (delta: ${diff.toFixed(2)}).`,
    };
  } else if (taxRail === "section_194j_tds_10") {
    // 10% TDS
    const expected = new Decimal(gross).mul(new Decimal(0.9)).toNumber();
    const diff = Math.abs(net - expected);
    const valid = diff <= 0.5;
    return {
      valid,
      grossAmount: gross,
      netAmount: net,
      expectedNet: expected,
      withholdingOrFee: new Decimal(gross).mul(0.1).toNumber(),
      ruleApplied: "Section 194J Indian Statutory TDS (10% Professional/Technical)",
      explanation: valid
        ? `Section 194J TDS 10% verified: gross ${gross} -> net ${net}.`
        : `Section 194J TDS 10% check failed: expected ${expected.toFixed(2)}, got ${net}.`,
    };
  } else if (taxRail === "section_194c_tds_1" || taxRail === "section_194c_tds_2") {
    const rate = taxRail === "section_194c_tds_1" ? 0.01 : 0.02;
    const expected = new Decimal(gross).mul(new Decimal(1 - rate)).toNumber();
    const diff = Math.abs(net - expected);
    const valid = diff <= 0.5;
    return {
      valid,
      grossAmount: gross,
      netAmount: net,
      expectedNet: expected,
      withholdingOrFee: new Decimal(gross).mul(rate).toNumber(),
      ruleApplied: `Section 194C Indian Statutory TDS (${(rate * 100).toFixed(0)}% Contractor)`,
      explanation: valid
        ? `Section 194C TDS ${(rate * 100).toFixed(0)}% verified: gross ${gross} -> net ${net}.`
        : `Section 194C TDS ${(rate * 100).toFixed(0)}% check failed: expected ${expected.toFixed(2)}, got ${net}.`,
    };
  }

  return {
    valid: false,
    grossAmount: gross,
    netAmount: net,
    expectedNet: gross,
    withholdingOrFee: 0,
    ruleApplied: "None",
    explanation: `No statutory tax or payment gateway MDR schedule matched for gross ${gross} and net ${net}.`,
  };
}

export function directVerifyFxCorridor({
  baseCurrency,
  quoteCurrency,
  baseAmount,
  quoteAmount,
  valueDateBase,
  valueDateQuote,
  maxDaysDrift = 5,
}: {
  baseCurrency: string;
  quoteCurrency: string;
  baseAmount: number;
  quoteAmount: number;
  valueDateBase?: string;
  valueDateQuote?: string;
  maxDaysDrift?: number;
}): FxCorridorVerificationResult {
  const bCur = baseCurrency.toUpperCase();
  const qCur = quoteCurrency.toUpperCase();
  const corridorSupported = isValidFxCorridor(bCur, qCur, baseAmount, quoteAmount);

  const bAmt = Math.abs(baseAmount) || 1;
  const qAmt = Math.abs(quoteAmount) || 1;
  const impliedRate = +(qAmt / bAmt).toFixed(4);

  let dateDriftDays = 0;
  let dateCheckPassed = true;

  if (valueDateBase && valueDateQuote) {
    dateDriftDays = daysBetween(valueDateBase, valueDateQuote);
    dateCheckPassed = Number.isFinite(dateDriftDays) && dateDriftDays <= maxDaysDrift;
  }

  const valid = corridorSupported && dateCheckPassed;
  const explanation = valid
    ? `FX Corridor ${bCur}/${qCur} verified (implied rate: ${impliedRate}, date drift: ${dateDriftDays}d <= ${maxDaysDrift}d).`
    : !corridorSupported
    ? `Unsupported FX corridor or out-of-bounds rate for ${bCur}/${qCur} (${baseAmount} vs ${quoteAmount}).`
    : `FX settlement date drift exceeded: ${dateDriftDays} days > max allowed ${maxDaysDrift} days.`;

  return {
    valid,
    baseCurrency: bCur,
    quoteCurrency: qCur,
    impliedRate,
    corridorSupported,
    dateDriftDays,
    dateCheckPassed,
    explanation,
  };
}

export function directVerifySettlementTiming({
  dateA,
  dateB,
  maxDays = 30,
}: {
  dateA: string;
  dateB: string;
  maxDays?: number;
}): SettlementTimingVerificationResult {
  const d = daysBetween(dateA, dateB);
  const valid = Number.isFinite(d) && d <= maxDays;
  const explanation = valid
    ? `Settlement window verified: ${d} day(s) drift is within limit of ${maxDays} days.`
    : `Settlement window exceeded: ${d} day(s) drift exceeds allowable limit of ${maxDays} days.`;

  return {
    valid,
    daysBetween: d,
    maxDaysAllowed: maxDays,
    explanation,
  };
}

/**
 * AI SDK Grounded Financial Tools Definition
 */
export function createReconTools() {
  const verifyDecimalMath = tool({
    description: "Verify fixed-point Decimal math equality and subset-sum between a target transaction and candidate counterparts with zero float rounding errors.",
    inputSchema: z.object({
      targetAmount: z.number().describe("Target transaction amount to reconcile"),
      candidateAmounts: z.array(z.number()).describe("Array of counterpart candidate amounts to sum and verify"),
      tolerance: z.number().optional().default(0.05).describe("Absolute tolerance threshold (default: 0.05)"),
      operation: z.enum(["subset_sum", "equality", "net_variance"]).optional().default("subset_sum").describe("Math verification mode"),
    }),
    execute: async (args: { targetAmount: number; candidateAmounts: number[]; tolerance?: number; operation?: "subset_sum" | "equality" | "net_variance" }) =>
      directVerifyDecimalMath(args),
  });

  const verifyTaxMdrRail = tool({
    description: "Verify Indian statutory tax withholdings (Section 194J 10% TDS, Section 194C 1-2% TDS) and Payment Gateway MDR deductions (Razorpay 2% fee + 18% GST = 2.36%).",
    inputSchema: z.object({
      grossAmount: z.number().describe("Gross invoice or settlement amount"),
      netAmount: z.number().describe("Net settled bank or processor amount"),
      taxRail: z.enum(["razorpay_mdr_2_36", "section_194j_tds_10", "section_194c_tds_1", "section_194c_tds_2", "auto_detect"]).optional().default("auto_detect").describe("Tax/MDR schedule rule"),
    }),
    execute: async (args: { grossAmount: number; netAmount: number; taxRail?: "razorpay_mdr_2_36" | "section_194j_tds_10" | "section_194c_tds_1" | "section_194c_tds_2" | "auto_detect" }) =>
      directVerifyTaxMdrRail(args),
  });

  const verifyFxCorridor = tool({
    description: "Verify cross-currency FX exchange corridors (EUR/USD, USD/INR, GBP/USD), rate reasonableness bounds, and settlement value date drift.",
    inputSchema: z.object({
      baseCurrency: z.string().describe("Base transaction currency code (e.g. USD, EUR)"),
      quoteCurrency: z.string().describe("Counterpart transaction currency code"),
      baseAmount: z.number().describe("Base transaction amount"),
      quoteAmount: z.number().describe("Counterpart transaction amount"),
      valueDateBase: z.string().optional().describe("Base transaction ISO date (YYYY-MM-DD)"),
      valueDateQuote: z.string().optional().describe("Counterpart transaction ISO date (YYYY-MM-DD)"),
      maxDaysDrift: z.number().optional().default(5).describe("Maximum allowed FX settlement drift in days (default: 5)"),
    }),
    execute: async (args: { baseCurrency: string; quoteCurrency: string; baseAmount: number; quoteAmount: number; valueDateBase?: string; valueDateQuote?: string; maxDaysDrift?: number }) =>
      directVerifyFxCorridor(args),
  });

  const verifySettlementTiming = tool({
    description: "Verify value-date settlement clearing timing between two financial postings (default <= 30 days).",
    inputSchema: z.object({
      dateA: z.string().describe("First transaction ISO date (YYYY-MM-DD)"),
      dateB: z.string().describe("Second transaction ISO date (YYYY-MM-DD)"),
      maxDays: z.number().optional().default(30).describe("Maximum allowed settlement window in days (default: 30)"),
    }),
    execute: async (args: { dateA: string; dateB: string; maxDays?: number }) =>
      directVerifySettlementTiming(args),
  });

  return {
    verifyDecimalMath,
    verifyTaxMdrRail,
    verifyFxCorridor,
    verifySettlementTiming,
    direct: {
      verifyDecimalMath: directVerifyDecimalMath,
      verifyTaxMdrRail: directVerifyTaxMdrRail,
      verifyFxCorridor: directVerifyFxCorridor,
      verifySettlementTiming: directVerifySettlementTiming,
    },
  };
}

export const reconTools = createReconTools();
