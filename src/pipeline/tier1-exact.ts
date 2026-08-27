/**
 * Tier 1 — exact matching. No AI. Hash-join on normalized composite keys.
 * Input: all records. Output: matched outcomes + unresolved residual.
 */
import { normalizeRef } from "../normalize";
import type { FinRecord, Outcome } from "../types";

export interface TierResult {
  outcomes: Outcome[];
  residual: FinRecord[];
}

function compositeKey(r: FinRecord): string {
  return `${normalizeRef(r.reference)}|${r.amount.toFixed(2)}|${r.date}`;
}

export function tier1Exact(records: FinRecord[]): TierResult {
  const byKey = new Map<string, FinRecord[]>();
  for (const r of records) {
    const k = compositeKey(r);
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }

  const outcomes: Outcome[] = [];
  const residual: FinRecord[] = [];

  for (const group of byKey.values()) {
    const sources = new Set(group.map((g) => g.source));
    if (group.length >= 2 && sources.size >= 2) {
      // cross-source exact hit: match the first record of each source together
      const bySource = new Map<string, FinRecord[]>();
      for (const g of group) {
        const arr = bySource.get(g.source) ?? [];
        arr.push(g);
        bySource.set(g.source, arr);
      }
      const reps = [...bySource.values()].map((a) => a[0]);
      const ids = reps.map((r) => r.id);
      for (const r of reps) {
        outcomes.push({
          status: "matched",
          recordId: r.id,
          source: r.source,
          matchedIds: ids.filter((i) => i !== r.id),
          confidence: 1,
          tier: 1,
        });
      }
      // any extra same-source rows in the group are ambiguous — push to residual
      for (const arr of bySource.values()) residual.push(...arr.slice(1));
    } else {
      residual.push(...group);
    }
  }
  return { outcomes, residual };
}
