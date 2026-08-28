import Decimal from "decimal.js";
import { distance } from "fastest-levenshtein";

/** Normalize a reference/ID: uppercase, strip non-alphanumerics, drop common prefixes. */
export function normalizeRef(raw: string): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const p of ["INV", "PMT", "PAY", "REF", "TRX", "TXN", "BANK", "DEP", "WIRE", "BATCH"]) {
    if (s.startsWith(p) && s.length > p.length + 2) {
      s = s.slice(p.length);
      break;
    }
  }
  return s.replace(/^0+(?=\d)/, "");
}

const GENERIC_REF_STOPWORDS = new Set([
  "WIRE", "TRANSFER", "PAYMENT", "DEP", "DEPOSIT", "TXN", "TRX", "ACH", "POS", "REF", "RET",
  "PO", "INV", "CHECK", "DEBIT", "CREDIT", "BATCH", "SETTLE", "SETTLEMENT", "UNKNOWN", "MISC", "FEES", "FEE"
]);

/**
 * Stable invoice identity: digit core, ignoring trailing amendment letters
 * (INV-96034-A → 96034) and common prefixes. Rejects generic keywords without numeric tokens.
 */
export function invoiceToken(raw: string): string {
  const n = normalizeRef(raw);
  if (GENERIC_REF_STOPWORDS.has(n)) return "";
  const core = n.replace(/[A-Z]+$/g, "");
  if (core.length >= 3 && /\d/.test(core)) return core;
  const digits = n.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  if (digits.length >= 3) return digits;
  if (n.length >= 4 && !GENERIC_REF_STOPWORDS.has(n) && /\d/.test(n)) return n;
  return "";
}

export function sameInvoice(a: string, b: string): boolean {
  const ta = invoiceToken(a);
  const tb = invoiceToken(b);
  return ta.length > 0 && ta === tb;
}

/**
 * Extract candidate invoice / PO / payment rail reference tokens from a record's reference and description.
 * Finds patterns like INV-12345, PO#937478, PO-937478, WIRE-1234, UPI VPAs, UTR numbers, IMPS RRNs,
 * order_XXXX, pay_XXXX, refund credit notes, and dispute/chargeback identifiers.
 */
