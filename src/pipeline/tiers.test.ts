import { describe, expect, it } from "bun:test";
import { tier1Exact } from "./tier1-exact";
import { tier2Fuzzy } from "./tier2-fuzzy";
import type { FinRecord } from "../types";

const rec = (id: string, source: FinRecord["source"], amount: number, date: string, reference: string, description = "x"): FinRecord =>
  ({ id, source, date, amount, currency: "USD", description, reference });

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
});

describe("tier2Fuzzy", () => {
  it("auto-commits near-identical pairs (same day, same ref)", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme payment"),
      rec("B1", "bank", 100, "2026-06-01", "INV-2", "acme payment"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    expect(t2.outcomes.filter((o) => o.status === "matched").length).toBe(2);
  });
  it("passes timing-drift pairs down to tier 3 with a candidate pool", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme payment"),
      rec("B1", "bank", 100, "2026-06-02", "INV-1", "acme payment"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    // 0.93 score — below the 0.95 auto-commit bar, so it goes to tier 3
    expect(t2.outcomes.filter((o) => o.status === "matched").length).toBe(0);
    expect(t2.residual.length).toBe(2);
    expect(t2.candidatePools.get("L1")?.[0]?.candidate.id).toBe("B1");
  });
  it("passes ambiguous records down with candidate pools", () => {
    const t1 = tier1Exact([
      rec("L1", "ledger", 100, "2026-06-01", "INV-1", "acme"),
      rec("B1", "bank", 100, "2026-06-20", "XYZ", "something else entirely"),
    ]);
    const t2 = tier2Fuzzy(t1.residual);
    expect(t2.residual.length).toBeGreaterThan(0);
    expect(t2.candidatePools.size).toBeGreaterThan(0);
  });
});
