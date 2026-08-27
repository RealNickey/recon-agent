import { describe, expect, it } from "bun:test";
import { normalizeRef, amountsClose, daysBetween, stringSim, tokenSim } from "./normalize";

describe("normalizeRef", () => {
  it("strips prefixes, separators, case", () => {
    expect(normalizeRef("INV-1002")).toBe("1002");
    expect(normalizeRef("inv 1002")).toBe("1002");
    expect(normalizeRef("INV1002")).toBe("1002");
    expect(normalizeRef("1002")).toBe("1002");
  });
  it("keeps distinct ids distinct", () => {
    expect(normalizeRef("INV-1002")).not.toBe(normalizeRef("INV-1003"));
  });
});

describe("amountsClose", () => {
  it("absolute tolerance", () => {
    expect(amountsClose(100, 100.04)).toBe(true);
    expect(amountsClose(100, 100.06)).toBe(false);
  });
  it("percentage tolerance", () => {
    expect(amountsClose(1000, 1004, 0.05, 0.005)).toBe(true);
    expect(amountsClose(1000, 1006, 0.05, 0.005)).toBe(false);
  });
  it("decimal-safe (no float dust)", () => {
    expect(amountsClose(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe("daysBetween", () => {
  it("T+2 drift", () => {
    expect(daysBetween("2026-06-01", "2026-06-03")).toBe(2);
  });
});

describe("similarity", () => {
  it("stringSim identical vs different", () => {
    expect(stringSim("acme corp payment", "acme corp payment")).toBe(1);
    expect(stringSim("acme corp", "globex ltd")).toBeLessThan(0.5);
  });
  it("tokenSim handles word reorder", () => {
    expect(tokenSim("payment acme corp invoice", "acme corp invoice payment")).toBe(1);
  });
});
