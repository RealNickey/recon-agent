import { describe, expect, it } from "bun:test";
import { selectReconstructingA, fingerprintRecord } from "./benchrec-select";

describe("selectReconstructingA", () => {
  it("keeps a 1:1 amount match and drops extras that do not sum", () => {
    const hit = selectReconstructingA(100, [
      { amount: 100, id: "keep" },
      { amount: 40, id: "extra" },
      { amount: 70, id: "other" },
    ]);
    expect(hit).toEqual([{ amount: 100, id: "keep" }]);
  });

  it("returns a 2-part subset that sums to the bank amount", () => {
    const hit = selectReconstructingA(100, [
      { amount: 40, id: "a" },
      { amount: 60, id: "b" },
      { amount: 15, id: "noise" },
    ]);
    expect(hit?.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("returns null when nothing reconstructs the bank amount", () => {
    expect(selectReconstructingA(100, [{ amount: 40, id: "a" }, { amount: 70, id: "b" }])).toBeNull();
    expect(selectReconstructingA(100, [])).toBeNull();
  });

  it("prefers a single exact counterpart over a longer subset", () => {
    const hit = selectReconstructingA(100, [
      { amount: 100, id: "exact" },
      { amount: 40, id: "a" },
      { amount: 60, id: "b" },
    ]);
    expect(hit).toEqual([{ amount: 100, id: "exact" }]);
  });

  it("takes only one of several exact-amount copies", () => {
    const hit = selectReconstructingA(50, [
      { amount: 50, id: "a" },
      { amount: 50, id: "b" },
    ]);
    expect(hit).toHaveLength(1);
  });

  it("accepts a large-amount 1:1 within 0.1%", () => {
    const hit = selectReconstructingA(8187608.62, [{ amount: 8187571.15, id: "close" }]);
    expect(hit).toHaveLength(1);
  });
});

describe("fingerprintRecord", () => {
  it("collapses identical amount/date/currency/ref/desc rows", () => {
    const a = fingerprintRecord({ amount: 1.5, date: "2023-01-01", currency: "USD", reference: "R", description: "d" });
    const b = fingerprintRecord({ amount: 1.5, date: "2023-01-01", currency: "USD", reference: "R", description: "d" });
    expect(a).toBe(b);
  });
});
