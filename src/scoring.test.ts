import { describe, expect, it } from "bun:test";
import { claimedMatchGroups, scoreRun } from "./scoring";
import type { GroundTruth, RunResult, Outcome } from "./types";

const truth = (pairs: GroundTruth["pairs"]): GroundTruth => ({
  meta: { seed: 0, generatedAt: "2026-01-01T00:00:00Z", counts: {} },
  pairs,
});

const run = (outcomes: Outcome[], extra: Partial<RunResult["stats"]> = {}): RunResult => ({
  startedAt: "2026-01-01T00:00:00Z",
  finishedAt: "2026-01-01T00:00:01Z",
  durationMs: 1000,
  model: "none",
  outcomes,
  stats: {
    totalRecords: outcomes.length,
    matched: outcomes.filter((o) => o.status === "matched").length,
    exceptions: outcomes.filter((o) => o.status === "exception").length,
    tier3Calls: 0,
    tier3Tokens: 0,
    tier3CostUsd: 0,
    ...extra,
  },
});

const matched = (recordId: string, matchedIds: string[], source = "bank"): Outcome => ({
  status: "matched",
  recordId,
  source,
  matchedIds,
  confidence: 1,
  tier: 1,
});

const exception = (recordId: string, source = "ledger"): Outcome => ({
  status: "exception",
  recordId,
  source,
  reasonCode: "no_candidate_found",
  tier: 2,
  candidatesConsidered: 0,
});

describe("claimedMatchGroups", () => {
  it("includes counterpart ids even when they have no matched outcome (one-sided claim)", () => {
    const groups = claimedMatchGroups(run([matched("B1", ["L1"])]));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(["B1", "L1"]);
  });

  it("does not drop members of a many-to-one claim", () => {
    const groups = claimedMatchGroups(run([matched("B1", ["L1", "L2"])]));
    expect(groups[0]).toEqual(["B1", "L1", "L2"]);
  });
});

