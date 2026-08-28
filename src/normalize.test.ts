import { describe, expect, it } from "bun:test";
import { normalizeRef, invoiceToken, sameInvoice, amountsClose, amountKey, daysBetween, stringSim, tokenSim, subsetSum, subsetSumUnique, amountAbsTol, vendorOverlap } from "./normalize";

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

describe("invoiceToken / sameInvoice", () => {
  it("treats trailing amendment letters as the same invoice", () => {
    expect(sameInvoice("INV-96034-A", "INV-96034")).toBe(true);
    expect(invoiceToken("INV-96034-A")).toBe("96034");
  });
  it("does not collapse distinct invoice numbers", () => {
    expect(sameInvoice("INV-1002", "INV-1003")).toBe(false);
    expect(sameInvoice("INV-96034", "INV-96035")).toBe(false);
  });
  it("aligns common payment prefixes", () => {
    expect(sameInvoice("PMT-1002", "INV-1002")).toBe(true);
  });
  it("does not match empty or alpha-only junk", () => {
    expect(sameInvoice("", "INV-1002")).toBe(false);
    expect(sameInvoice("hello", "world")).toBe(false);
  });
});

describe("amountKey", () => {
  it("uses Decimal rounding instead of Number.toFixed", () => {
    expect(amountKey(1.005)).toBe("1.01");
    expect(Number(1.005).toFixed(2)).toBe("1.00");
    expect(amountKey(1)).toBe("1.00");
    expect(amountKey(100.1)).toBe("100.10");
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
  it("invalid dates are infinitely far", () => {
    expect(daysBetween("not-a-date", "2026-06-01")).toBe(Number.POSITIVE_INFINITY);
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
  it("vendorOverlap ignores stopwords", () => {
    expect(vendorOverlap("Acme Corp payment", "Acme invoice")).toBeGreaterThan(0.9);
    expect(vendorOverlap("Acme Corp payment", "Globex Ltd payment")).toBe(0);
  });
});

describe("subsetSum", () => {
  it("finds a 2-part combination", () => {
    const hit = subsetSum(
      [
        { id: "a", amount: 10 },
        { id: "b", amount: 20 },
        { id: "c", amount: 40 },
      ],
      30
    );
    expect(hit?.sort()).toEqual(["a", "b"]);
  });
  it("prefers fewer items when two k>=2 solutions exist", () => {
    const hit = subsetSum(
      [
        { id: "a", amount: 10 },
        { id: "b", amount: 20 },
        { id: "c", amount: 12 },
        { id: "d", amount: 8 },
      ],
      30
    );
    expect(hit?.sort()).toEqual(["a", "b"]);
  });
  it("returns null when nothing sums to target", () => {
    expect(subsetSum([{ id: "a", amount: 10 }, { id: "b", amount: 20 }], 15)).toBeNull();
  });
  it("refuses oversized candidate sets", () => {
    const items = Array.from({ length: 19 }, (_, i) => ({ id: `x${i}`, amount: 1 }));
    expect(subsetSum(items, 2)).toBeNull();
  });
  it("does not treat a single item as a subset-sum match", () => {
    expect(subsetSum([{ id: "a", amount: 30 }, { id: "b", amount: 10 }], 30)).toBeNull();
  });
});

describe("subsetSumUnique / amountAbsTol", () => {
  it("returns the only reconstructing subset", () => {
    expect(subsetSumUnique(
      [{ id: "a", amount: 40 }, { id: "b", amount: 60 }, { id: "c", amount: 15 }],
      100
    )?.sort()).toEqual(["a", "b"]);
  });
  it("returns null when two subsets both sum", () => {
    expect(subsetSumUnique(
      [{ id: "a", amount: 40 }, { id: "b", amount: 60 }, { id: "c", amount: 30 }, { id: "d", amount: 70 }],
      100
    )).toBeNull();
  });
  it("scales absolute tolerance with target magnitude", () => {
    expect(amountAbsTol(10)).toBe(0.05);
    expect(amountAbsTol(100)).toBe(0.1);
    expect(amountAbsTol(1_000_000)).toBe(1000);
  });
  it("accepts a large-amount reconstruction within 0.1%", () => {
    const hit = subsetSumUnique(
      [
        { id: "a", amount: 1281019.4 },
        { id: "b", amount: 1314.2 },
      ],
      1282509.69,
      amountAbsTol(1282509.69)
    );
    expect(hit?.sort()).toEqual(["a", "b"]);
  });
});

describe("extractRefTokens & Indian Payment Rails", () => {
  const { extractRefTokens, checkIndianTaxMdrSchedule, isValidFxCorridor } = require("./normalize");

  it("extracts UPI VPA identifiers", () => {
    const tokens = extractRefTokens("UPI-TXN-999", "Payment from user@okhdfcbank for INV-10023");
    expect(tokens.has("user@okhdfcbank")).toBe(true);
    expect(tokens.has("10023")).toBe(true);
  });

  it("extracts Indian NEFT/RTGS UTR numbers and IMPS RRNs", () => {
    const tokens = extractRefTokens("BANK-STMT", "NEFT transfer HDFCR52026060100012345 RRN: 623412345678");
    expect(tokens.has("HDFCR52026060100012345")).toBe(true);
    expect(tokens.has("623412345678")).toBe(true);
  });

  it("extracts Razorpay order and payment IDs", () => {
    const tokens = extractRefTokens("order_123456", "Payment fee for pay_987654");
    expect(tokens.has("order_123456")).toBe(true);
    expect(tokens.has("pay_987654")).toBe(true);
  });

  it("extracts credit notes and refund tokens", () => {
    const tokens = extractRefTokens("CN-88776", "Refund reversal for REFUND-88776");
    expect(tokens.has("88776")).toBe(true);
  });

  it("identifies Indian MDR and TDS tax withholding schedules (standard and compound)", () => {
    // Razorpay standard MDR (2.36% net deduction on 10,000)
    const mdr = checkIndianTaxMdrSchedule(10000, 9764);
    expect(mdr?.matched).toBe(true);
    expect(mdr?.rule).toContain("Razorpay Standard MDR");

    // Section 194J TDS 10% on 50,000 = 45,000 net
    const tds = checkIndianTaxMdrSchedule(50000, 45000);
    expect(tds?.matched).toBe(true);
    expect(tds?.rule).toContain("194J");

    // Compound MDR (2.36%) + TDS 194J (10%) = 12.36% deduction on 100,000 = 87,640 net
    const compound = checkIndianTaxMdrSchedule(100000, 87640);
    expect(compound?.matched).toBe(true);
    expect(compound?.rule).toContain("Compound Razorpay MDR (2.36%) + Section 194J TDS");
  });

  it("validates cross-currency FX corridors with bid-ask bounds", () => {
    expect(isValidFxCorridor("EUR", "USD", 1000, 1080)).toBe(true);
    expect(isValidFxCorridor("GBP", "USD", 1000, 1280)).toBe(true);
    expect(isValidFxCorridor("USD", "INR", 1000, 83500)).toBe(true);
    expect(isValidFxCorridor("EUR", "INR", 1000, 90500)).toBe(true);
    expect(isValidFxCorridor("USD", "INR", 1000, 20000)).toBe(false); // rate 20 is invalid
    expect(isValidFxCorridor("USD", "USD", 1000, 1000)).toBe(false); // same currency
  });
});