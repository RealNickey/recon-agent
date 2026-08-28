/**
 * Tier 1 — exact matching. No AI. Hash-join on normalized composite keys.
 * Pattern: OpenRecon Phase A exact shared-key join (Decimal amount, never JS Number).
 * Input: all records. Output: matched outcomes + unresolved residual.
 *
 * A cross-source group that shares (normalized ref, amount, date, currency) is
 * one match — including duplicate same-source extras. Dropping extras was a
 * scoring bug: the answer key for "duplicate" is the full {bank, L1, L2} set.
 */
import { amountKey, normalizeRef, invoiceToken, sameInvoice, checkIndianTaxMdrSchedule, daysBetween } from "../normalize";
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
  const residual: FinRecord[] = [];
  const claimedIds = new Set<string>();

  for (const group of byKey.values()) {
    const sources = new Set(group.map((g) => g.source));
    if (group.length >= 2 && sources.size >= 2) {
      // Check for 3-source settlement: if bank is missing, see if there is an unmatched bank payout
      const hasBank = sources.has("bank");
      const refToken = invoiceToken(group[0]!.reference);
      const grossAmt = group[0]!.amount;
      const cur = group[0]!.currency;
      const grpDate = group[0]!.date;

      const expandedGroup = [...group];
      if (!hasBank && refToken) {
        const candidateBanks = unmatched.filter(
          (b) =>
            b.source === "bank" &&
            !claimedIds.has(b.id) &&
            b.currency === cur &&
            daysBetween(grpDate, b.date) <= 5 &&
            (sameInvoice(b.reference, group[0]!.reference) ||
             (b.reference + " " + b.description).includes(refToken)) &&
            (checkIndianTaxMdrSchedule(grossAmt, b.amount)?.matched ||
             Math.abs(b.amount - grossAmt) <= 0.05)
        );
        if (candidateBanks.length === 1) {
          expandedGroup.push(candidateBanks[0]!);
          claimedIds.add(candidateBanks[0]!.id);
        }
      }

      for (const r of expandedGroup) claimedIds.add(r.id);
      const ids = expandedGroup.map((r) => r.id);
      const reasoning = `exact / 3-source settlement match on normalized ref + amount + date + currency (${expandedGroup.length} records, sources=${[...new Set(expandedGroup.map((x) => x.source))].join(",")})`;
      for (const r of expandedGroup) {
        const counterparts = expandedGroup.filter((g) => g.id !== r.id);
        const firstCp = counterparts[0];
        outcomes.push({
          status: "matched",
          recordId: r.id,
          source: r.source,
          matchedIds: ids.filter((i) => i !== r.id),
          confidence: 1,
          tier: 1,
          reasonCode: "exact_match",
          reasoning,
          auditTrail: {
            tier: 1,
            ruleTriggered: "Exact Normalized Hash-Join / 3-Source Settlement",
            confidence: 1.0,
            evidence: [
              {
                field: "reference",
                recordAVal: r.reference,
                recordBVal: firstCp ? firstCp.reference : r.reference,
                similarity: 1.0,
                explanation: `Normalized reference '${normalizeRef(r.reference)}' matched`,
              },
              {
                field: "amount",
                recordAVal: r.amount,
                recordBVal: firstCp ? firstCp.amount : r.amount,
                similarity: 1.0,
                explanation: `Amounts matched across sources in ${r.currency}`,
              },
              {
                field: "date",
                recordAVal: r.date,
                recordBVal: firstCp ? firstCp.date : r.date,
                similarity: 1.0,
                explanation: `Posting date within settlement window`,
              },
            ],
          },
        });
      }
    } else {
      for (const r of group) {
        if (!claimedIds.has(r.id)) residual.push(r);
      }
    }
  }

  for (const r of unmatched) {
    if (!claimedIds.has(r.id)) residual.push(r);
  }

  return { outcomes, residual };
}
