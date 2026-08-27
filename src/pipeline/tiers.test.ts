import { describe, expect, it } from "bun:test";
import { tier1Exact } from "./tier1-exact";
import { tier2Fuzzy } from "./tier2-fuzzy";
import type { FinRecord } from "../types";

const rec = (
  id: string,
  source: FinRecord["source"],
  amount: number,
  date: string,
  reference: string,
  description = "x",
  currency = "USD"
): FinRecord => ({ id, source, date, amount, currency, description, reference });

describe("tier1Exact", () => {
  it("matches identical cross-source records", () => {
    const { outcomes, residual } = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1"),
      rec("B1", "bank", 100, "2026-06-01", "INV-1"),
    ]);
    expect(outcomes.filter((o) => o.status === "matched")).toHaveLength(2);
    expect(residual).toHaveLength(0);
  });
  it("does not match different amounts", () => {
    const { residual } = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1"),
      rec("B1", "bank", 101, "2026-06-01", "INV-1"),
    ]);
    expect(residual).toHaveLength(2);
  });
  it("does not exact-match 1.005 against 1.00 (Number.toFixed dust)", () => {
    expect(Number(1.005).toFixed(2)).toBe("1.00");
    const { residual, outcomes } = tier1Exact([
      rec("L1", "ledger", 1.005, "2026-06-01", "INV-1"),
      rec("B1", "bank", 1.00, "2026-06-01", "INV-1"),
    ]);
    expect(outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
    expect(residual).toHaveLength(2);
  });
  it("exact-matches identical Decimal-rounded amounts that Number.toFixed would split", () => {
    const { residual, outcomes } = tier1Exact([
      rec("L1", "ledger", 1.005, "2026-06-01", "INV-1"),
      rec("B1", "bank", 1.005, "2026-06-01", "INV-1"),
    ]);
    expect(outcomes.filter((o) => o.status === "matched")).toHaveLength(2);
    expect(residual).toHaveLength(0);
  });
  it("keeps duplicate same-source extras in the matched group", () => {
    const { outcomes, residual } = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-9"),
      rec("L2", "ledger", 100, "2026-06-01", "INV-9"),
      rec("B1", "bank", 100, "2026-06-01", "INV-9"),
    ]);
    expect(residual).toHaveLength(0);
    const b = outcomes.find((o) => o.recordId === "B1");
    expect(b?.status).toBe("matched");
    if (b?.status === "matched") expect(b.matchedIds.sort()).toEqual(["L1", "L2"]);
  });
});

