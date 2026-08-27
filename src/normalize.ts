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
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
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
