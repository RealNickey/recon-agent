/**
 * Tier 1 — exact matching. No AI. Hash-join on normalized composite keys.
 * Pattern: OpenRecon Phase A exact shared-key join (Decimal amount, never JS Number).
 * Input: all records. Output: matched outcomes + unresolved residual.
 *
 * A cross-source group that shares (normalized ref, amount, date, currency) is
 * one match — including duplicate same-source extras. Dropping extras was a
 * scoring bug: the answer key for "duplicate" is the full {bank, L1, L2} set.
 */
import { amountKey, normalizeRef } from "../normalize";
import type { FinRecord, Outcome } from "../types";

export interface TierResult {
  outcomes: Outcome[];
  residual: FinRecord[];
}

function compositeKey(r: FinRecord): string | null {
  const ref = normalizeRef(r.reference);
  if (ref.length < 3) return null;
  return `${ref}|${amountKey(r.amount)}|${r.date}|${r.currency}`;
}

export function tier1Exact(records: FinRecord[]): TierResult {
  const byKey = new Map<string, FinRecord[]>();
  const unmatched: FinRecord[] = [];
  for (const r of records) {
    const k = compositeKey(r);
    if (!k) {
      unmatched.push(r);
      continue;
    }
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }

  const outcomes: Outcome[] = [];
  const residual: FinRecord[] = [...unmatched];

  for (const group of byKey.values()) {
    const sources = new Set(group.map((g) => g.source));
    if (group.length >= 2 && sources.size >= 2) {
      const ids = group.map((r) => r.id);
      const reasoning = `exact key match on normalized ref + amount + date + currency (${group.length} records, sources=${[...sources].join(",")})`;
      for (const r of group) {
        outcomes.push({
          status: "matched",
          recordId: r.id,
          source: r.source,
          matchedIds: ids.filter((i) => i !== r.id),
          confidence: 1,
          tier: 1,
          reasonCode: "exact_match",
          reasoning,
        });
      }
    } else {
      residual.push(...group);
    }
  }
  return { outcomes, residual };
}