export function extractRefTokens(ref: string, desc: string): Set<string> {
  const tokens = new Set<string>();
  const t = invoiceToken(ref);
  if (t && t.length >= 3 && /\d/.test(t)) tokens.add(t);

  const poRefMatch = ref.match(/^PO[\-#\s]?([0-9]{3,})/i);
  if (poRefMatch?.[1]) {
    tokens.add(poRefMatch[1].replace(/^0+(?=\d)/, ""));
  }

  // Check for UPI VPA in ref or desc (e.g. user@okhdfcbank, merchant@upi, order123@razorpay)
  const vpaMatch = `${ref} ${desc}`.match(/\b([a-zA-Z0-9.\-_]{3,}@[a-zA-Z]{3,})\b/);
  if (vpaMatch?.[1]) {
    tokens.add(vpaMatch[1].toLowerCase());
  }

  // Check for Indian Bank UTR (NEFT/RTGS 16-22 chars e.g. HDFCR52026060100012)
  const utrMatch = `${ref} ${desc}`.match(/\b([A-Z]{4}[RNC]\d{11,17})\b/i);
  if (utrMatch?.[1]) {
    tokens.add(utrMatch[1].toUpperCase());
  }

  // Check for 12-digit IMPS RRN
  const impsMatch = `${ref} ${desc}`.match(/\b(?:RRN|IMPS)[\-#\s:]*([0-9]{12})\b/i);
  if (impsMatch?.[1]) {
    tokens.add(impsMatch[1]);
  }

  // Check for Razorpay/Payment Gateway order_XXXX or pay_XXXX identifiers
  const orderMatches = `${ref} ${desc}`.matchAll(/\b(order_[a-zA-Z0-9]{5,}|pay_[a-zA-Z0-9]{5,})\b/gi);
  for (const om of orderMatches) {
    if (om[1]) tokens.add(om[1].toLowerCase());
  }

  // Check for Refund / Credit Note / Dispute / Chargeback tokens (e.g. REFUND-12345, CN-12345, CB-12345)
  const refundMatches = `${ref} ${desc}`.matchAll(/\b(?:REFUND|CN|CR|DISPUTE|CB|REV)[\-#\s:]*([0-9]{3,})\b/gi);
  for (const rm of refundMatches) {
    if (rm[1]) {
      const core = rm[1].replace(/^0+(?=\d)/, "");
      if (core.length >= 3) tokens.add(core);
    }
  }

  if (desc.toLowerCase().includes("installment") || desc.toLowerCase().includes("split")) {
    return tokens;
  }

  const text = `${ref} ${desc}`;
  const matches = text.matchAll(/\b(?:PO|INV|INVOICE|TASK|MEMO)[#\-\s:]*([0-9]{3,})\b/gi);
  for (const m of matches) {
    if (m[1]) {
      const core = m[1].replace(/^0+(?=\d)/, "");
      if (core.length >= 3) tokens.add(core);
    }
  }
  return tokens;
}

/**
 * Checks if a bank amount represents a known Indian Tax / Payment Gateway fee schedule:
 * 1. Razorpay/Gateway standard MDR: 2% fee + 18% GST on fee = 2.36% total deduction (Net = Gross * 0.9764)
 * 2. Section 194J TDS (10% professional services withholding): Net = Gross * 0.90
 * 3. Section 194C TDS (1% / 2% contractor withholding): Net = Gross * 0.99 or 0.98
 * 4. Compound Multi-Leg Deductions:
 *    - Razorpay MDR (2.36%) + Section 194J TDS (10%) = 12.36% deduction (Net = Gross * 0.8764)
 *    - Razorpay MDR (2.36%) + Section 194C TDS (2%) = 4.36% deduction (Net = Gross * 0.9564)
 *    - Razorpay MDR (2.36%) + Section 194C TDS (1%) = 3.36% deduction (Net = Gross * 0.9664)
 */
export function checkIndianTaxMdrSchedule(gross: number, net: number): {
  matched: boolean;
  rule: string;
  expectedNet: number;
  ratePct: number;
} | null {
  const g = new Decimal(gross).abs();
  const n = new Decimal(net).abs();
  if (g.isZero() || n.isZero() || n.gte(g)) return null;

  const schedules = [
    { rule: "Razorpay Standard MDR (2% + 18% GST = 2.36%)", rate: 0.0236 },
    { rule: "Compound Razorpay MDR (2.36%) + Section 194J TDS (10%) = 12.36%", rate: 0.1236 },
    { rule: "Compound Razorpay MDR (2.36%) + Section 194C TDS (2%) = 4.36%", rate: 0.0436 },
    { rule: "Compound Razorpay MDR (2.36%) + Section 194C TDS (1%) = 3.36%", rate: 0.0336 },
    { rule: "Section 194J TDS (10% Professional Withholding)", rate: 0.10 },
    { rule: "Section 194C TDS (2% Corporate Contractor)", rate: 0.02 },
    { rule: "Section 194C TDS (1% Individual Contractor)", rate: 0.01 },
    { rule: "Standard 2% Gateway MDR (0% GST)", rate: 0.02 },
    { rule: "International Card Fee (3% + 18% GST = 3.54%)", rate: 0.0354 },
  ];

  for (const s of schedules) {
    const expected = g.times(new Decimal(1).minus(s.rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (expected.minus(n).abs().lte(0.10)) {
      return {
        matched: true,
        rule: s.rule,
        expectedNet: expected.toNumber(),
        ratePct: +(s.rate * 100).toFixed(2),
      };
    }
  }
  return null;
}

/**
 * Validates cross-currency FX corridors with realistic market bid-ask bounds:
 * - EUR/USD & GBP/USD
 * - USD/INR (70 - 100 INR/USD)
 * - EUR/INR (75 - 115 INR/EUR)
 * - GBP/INR (90 - 135 INR/GBP)
 * - CAD/USD, AUD/USD, SGD/USD, JPY/USD
 */
export function isValidFxCorridor(curA: string, curB: string, amtA: number, amtB: number): boolean {
  if (curA === curB) return false;
  const da = Math.abs(amtA);
  const db = Math.abs(amtB);
  if (da === 0 || db === 0) return false;

  const pairKey = [curA, curB].sort().join("/");

  if (pairKey === "EUR/USD" || pairKey === "GBP/USD" || pairKey === "EUR/GBP") {
    const r = Math.min(da, db) / Math.max(da, db);
    return r >= 0.65 && r <= 1.35;
  }

  if (pairKey === "INR/USD") {
    const usd = curA === "USD" ? da : db;
    const inr = curA === "INR" ? da : db;
    if (usd === 0) return false;
    const rate = inr / usd;
    return rate >= 70 && rate <= 100;
  }

  if (pairKey === "EUR/INR") {
    const eur = curA === "EUR" ? da : db;
    const inr = curA === "INR" ? da : db;
    if (eur === 0) return false;
    const rate = inr / eur;
    return rate >= 75 && rate <= 115;
  }

  if (pairKey === "GBP/INR") {
    const gbp = curA === "GBP" ? da : db;
    const inr = curA === "INR" ? da : db;
    if (gbp === 0) return false;
    const rate = inr / gbp;
    return rate >= 90 && rate <= 135;
  }

  if (pairKey === "CAD/USD" || pairKey === "AUD/USD" || pairKey === "SGD/USD") {
    const r = Math.min(da, db) / Math.max(da, db);
    return r >= 0.55 && r <= 1.70;
  }

  if (pairKey === "JPY/USD") {
    const usd = curA === "USD" ? da : db;
    const jpy = curA === "JPY" ? da : db;
    if (usd === 0) return false;
    const rate = jpy / usd;
    return rate >= 100 && rate <= 180;
  }

  return false;
}

export function recordsShareInvoice(
  a: { reference: string; description: string },
  b: { reference: string; description: string }
): boolean {
  if (sameInvoice(a.reference, b.reference)) return true;
  const aTokens = extractRefTokens(a.reference, a.description);
  const bTokens = extractRefTokens(b.reference, b.description);
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  for (const t of aTokens) {
    if (bTokens.has(t)) return true;
  }
  return false;
}

/** Canonical 2-decimal amount key via Decimal, never Number.toFixed. */
export function amountKey(amount: number | string): string {
  return new Decimal(amount).toFixed(2);
}

/** Decimal-safe amount equality within tolerance. */
export function amountsClose(a: number | string, b: number | string, absTol = 0.05, pctTol = 0): boolean {
  const da = new Decimal(a);
  const db = new Decimal(b);
  const diff = da.minus(db).abs();
  if (diff.lte(absTol)) return true;
  if (pctTol > 0 && !db.isZero()) return diff.div(db.abs()).lte(pctTol);
  return false;
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + "T00:00:00Z");
  const b = Date.parse(bISO + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round(Math.abs(a - b) / 86400000);
}

/** Normalized Levenshtein similarity in [0,1]. */
export function stringSim(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x.length || !y.length) return 0;
  const d = distance(x, y);
  return 1 - d / Math.max(x.length, y.length);
}

/** Token-set overlap (Jaccard) — robust to word reordering in descriptions. */
export function tokenSim(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2));
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const VENDOR_STOP = new Set([
  "invoice", "inv", "payment", "pmt", "batch", "the", "for", "and", "inc", "ltd", "llc", "corp", "co", "pvt",
  "debit", "credit", "transfer", "wire", "ach", "pos", "card", "refund", "reversal", "net", "nodal",
  "txn", "trx", "ref", "ret", "retainer", "milestone", "project", "unallocated",
  "deposit", "settle", "settlement", "overseas", "consulting", "services", "monthly", "bill",
]);

export function vendorTokens(desc: string): string[] {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !VENDOR_STOP.has(t) && !/^\d+$/.test(t));
}

export function vendorOverlap(a: string, b: string): number {
  const A = new Set(vendorTokens(a));
  const B = new Set(vendorTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function isUnmatchableNoise(r: { reference: string; description: string }): boolean {
  const d = (r.description + " " + r.reference).toLowerCase();
  return /\b(uncollected|unallocated|cancelled|canceled|void|suspense|unidentified)\b/.test(d) || /\b(draft\s+quote|pending\s+quote)\b/.test(d);
}

/**
 * Subset-sum for small n. Returns one subset (k>=2) whose amounts sum to
 * target within absTol, preferring fewer items. Null if none.
 */
export function subsetSum(
  items: { id: string; amount: number }[],
  target: number,
  absTol = 0.05,
  maxK = 6
): string[] | null {
  const n = items.length;
  if (n < 2 || n > 18) return null;
  const tgt = new Decimal(target);
  const indexed = items
    .map((it) => ({ id: it.id, amt: new Decimal(it.amount) }))
    .sort((a, b) => b.amt.cmp(a.amt));

  let bestMask = 0;
  let bestK = Infinity;

  const rec = (idx: number, mask: number, k: number, sum: Decimal) => {
    if (k >= bestK) return;
    if (k >= 2 && sum.minus(tgt).abs().lte(absTol)) {
      bestK = k;
      bestMask = mask;
      return;
    }
    if (idx >= n || k >= maxK) return;
    if (sum.gt(tgt.plus(absTol))) return;
    rec(idx + 1, mask | (1 << idx), k + 1, sum.plus(indexed[idx]!.amt));
    rec(idx + 1, mask, k, sum);
  };
  rec(0, 0, 0, new Decimal(0));
  if (bestK === Infinity) return null;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) if (bestMask & (1 << i)) ids.push(indexed[i]!.id);
  return ids;
}

/** Absolute tolerance that scales with magnitude (fees on large wires), capped at maxTol. */
export function amountAbsTol(target: number, floor = 0.05, ratio = 0.001, maxTol = 50000): number {
  return Math.min(Math.max(floor, Math.abs(target) * ratio), maxTol);
}

/**
 * Like subsetSum, but returns null unless exactly one subset (k>=2) sums to
 * target. Ambiguous reconstructions must not auto-commit.
 */
export function subsetSumUnique(
  items: { id: string; amount: number }[],
  target: number,
  absTol = 0.05,
  maxK = 6
): string[] | null {
  const n = items.length;
  if (n < 2 || n > 18) return null;
  const tgt = new Decimal(target);
  const indexed = items
    .map((it) => ({ id: it.id, amt: new Decimal(it.amount) }))
    .sort((a, b) => b.amt.cmp(a.amt));

  const hits: number[] = [];
  const rec = (idx: number, mask: number, k: number, sum: Decimal) => {
    if (hits.length > 1) return;
    if (k >= 2 && sum.minus(tgt).abs().lte(absTol)) {
      hits.push(mask);
      return;
    }
    if (idx >= n || k >= maxK) return;
    if (sum.gt(tgt.plus(absTol))) return;
    rec(idx + 1, mask | (1 << idx), k + 1, sum.plus(indexed[idx]!.amt));
    rec(idx + 1, mask, k, sum);
  };
  rec(0, 0, 0, new Decimal(0));
  if (hits.length !== 1) return null;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) if (hits[0]! & (1 << i)) ids.push(indexed[i]!.id);
  return ids;
}
