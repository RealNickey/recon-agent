/**
 * Reconstruct a BenchRec match group from a bank amount and candidate A-side
 * rows. Extra A-rows that share an allocation but do not participate in the
 * amount identity are dropped — including them in the answer key makes the
 * pair unrecoverable (a correct 1:1 becomes a "miss" for incompleteness).
 */
import { amountKey, amountsClose, subsetSum } from "./normalize";

export function fingerprintRecord(parts: {
  amount: number;
  date: string;
  currency: string;
  reference: string;
  description: string;
}): string {
  return [
    amountKey(parts.amount),
    parts.date,
    parts.currency,
    parts.reference,
    parts.description.slice(0, 80),
  ].join("|");
}

export function selectReconstructingA<T extends { amount: number }>(
  bankAmount: number,
  candidates: T[],
  opts: { absTol?: number; pctTol?: number; maxK?: number } = {}
): T[] | null {
  if (candidates.length === 0 || !Number.isFinite(bankAmount)) return null;
  const absTol = opts.absTol ?? 0.05;
  const pctTol = opts.pctTol ?? 0.001;
  const maxK = opts.maxK ?? 6;

  const exact = candidates.filter((c) => amountsClose(c.amount, bankAmount, absTol, pctTol));
  if (exact.length > 0) return [exact[0]!];

  const indexed = candidates.map((item, i) => ({ item, id: `i${i}`, amount: item.amount }));
  const sumTol = Math.max(absTol, Math.abs(bankAmount) * pctTol);
  const hit = subsetSum(
    indexed.map(({ id, amount }) => ({ id, amount })),
    bankAmount,
    sumTol,
    maxK
  );
  if (!hit) return null;
  const want = new Set(hit);
  const selected = indexed.filter((x) => want.has(x.id)).map((x) => x.item);
  return selected.length >= 2 ? selected : null;
}
