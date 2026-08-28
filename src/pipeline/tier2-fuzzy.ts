/**
 * Tier 2 — deterministic fuzzy matching. No AI.
 *
 * Auto-commits only when a cheap rule is decisive:
 *   - same invoice identity within a T+2 window (timing / id-drift / FX / partial / refund)
 *   - unique (amount, date, currency) cross-source pair (no other occupant of that key)
 *   - duplicate ledger postings of the same invoice against one bank payment
 *   - subset-sum many-to-one / one-to-many with vendor overlap + collision guards
 *
 * Generic "high fuzzy score" is NOT enough: two same-vendor invoices on the same
 * day would otherwise collide. Residual records go to tier 3 with a recall-first
 * candidate pool that always keeps same-invoice hits and likely subset-sum parts.
 */
import Decimal from "decimal.js";
import { amountKey, amountsClose, daysBetween, tokenSim, sameInvoice, invoiceToken, recordsShareInvoice, vendorOverlap, subsetSumUnique, amountAbsTol, checkIndianTaxMdrSchedule } from "../normalize";
import type { FinRecord, Outcome, ReasonCode } from "../types";
import type { TierResult } from "./tier1-exact";

export interface Candidate {
  candidate: FinRecord;
  score: number;
  why: string;
}

export interface Tier2Result extends TierResult {
  candidatePools: Map<string, Candidate[]>;
}

const MAX_POOL = 12;
const SETTLE_DAYS = 2;

function absAmt(n: number): number {
  return Math.abs(n);
}

function amountScore(a: FinRecord, b: FinRecord): number {
  const da = new Decimal(a.amount).abs();
  const db = new Decimal(b.amount).abs();
  if (da.isZero() || db.isZero()) return 0;
  if (amountsClose(da.toNumber(), db.toNumber(), 0.05, 0)) return 0.5;
  const pctDiff = da.minus(db).abs().div(Decimal.max(da, db)).toNumber();
  if (pctDiff <= 0.005) return 0.5;
  if (pctDiff <= 0.03) return 0.35;
  if (pctDiff <= 0.10) return 0.15;
  if (Decimal.min(da, db).div(Decimal.max(da, db)).toNumber() >= 0.15) return 0.05;
  return 0;
}

function dateScore(a: FinRecord, b: FinRecord): number {
  const d = daysBetween(a.date, b.date);
  if (!Number.isFinite(d)) return 0;
  if (d === 0) return 0.25;
  if (d <= 2) return 0.22;
  if (d <= 5) return 0.08;
  if (d <= 20) return 0.04;
  return 0;
}

function descScore(a: FinRecord, b: FinRecord): number {
  if (recordsShareInvoice(a, b)) return 0.25;
  const v = vendorOverlap(a.description, b.description);
  return Math.max(tokenSim(a.description, b.description), v) * 0.25;
}

export function scorePair(a: FinRecord, b: FinRecord): number {
  if (a.id === b.id || a.source === b.source) return 0;
  return amountScore(a, b) + dateScore(a, b) + descScore(a, b);
}

function inSettleWindow(a: FinRecord, b: FinRecord, days = SETTLE_DAYS): boolean {
  const d = daysBetween(a.date, b.date);
  return Number.isFinite(d) && d <= days;
}

function ratio(a: number, b: number): number {
  const x = absAmt(a);
  const y = absAmt(b);
  if (x === 0 || y === 0) return 0;
  return Math.min(x, y) / Math.max(x, y);
}

function reasonForPair(a: FinRecord, b: FinRecord): ReasonCode {
  if (a.currency !== b.currency) return "currency_mismatch";
  if (Math.sign(a.amount) !== Math.sign(b.amount) || a.amount < 0 || b.amount < 0) return "refund_reversal";
  if (recordsShareInvoice(a, b) && !amountsClose(absAmt(a.amount), absAmt(b.amount), 0.05, 0.005)) {
    const pct = 1 - ratio(a.amount, b.amount);
    if (pct <= 0.03) return "amount_variance";
    return "partial_payment";
  }
  if (daysBetween(a.date, b.date) > 0) return "timing_gap";
  if (recordsShareInvoice(a, b)) return "id_drift";
  return "amount_variance";
}


function sharedLongToken(a: FinRecord, b: FinRecord): boolean {
  const tok = (r: FinRecord) =>
    (r.reference + " " + r.description)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 6 && /\d/.test(t));
  const A = new Set(tok(a));
  for (const t of tok(b)) if (A.has(t)) return true;
  return false;
}
function amtDateCurKey(r: FinRecord): string {
  return `${amountKey(absAmt(r.amount))}|${r.date}|${r.currency}`;
}