describe("scoreRun pair-level semantics", () => {
  it("scores a fully recovered 1:1 pair as correct", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" }]),
      run([matched("B1", ["L1"]), matched("L1", ["B1"], "ledger")])
    );
    expect(r.totalPairs).toBe(1);
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(0);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.fitness).toBe(1);
  });

  it("treats a one-sided but complete claim as correct (not a miss)", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" }]),
      run([matched("B1", ["L1"]), exception("L1")])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(0);
  });

  it("treats a correct-but-incomplete duplicate claim as a miss, not an FP", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1", "L2"], processorId: null, category: "duplicate" }]),
      run([matched("B1", ["L1"]), matched("L1", ["B1"], "ledger"), exception("L2")])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(0);
    expect(r.byCategory.duplicate?.missed).toBe(1);
    expect(r.recall).toBe(0);
    expect(r.fitness).toBe(0);
  });

  it("treats a wrong counterpart as a false positive", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" }]),
      run([matched("B1", ["L9"]), matched("L9", ["B1"], "ledger"), exception("L1")])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(1);
    expect(r.precision).toBe(0);
    expect(r.falsePositiveRate).toBe(1);
    expect(r.fitness).toBe(-2);
  });

  it("does not let record-level precision inflate a single pair-level FP", () => {
    const r = scoreRun(
      truth([
        { bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" },
        { bankId: "B2", ledgerIds: ["L2"], processorId: null, category: "exact" },
      ]),
      run([
        matched("B1", ["L1"]),
        matched("L1", ["B1"], "ledger"),
        matched("B2", ["L9"]),
        matched("L9", ["B2"], "ledger"),
        exception("L2"),
      ])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(1);
    expect(r.precision).toBe(0.5);
    expect(r.falsePositiveRate).toBe(0.5);
    expect(r.fitness).toBe(-0.5);
  });

  it("counts an unmatchable that got matched as one FP (pair-level, not per record)", () => {
    const r = scoreRun(
      truth([{ bankId: "B9", ledgerIds: [], processorId: null, category: "unmatchable" }]),
      run([matched("B9", ["L9"])])
    );
    expect(r.totalPairs).toBe(0);
    expect(r.falsePositives).toBe(1);
    expect(r.byCategory.unmatchable?.falsePos).toBe(1);
    expect(r.byCategory.unmatchable?.honest).toBe(0);
  });

  it("counts honest exceptions on unmatchable records", () => {
    const r = scoreRun(
      truth([{ bankId: null, ledgerIds: ["L9"], processorId: null, category: "unmatchable" }]),
      run([exception("L9")])
    );
    expect(r.falsePositives).toBe(0);
    expect(r.byCategory.unmatchable?.honest).toBe(1);
  });

  it("does not double-count a many-to-one FP across its members", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1", "L2"], processorId: null, category: "many_to_one" }]),
      run([
        matched("B1", ["L9"]),
        matched("L9", ["B1"], "ledger"),
        exception("L1"),
        exception("L2"),
      ])
    );
    expect(r.falsePositives).toBe(1);
    expect(r.byCategory.many_to_one?.falsePos).toBe(1);
  });

  it("counts a claimed group of entirely unknown ids as one FP", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" }]),
      run([matched("B1", ["L1"]), matched("X1", ["X2"]), matched("X2", ["X1"], "ledger")])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(1);
    expect(r.falsePositiveList.some((f) => f.category === "unknown_record")).toBe(true);
  });

  it("treats a mixed known/unknown claimed group as a wrong-counterpart FP", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" }]),
      run([matched("B1", ["UNKNOWN"]), exception("L1")])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(1);
  });

  it("does not require an outcome row for every claimed counterpart", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1", "L2"], processorId: null, category: "many_to_one" }]),
      run([matched("B1", ["L1", "L2"])])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(0);
  });

  it("counts one global FP when a single claimed group overlaps two truth pairs", () => {
    const r = scoreRun(
      truth([
        { bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" },
        { bankId: "B2", ledgerIds: ["L2"], processorId: null, category: "exact" },
      ]),
      run([matched("B1", ["L1", "B2", "L2"])])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(1);
    expect(r.byCategory.exact?.falsePos).toBe(2);
  });


  it("scores a one-to-many group that includes extraBankIds", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", extraBankIds: ["B2"], ledgerIds: ["L1"], processorId: null, category: "one_to_many" }]),
      run([matched("L1", ["B1", "B2"], "ledger")])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(0);
  });
  it("flags starved categories with zero correct pairs", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "timing_drift" }]),
      run([exception("B1", "bank"), exception("L1")])
    );
    expect(r.starvedCategories).toContain("timing_drift");
  });

  it("scores a many-to-one group only when the claimed set is bank + all ledgers", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1", "L2"], processorId: null, category: "many_to_one" }]),
      run([matched("B1", ["L1", "L2"]), matched("L1", ["B1", "L2"], "ledger"), matched("L2", ["B1", "L1"], "ledger")])
    );
    expect(r.correctPairs).toBe(1);
    expect(r.falsePositives).toBe(0);
  });

  it("does not count a ledger-only {L1, L2} claim as a correct many-to-one", () => {
    const r = scoreRun(
      truth([{ bankId: "B1", ledgerIds: ["L1", "L2"], processorId: null, category: "many_to_one" }]),
      run([matched("L1", ["L2"], "ledger"), matched("L2", ["L1"], "ledger"), exception("B1", "bank")])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(0);
    expect(r.byCategory.many_to_one?.missed).toBe(1);
  });

  it("treats two 1:1 truths unioned through a shared ledger as one FP and no correct pairs", () => {
    const r = scoreRun(
      truth([
        { bankId: "B1", ledgerIds: ["L1"], processorId: null, category: "exact" },
        { bankId: "B2", ledgerIds: ["L1"], processorId: null, category: "exact" },
      ]),
      run([
        matched("B1", ["L1"]),
        matched("L1", ["B1", "B2"], "ledger"),
        matched("B2", ["L1"]),
      ])
    );
    expect(r.correctPairs).toBe(0);
    expect(r.falsePositives).toBe(1);
    expect(r.byCategory.exact?.missed ?? 0).toBe(0);
    expect(r.byCategory.exact?.falsePos).toBe(2);
  });
});