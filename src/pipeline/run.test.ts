import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runPipeline } from "./run";

const DIR = join("results", "_test-pipeline");

function writeJson(name: string, rows: unknown) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, name), JSON.stringify(rows, null, 2));
}

describe("runPipeline robustness", () => {
  it("skips malformed records and still matches the valid pair", async () => {
    writeJson("bank-statement.json", [
      { id: "B1", source: "bank", date: "2026-06-01", amount: 100, currency: "USD", description: "acme", reference: "INV-1" },
      { id: "BAD", source: "bank", date: "not-a-date", amount: 100, currency: "USD", description: "x", reference: "INV-9" },
      { id: "B1", source: "bank", date: "2026-06-01", amount: 100, currency: "USD", description: "dup id", reference: "INV-1" },
    ]);
    writeJson("internal-ledger.json", [
      { id: "L1", source: "ledger", date: "2026-06-01", amount: 100, currency: "USD", description: "acme", reference: "INV-1" },
      { id: "Lbad", source: "ledger", date: "2026-06-01", amount: "nope", currency: "USD", description: "x", reference: "INV-8" },
    ]);
    writeJson("processor-export.json", []);
    const out = join(DIR, "out.json");
    const r = await runPipeline(DIR, out, false);
    expect(r.stats.skippedInvalid).toBeGreaterThanOrEqual(2);
    expect(r.stats.matched).toBe(2);
    expect(r.outcomes).toHaveLength(2);
    rmSync(DIR, { recursive: true, force: true });
  });

  it("emits an exception for every leftover record when AI is off", async () => {
    writeJson("bank-statement.json", [
      { id: "B9", source: "bank", date: "2026-06-01", amount: 50, currency: "USD", description: "lonely", reference: "ZZZ" },
    ]);
    writeJson("internal-ledger.json", []);
    writeJson("processor-export.json", []);
    const out = join(DIR, "out2.json");
    const r = await runPipeline(DIR, out, false);
    expect(r.stats.exceptions).toBe(1);
    expect(r.outcomes[0]?.status).toBe("exception");
    rmSync(DIR, { recursive: true, force: true });
  });

  it("emits exactly one outcome per valid input record", async () => {
    writeJson("bank-statement.json", [
      { id: "B1", source: "bank", date: "2026-06-01", amount: 100, currency: "USD", description: "acme", reference: "INV-1" },
      { id: "B2", source: "bank", date: "2026-06-02", amount: 50, currency: "USD", description: "lonely", reference: "ZZZ" },
    ]);
    writeJson("internal-ledger.json", [
      { id: "L1", source: "ledger", date: "2026-06-01", amount: 100, currency: "USD", description: "acme", reference: "INV-1" },
    ]);
    writeJson("processor-export.json", []);
    const out = join(DIR, "out3.json");
    const r = await runPipeline(DIR, out, false);
    const ids = r.outcomes.map((o) => o.recordId).sort();
    expect(ids).toEqual(["B1", "B2", "L1"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.stats.matched + r.stats.exceptions).toBe(r.stats.totalRecords);
    rmSync(DIR, { recursive: true, force: true });
  });
});
