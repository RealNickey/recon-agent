import { describe, expect, it } from "bun:test";
import { generateDataset } from "../scripts/generate-data";
import { daysBetween, sameInvoice } from "./normalize";
import { UNMATCHABLE_CATEGORIES } from "./scoring";

describe("Hard Dataset Generator", () => {
  it("generates deterministic outputs given seed 999", () => {
    const d1 = generateDataset(999, "hard");
    const d2 = generateDataset(999, "hard");

    expect(d1.bank).toEqual(d2.bank);
    expect(d1.ledger).toEqual(d2.ledger);
    expect(d1.processor).toEqual(d2.processor);
    expect(d1.truth).toEqual(d2.truth);
  });

  it("satisfies the size bar: >=50 matchable pairs and >=15 unmatchable records", () => {
    const dataset = generateDataset(999, "hard");
    const matchable = dataset.truth.filter((p) => !UNMATCHABLE_CATEGORIES.has(p.category));
    const unmatchable = dataset.truth.filter((p) => UNMATCHABLE_CATEGORIES.has(p.category));

    expect(matchable.length).toBeGreaterThanOrEqual(50);
    expect(unmatchable.length).toBeGreaterThanOrEqual(15);
  });

  it("produces hard features not present in easy dataset", () => {
    const dataset = generateDataset(999, "hard");
    const bankById = new Map(dataset.bank.map((b) => [b.id, b]));
    const ledgerById = new Map(dataset.ledger.map((l) => [l.id, l]));

    // 1. Assert some pairs have lags > 2 days
    const wideLagPairs = dataset.truth.filter((p) => {
      if (!p.bankId || p.ledgerIds.length === 0) return false;
      const b = bankById.get(p.bankId);
      const l = ledgerById.get(p.ledgerIds[0]!);
      if (!b || !l) return false;
      return daysBetween(b.date, l.date) > 2;
    });
    expect(wideLagPairs.length).toBeGreaterThan(0);

    // 2. Assert some matchable pairs have no shared invoice token (identity_weak / fx_no_invoice)
    const weakIdentityPairs = dataset.truth.filter((p) => {
      if (UNMATCHABLE_CATEGORIES.has(p.category)) return false;
      if (!p.bankId || p.ledgerIds.length === 0) return false;
      const b = bankById.get(p.bankId);
      const l = ledgerById.get(p.ledgerIds[0]!);
      if (!b || !l) return false;
      return !sameInvoice(b.reference, l.reference);
    });
    expect(weakIdentityPairs.length).toBeGreaterThan(0);

    // 3. Assert some groups contain unmatchable extras_do_not_sum records
    const extras = dataset.truth.filter((p) => p.category === "extras_do_not_sum");
    expect(extras.length).toBeGreaterThan(0);
    for (const e of extras) {
      expect(e.bankId).toBeNull();
      expect(e.ledgerIds.length).toBeGreaterThan(0);
    }

    // 4. Assert distractor unmatchables exist
    const distractors = dataset.truth.filter((p) => p.category === "distractor_unmatchable");
    expect(distractors.length).toBeGreaterThan(0);
  });
});
