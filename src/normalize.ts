import Decimal from "decimal.js";
import { distance } from "fastest-levenshtein";

/** Normalize a reference/ID: uppercase, strip non-alphanumerics, drop common prefixes. */
export function normalizeRef(raw: string): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const p of ["INV", "PMT", "PAY", "REF", "TRX", "TXN"]) {
    if (s.startsWith(p) && s.length > p.length + 2) {
      s = s.slice(p.length);
      break;
    }
  }
  return s.replace(/^0+(?=\d)/, "");
}

/**
 * Stable invoice identity: digit core, ignoring trailing amendment letters
 * (INV-96034-A → 96034) and common prefixes. Falls back to normalizeRef.
 */
export function invoiceToken(raw: string): string {
  const n = normalizeRef(raw);
  const core = n.replace(/[A-Z]+$/g, "");
  if (core.length >= 3 && /\d/.test(core)) return core;
  const digits = n.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  if (digits.length >= 3) return digits;
  return n;
}

export function sameInvoice(a: string, b: string): boolean {
  const ta = invoiceToken(a);
  const tb = invoiceToken(b);
  return ta.length > 0 && ta === tb;
}

/**
 * Extract candidate invoice / PO reference tokens from a record's reference and description.
 * Finds patterns like INV-12345, PO#937478, PO-937478, WIRE-1234, etc.
 */
export function extractRefTokens(ref: string, desc: string): Set<string> {
  const tokens = new Set<string>();
  const t = invoiceToken(ref);
  if (t && t.length >= 3 && /\d/.test(t)) tokens.add(t);

  const poRefMatch = ref.match(/^PO[\-#\s]?([0-9]{3,})/i);
  if (poRefMatch?.[1]) {
    tokens.add(poRefMatch[1].replace(/^0+(?=\d)/, ""));
  }

  if (desc.toLowerCase().includes("installment") || desc.toLowerCase().includes("split")) {
    return tokens;
  }

  const text = `${ref} ${desc}`;
  const matches = text.matchAll(/\b(?:PO)[#\-\s:]*([0-9]{3,})\b/gi);
  for (const m of matches) {
    if (m[1]) {
      const core = m[1].replace(/^0+(?=\d)/, "");
      if (core.length >= 3) tokens.add(core);
    }
  }
  return tokens;
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
  "invoice", "inv", "payment", "pmt", "batch", "the", "for", "and", "inc", "ltd", "llc", "corp", "co",
  "debit", "credit", "transfer", "wire", "ach", "pos", "card", "refund", "reversal",
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

/** Absolute tolerance that scales with magnitude (fees on large wires). */
export function amountAbsTol(target: number, floor = 0.05, pct = 0.001): number {
  return Math.max(floor, Math.abs(target) * pct);
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