describe("tier2Fuzzy", () => {
  it("does not auto-commit vendor-similar pairs with distinct invoices", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme payment"),
      rec("B1", "bank", 100, "2026-06-01", "INV-2", "acme payment"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    expect(t2.outcomes.filter((o) => o.status === "matched").length).toBe(0);
  });

  it("auto-commits T+1 / T+2 timing drift with the same invoice", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme payment"),
      rec("B1", "bank", 100, "2026-06-02", "INV-1", "acme payment"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    expect(t2.outcomes.filter((o) => o.status === "matched").length).toBe(2);
    expect(t2.outcomes[0]?.reasonCode).toBe("timing_gap");
  });

  it("auto-commits id-format drift (INV-96034-A vs INV-96034)", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 250, "2026-06-01", "INV-96034", "acme invoice"),
      rec("B1", "bank", 250, "2026-06-01", "INV-96034-A", "acme payment"),
    ]);
    expect(t2.residual).toHaveLength(0);
    expect(t2.outcomes.every((o) => o.status === "matched")).toBe(true);
  });

  it("auto-commits a many-to-one batch via subset-sum", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 40, "2026-06-01", "INV-11", "Acme Corp invoice INV-11"),
      rec("L2", "ledger", 60, "2026-06-01", "INV-12", "Acme Corp invoice INV-12"),
      rec("B1", "bank", 100, "2026-06-02", "BATCH-9", "Acme Corp batch payment"),
    ]);
    const matched = t2.outcomes.filter((o) => o.status === "matched");
    expect(matched).toHaveLength(3);
    expect(matched[0]?.reasonCode).toBe("many_to_one");
  });

  it("groups duplicate ledger postings with the single bank payment", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 80, "2026-06-01", "INV-77", "acme invoice"),
      rec("L2", "ledger", 80, "2026-06-01", "INV-77", "acme invoice"),
      rec("B1", "bank", 80, "2026-06-01", "INV-77", "acme payment"),
    ]);
    expect(t1.residual).toHaveLength(0);
    expect(t1.outcomes).toHaveLength(3);
  });

  it("does not steal an unmatchable invoice into a batch of a different vendor", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 40, "2026-06-01", "INV-11", "Acme Corp invoice INV-11"),
      rec("L2", "ledger", 60, "2026-06-01", "INV-12", "Acme Corp invoice INV-12"),
      rec("L9", "ledger", 100, "2026-06-01", "INV-99", "Globex Ltd invoice INV-99"),
      rec("B1", "bank", 100, "2026-06-02", "BATCH-9", "Acme Corp batch payment"),
    ]);
    const ids = t2.outcomes.filter((o) => o.status === "matched").map((o) => o.recordId).sort();
    expect(ids).toEqual(["B1", "L1", "L2"]);
    expect(t2.residual.map((r) => r.id)).toContain("L9");
  });

  it("passes unrelated records down with (possibly empty) candidate pools", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme"),
      rec("B1", "bank", 100, "2026-06-20", "XYZ", "something else entirely"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    expect(t2.residual.length).toBeGreaterThan(0);
    expect(t2.candidatePools.size).toBeGreaterThan(0);
  });

  it("matches a unique large same-amount same-day pair even when references differ", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 50542100, "2023-05-19", "LEDGER-REF", "TUP PARAGLOSSA"),
      rec("B1", "bank", 50542100, "2023-05-19", "VOLERY 4654976666FP", "TUP PARAGLOSSA/WAMP"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(2);
  });


  it("matches a unique small pair when they share a long token", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 210, "2023-04-21", "32566DH6QU 32566DH6QU JOQVY", "JOQVY - BAS - DG"),
      rec("B1", "bank", 210, "2023-04-21", "32566DH6QU 9096266141VI", "benchrec bank txn"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(2);
  });
  it("auto-commits a unique large many-to-one even with an empty bank description", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 1281019.4, "2023-05-03", "HEY RAMON A", "SMILAX RAMON"),
      rec("L2", "ledger", 1314.2, "2023-05-03", "HEY RAMON B", "SMILAX RAMON"),
      rec("B1", "bank", 1282509.69, "2023-05-03", "GYNOMONOECISM", "benchrec bank txn"),
    ]);
    const matched = t2.outcomes.filter((o) => o.status === "matched");
    expect(matched).toHaveLength(3);
    expect(matched[0]?.reasonCode).toBe("many_to_one");
  });

  it("does not auto-commit when two subsets both reconstruct the bank amount", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 40, "2026-06-01", "INV-11", "Acme Corp invoice INV-11"),
      rec("L2", "ledger", 60, "2026-06-01", "INV-12", "Acme Corp invoice INV-12"),
      rec("L3", "ledger", 30, "2026-06-01", "INV-13", "Acme Corp invoice INV-13"),
      rec("L4", "ledger", 70, "2026-06-01", "INV-14", "Acme Corp invoice INV-14"),
      rec("B1", "bank", 100, "2026-06-02", "BATCH-9", "Acme Corp batch payment"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
  });

  it("does not glue two large banks that share amount+date with two ledgers", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 50542407.4, "2023-05-17", "LEDGER-A", "TUP"),
      rec("L2", "ledger", 50542407.4, "2023-05-17", "LEDGER-B", "TUP"),
      rec("B1", "bank", 50542407.4, "2023-05-17", "VOLERY-A", "TUP"),
      rec("B2", "bank", 50542407.4, "2023-05-17", "VOLERY-B", "TUP"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
  });

  it("does not glue two small synthetic invoices that share amount+date", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme"),
      rec("B1", "bank", 100, "2026-06-01", "INV-2", "globex"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
  });

  it("does not subset-sum many-to-one across unrelated vendors without vendor overlap", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 40, "2026-06-01", "INV-11", "Acme Corp invoice"),
      rec("L2", "ledger", 60, "2026-06-01", "INV-12", "Initech LLC invoice"),
      rec("B1", "bank", 100, "2026-06-02", "BATCH-9", "Globex Ltd batch payment"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
  });

  it("does not subset-sum one-to-many across unrelated vendors without vendor overlap", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 100, "2026-06-01", "INV-11", "Acme Corp invoice"),
      rec("B1", "bank", 40, "2026-06-01", "TX-1", "Initech LLC installment"),
      rec("B2", "bank", 60, "2026-06-02", "TX-2", "Globex Ltd installment"),
    ]);
    expect(t2.outcomes.filter((o) => o.status === "matched")).toHaveLength(0);
  });

  it("auto-commits wide timing drift (up to 20 days) with exact invoice and amount", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 500, "2026-06-01", "INV-8899", "Acme Corp invoice INV-8899"),
      rec("B1", "bank", 500, "2026-06-12", "INV-8899", "Acme Corp payment INV-8899"),
    ]);
    expect(t2.residual).toHaveLength(0);
    expect(t2.outcomes.every((o) => o.status === "matched")).toBe(true);
    expect(t2.outcomes[0]?.reasonCode).toBe("timing_gap");
  });

  it("auto-commits weak identity matching via embedded PO# in description", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 3200, "2026-06-07", "PO-937478", "Hooli monthly retainer PO-937478"),
      rec("B1", "bank", 3200, "2026-06-08", "WIRE-2367", "HOOLI RET PO#937478"),
    ]);
    expect(t2.residual).toHaveLength(0);
    expect(t2.outcomes.every((o) => o.status === "matched")).toBe(true);
  });

  it("auto-commits cross-currency FX pairs with shared vendor in settlement window", () => {
    const t2 = tier2Fuzzy([
      rec("L1", "ledger", 2288.09, "2026-06-09", "TX-INT-27097", "Aperture Science overseas consulting", "USD"),
      rec("B1", "bank", 2031.53, "2026-06-10", "WIRE-SEPA-94244", "APERTURE SCIENCE EUR SETTLE", "EUR"),
    ]);
    expect(t2.residual).toHaveLength(0);
    expect(t2.outcomes.every((o) => o.status === "matched")).toBe(true);
    expect(t2.outcomes[0]?.reasonCode).toBe("currency_mismatch");
  });
});