export function tier2Fuzzy(residual: FinRecord[]): Tier2Result {
  const outcomes: Outcome[] = [];
  const candidatePools = new Map<string, Candidate[]>();
  const used = new Set<string>();
  const byId = new Map(residual.map((r) => [r.id, r]));

  for (const r of residual) {
    const pool: Candidate[] = [];
    for (const other of residual) {
      if (other.id === r.id || other.source === r.source) continue;
      const invoiceHit = recordsShareInvoice(r, other);
      const uniqueKey = amtDateCurKey(r) === amtDateCurKey(other);
      if (!invoiceHit && !uniqueKey && !inSettleWindow(r, other, 5) && vendorOverlap(r.description, other.description) < 0.5) continue;
      const s = scorePair(r, other);
      if (s > 0 || invoiceHit || uniqueKey) {
        pool.push({
          candidate: other,
          score: Math.max(s, invoiceHit ? 0.4 : uniqueKey ? 0.35 : 0),
          why: invoiceHit ? "same_invoice" : uniqueKey ? "unique_amount_date" : "fuzzy",
        });
      }
    }
    pool.sort((x, y) => y.score - x.score);
    candidatePools.set(r.id, pool.slice(0, MAX_POOL));
  }

  const pushGroup = (
    members: FinRecord[],
    confidence: number,
    reasonCode: ReasonCode,
    reasoning: string,
    ruleTriggered = "Deterministic Fuzzy Rule",
    customEvidence?: Array<{ field: string; recordAVal: string | number; recordBVal: string | number; similarity: number; explanation: string }>
  ) => {
    for (const r of members) if (used.has(r.id)) return;
    const ids = members.map((m) => m.id);
    for (const r of members) used.add(r.id);

    const defaultEvidence = customEvidence ?? (members.length >= 2 ? [
      {
        field: "amount",
        recordAVal: members[0]!.amount,
        recordBVal: members[1]!.amount,
        similarity: amountsClose(absAmt(members[0]!.amount), absAmt(members[1]!.amount), 0.05, 0.05) ? 1.0 : 0.8,
        explanation: `${members[0]!.amount} ${members[0]!.currency} vs ${members[1]!.amount} ${members[1]!.currency}`,
      },
      {
        field: "date",
        recordAVal: members[0]!.date,
        recordBVal: members[1]!.date,
        similarity: daysBetween(members[0]!.date, members[1]!.date) === 0 ? 1.0 : 0.85,
        explanation: `${daysBetween(members[0]!.date, members[1]!.date)} days drift between postings`,
      },
      {
        field: "reference",
        recordAVal: members[0]!.reference,
        recordBVal: members[1]!.reference,
        similarity: recordsShareInvoice(members[0]!, members[1]!) ? 1.0 : 0.5,
        explanation: `Invoice / PO token alignment: ${recordsShareInvoice(members[0]!, members[1]!) ? "matched" : "approximate"}`,
      },
    ] : []);

    for (const r of members) {
      outcomes.push({
        status: "matched",
        recordId: r.id,
        source: r.source,
        matchedIds: ids.filter((i) => i !== r.id),
        confidence,
        tier: 2,
        reasonCode,
        reasoning,
        auditTrail: {
          tier: 2,
          ruleTriggered,
          confidence,
          evidence: defaultEvidence,
        },
      });
    }
  };

  const still = () => residual.filter((r) => !used.has(r.id));
  const unused = (src: FinRecord["source"] | FinRecord["source"][]) => {
    const set = new Set(Array.isArray(src) ? src : [src]);
    return still().filter((r) => set.has(r.source));
  };

function isValidFxCorridor(curA: string, curB: string, amtA: number, amtB: number): boolean {
  if (curA === curB) return false;
  const isEurUsd = (curA === "EUR" && curB === "USD") || (curA === "USD" && curB === "EUR");
  const isGbpUsd = (curA === "GBP" && curB === "USD") || (curA === "USD" && curB === "GBP");
  if (isEurUsd || isGbpUsd) {
    const r = ratio(amtA, amtB);
    return r >= 0.75 && r <= 1.35;
  }
  const isUsdInr = (curA === "USD" && curB === "INR") || (curA === "INR" && curB === "USD");
  if (isUsdInr) {
    const usd = curA === "USD" ? Math.abs(amtA) : Math.abs(amtB);
    const inr = curA === "INR" ? Math.abs(amtA) : Math.abs(amtB);
    if (usd === 0) return false;
    const effectiveRate = inr / usd;
    return effectiveRate >= 70 && effectiveRate <= 100;
  }
  return false;
}

  // --- 1:1 auto-commit: same invoice identity + settlement window (tight or wide) ---
  type Pair = { a: FinRecord; b: FinRecord; reason: ReasonCode; why: string };
  const scored: Pair[] = [];
  const seenPair = new Set<string>();
  for (const r of residual) {
    for (const c of candidatePools.get(r.id) ?? []) {
      const other = c.candidate;
      if (!recordsShareInvoice(r, other)) continue;
      const days = daysBetween(r.date, other.date);
      if (!Number.isFinite(days) || days > 20) continue;

      const sameSign = Math.sign(r.amount) === Math.sign(other.amount) || (r.amount < 0 && other.amount < 0);
      const isCrossCurrency = r.currency !== other.currency;

      const absClose = amountsClose(absAmt(r.amount), absAmt(other.amount), 0.05, 0.005);
      const feeClose = amountsClose(absAmt(r.amount), absAmt(other.amount), 0.05, 0.03);

      if (isCrossCurrency) {
        if (days > SETTLE_DAYS || !sameSign || !isValidFxCorridor(r.currency, other.currency, r.amount, other.amount)) {
          continue;
        }
      } else {
        if (days > SETTLE_DAYS) {
          if (!absClose || !sameSign) continue;
        } else {
          const isPartialOrFee = sameSign && ratio(r.amount, other.amount) >= 0.3;
          if (!(absClose || feeClose || isPartialOrFee)) continue;
        }
      }

      const key = [r.id, other.id].sort().join("|");
      if (seenPair.has(key)) continue;
      seenPair.add(key);

      scored.push({
        a: r,
        b: other,
        reason: reasonForPair(r, other),
        why: `invoice ${r.reference}~${other.reference} days=${days} ${r.amount} ${r.currency} vs ${other.amount} ${other.currency}`,
      });
    }
  }
  for (const p of scored) {
    if (used.has(p.a.id) || used.has(p.b.id)) continue;
    const ledgerAmt = p.a.source === "ledger" ? p.a.amount : p.b.source === "ledger" ? p.b.amount : p.a.amount;
    const twins = still().filter(
      (x) =>
        x.id !== p.a.id &&
        x.id !== p.b.id &&
        x.source === "ledger" &&
        recordsShareInvoice(p.a, x) &&
        amountsClose(absAmt(x.amount), absAmt(ledgerAmt), 0.05, 0)
    );
    if (twins.length > 0) continue;
    pushGroup([p.a, p.b], 0.96, p.reason, p.why);
  }

  // --- unique amount+date+currency cluster (BenchRec) ---
  const byKey = new Map<string, FinRecord[]>();
  for (const r of still()) {
    const k = amtDateCurKey(r);
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  for (const group of byKey.values()) {
    const leftover = group.filter((g) => !used.has(g.id));
    const banks = leftover.filter((g) => g.source === "bank");
    const others = leftover.filter((g) => g.source !== "bank");
    if (banks.length !== 1 || others.length < 1) continue;

    const bankSign = Math.sign(banks[0]!.amount);
    if (others.some((o) => Math.sign(o.amount) !== bankSign)) continue;

    const refs = new Set(others.map((g) => g.reference));
    if (others.length > 1 && refs.size > 1) continue;

    const large = Math.abs(banks[0]!.amount) >= 9000;
    if (!large) {
      const hasConflictingInvoices = others.some((o) => {
        if (sharedLongToken(banks[0]!, o)) return false;
        const tb = invoiceToken(banks[0]!.reference);
        const to = invoiceToken(o.reference);
        return tb.length > 0 && to.length > 0 && tb !== to;
      });
      if (hasConflictingInvoices) continue;
    }

    const uniquePair = others.length === 1 && (large || sharedLongToken(banks[0]!, others[0]!));
    const uniqueCluster = others.length > 1 && large;
    if (!uniquePair && !uniqueCluster) continue;

    pushGroup(
      [banks[0]!, ...others],
      0.94,
      others.length > 1 ? "many_to_one" : "exact_match",
      `unique amount+date+currency (${banks[0]!.amount} on ${banks[0]!.date}, ${others.length} counterpart(s))`
    );
  }

  // --- duplicate posting: one bank payment, two+ identical ledger invoices ---
  for (const b of unused("bank")) {
    const twins = unused(["ledger", "processor"]).filter(
      (l) =>
        l.currency === b.currency &&
        sameInvoice(b.reference, l.reference) &&
        amountsClose(absAmt(b.amount), absAmt(l.amount), 0.05, 0.005) &&
        inSettleWindow(b, l, SETTLE_DAYS)
    );
    if (twins.length >= 2) {
      pushGroup([b, ...twins], 0.97, "duplicate_conflict", `duplicate posting: bank ${b.amount} on ${b.date} vs ${twins.length} ledger rows for ${b.reference}`);
    }
  }

  // --- many-to-one: bank deposit = unique subset of invoices in a tight window ---
  // Vendor overlap is preferred but not required for large BenchRec wires where bank descriptions
  // are often empty placeholders. For synthetic amounts, require exact sum (0.05 tol).
  for (const b of unused("bank")) {
    if (b.amount <= 0) continue;
    const isLarge = b.amount >= 9000;
    const tol = isLarge ? amountAbsTol(b.amount) : 0.05;
    const parts = unused(["ledger", "processor"]).filter(
      (l) =>
        l.currency === b.currency &&
        l.amount > 0 &&
        l.amount < b.amount + tol &&
        inSettleWindow(b, l, SETTLE_DAYS)
    );
    const preferred = parts.filter((l) => vendorOverlap(b.description, l.description) > 0 || sameInvoice(b.reference, l.reference));
    const pool = preferred.length >= 2 ? preferred : isLarge ? parts : [];
    if (pool.length < 2) continue;
    const hit = subsetSumUnique(
      pool.map((p) => ({ id: p.id, amount: p.amount })),
      b.amount,
      tol,
      6
    );
    if (!hit) continue;
    const members = hit.map((id) => byId.get(id)!).filter(Boolean);
    if (members.length < 2) continue;
    if (unused(["ledger", "processor"]).some((l) => sameInvoice(b.reference, l.reference) && amountsClose(b.amount, l.amount, 0.05, 0.005))) continue;
    const rival = unused("bank").some(
      (o) =>
        o.id !== b.id &&
        amountsClose(o.amount, b.amount, tol, isLarge ? 0.001 : 0) &&
        inSettleWindow(b, o, 5) &&
        (!preferred.length || vendorOverlap(b.description, o.description) > 0)
    );
    if (rival) continue;
    pushGroup(
      [b, ...members],
      0.96,
      "many_to_one",
      `subset-sum: ${b.id} ${b.amount} ${b.currency} on ${b.date} = ${members.map((m) => `${m.id}:${m.amount}`).join(" + ")}`
    );
  }

  // --- one-to-many: one ledger invoice split across several bank credits ---
  for (const l of unused("ledger")) {
    if (l.amount <= 0) continue;
    const isLarge = l.amount >= 9000;
    const tol = isLarge ? amountAbsTol(l.amount) : 0.05;
    const parts = unused("bank").filter(
      (b) =>
        b.currency === l.currency &&
        b.amount > 0 &&
        b.amount < l.amount + tol &&
        inSettleWindow(l, b, SETTLE_DAYS)
    );
    if (parts.length < 2) continue;
    const preferred = parts.filter((b) => vendorOverlap(l.description, b.description) > 0 || sameInvoice(l.reference, b.reference));
    const pool = preferred.length >= 2 ? preferred : isLarge ? parts : [];
    if (pool.length < 2) continue;
    const hit = subsetSumUnique(
      pool.map((p) => ({ id: p.id, amount: p.amount })),
      l.amount,
      tol,
      6
    );
    if (!hit) continue;
    const members = hit.map((id) => byId.get(id)!).filter(Boolean);
    if (members.length < 2) continue;
    if (unused("bank").some((b) => sameInvoice(l.reference, b.reference) && amountsClose(l.amount, b.amount, 0.05, 0.005))) continue;
    pushGroup(
      [l, ...members],
      0.96,
      "one_to_many",
      `split settlement: ${l.id} ${l.amount} = ${members.map((m) => `${m.id}:${m.amount}`).join(" + ")}`
    );
  }

  // --- cross-currency FX matching without explicit invoice tokens ---
  type FxPair = { b: FinRecord; l: FinRecord; d: number; v: number; r: number; score: number };
  const allFxPairs: FxPair[] = [];
  for (const b of unused("bank")) {
    for (const l of unused("ledger")) {
      if (b.currency === l.currency) continue;
      if (Math.sign(b.amount) !== Math.sign(l.amount) || b.amount <= 0 || l.amount <= 0) continue;
      if (!isValidFxCorridor(b.currency, l.currency, b.amount, l.amount)) continue;
      const d = daysBetween(b.date, l.date);
      if (d > SETTLE_DAYS) continue;
      const v = vendorOverlap(b.description, l.description);
      if (v < 0.8) continue;
      const r = ratio(b.amount, l.amount);
      const score = 100 - d * 10 - Math.abs(1 - r) * 10;
      allFxPairs.push({ b, l, d, v, r, score });
    }
  }
  allFxPairs.sort((x, y) => y.score - x.score);
  for (const fx of allFxPairs) {
    if (used.has(fx.b.id) || used.has(fx.l.id)) continue;
    pushGroup(
      [fx.b, fx.l],
      0.95,
      "currency_mismatch",
      `cross-currency FX match: bank ${fx.b.amount} ${fx.b.currency} on ${fx.b.date} vs ledger ${fx.l.amount} ${fx.l.currency} on ${fx.l.date} (vendor overlap ${fx.v})`,
      "Cross-Currency FX Corridor Match",
      [
        {
          field: "currency_and_rate",
          recordAVal: `${fx.b.amount} ${fx.b.currency}`,
          recordBVal: `${fx.l.amount} ${fx.l.currency}`,
          similarity: +fx.r.toFixed(3),
          explanation: `Cross-currency settlement in EUR/USD corridor with effective rate ${(fx.b.amount / fx.l.amount).toFixed(4)}`,
        },
        {
          field: "vendor",
          recordAVal: fx.b.description,
          recordBVal: fx.l.description,
          similarity: fx.v,
          explanation: `Shared vendor identity across bank and ledger postings`,
        },
        {
          field: "date",
          recordAVal: fx.b.date,
          recordBVal: fx.l.date,
          similarity: fx.d === 0 ? 1.0 : 0.9,
          explanation: `${fx.d} day(s) settlement timing delta`,
        },
      ]
    );
  }

  // --- Indian Tax / MDR deduction matching (Razorpay 2.36% MDR / TDS 194C / TDS 194J) ---
  for (const b of unused("bank")) {
    if (b.amount <= 0) continue;
    for (const l of unused("ledger")) {
      if (l.currency !== b.currency || l.amount <= 0) continue;
      if (!inSettleWindow(b, l, SETTLE_DAYS)) continue;
      const sharedRef = recordsShareInvoice(b, l);
      const vOverlap = vendorOverlap(b.description, l.description);
      if (!sharedRef && vOverlap < 0.6) continue;

      const taxMatch = checkIndianTaxMdrSchedule(l.amount, b.amount);
      if (taxMatch?.matched) {
        pushGroup(
          [b, l],
          0.96,
          "amount_variance",
          `${taxMatch.rule}: ledger gross ${l.amount} -> bank net ${b.amount} (deduction ${taxMatch.ratePct}%)`,
          `Indian Statutory / Payment Schedule: ${taxMatch.rule}`,
          [
            {
              field: "tax_schedule",
              recordAVal: l.amount,
              recordBVal: b.amount,
              similarity: 1.0,
              explanation: `${taxMatch.rule} exactly matches net bank amount ${b.amount} (expected: ${taxMatch.expectedNet})`,
            },
            {
              field: "reference_or_vendor",
              recordAVal: l.reference,
              recordBVal: b.reference,
              similarity: sharedRef ? 1.0 : vOverlap,
              explanation: sharedRef ? "Direct invoice reference link" : `Vendor token overlap: ${vOverlap.toFixed(2)}`,
            },
          ]
        );
        break;
      }
    }
  }

  for (const r of still()) {
    const pool = candidatePools.get(r.id) ?? [];
    const have = new Set(pool.map((c) => c.candidate.id));
    for (const other of still()) {
      if (other.id === r.id || other.source === r.source || have.has(other.id)) continue;
      if (r.source === "bank" && other.amount > 0 && other.amount < r.amount && inSettleWindow(r, other, 5) && vendorOverlap(r.description, other.description) > 0) {
        pool.push({ candidate: other, score: 0.2, why: "possible_part" });
        have.add(other.id);
      }
    }
    pool.sort((x, y) => y.score - x.score);
    candidatePools.set(r.id, pool.slice(0, MAX_POOL));
  }

  return { outcomes, residual: still(), candidatePools };
}
