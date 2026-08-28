import { describe, expect, it } from "bun:test";
import { generateAdversarialDataset } from "../scripts/generate-adversarial";
import { UNMATCHABLE_CATEGORIES, scoreRun } from "./scoring";
import { tier1Exact } from "./pipeline/tier1-exact";
import { tier2Fuzzy } from "./pipeline/tier2-fuzzy";
import { buildExceptionOutcome } from "./pipeline/run";
import type { FinRecord, GroundTruth, Outcome, RunResult } from "./types";

describe("Adversarial Evaluation Suite & Honest Exceptions", () => {
  it("generates all 5 frontier adversarial scenarios with documented true exceptions", () => {
    const dataset = generateAdversarialDataset(2026);
    const categories = new Set(dataset.truth.map((p) => p.category));

    // 1. Verify all 5 categories are generated
    expect(categories.has("collision_near_duplicate")).toBe(true);
    expect(categories.has("partial_refund_fee_drift")).toBe(true);
    expect(categories.has("currency_fx")).toBe(true);
    expect(categories.has("multi_currency_split")).toBe(true);
    expect(categories.has("suspense_distractor")).toBe(true);

    // 2. Verify >= 3 to 5 true exceptions exist
    const unmatchablePairs = dataset.truth.filter((p) => UNMATCHABLE_CATEGORIES.has(p.category));
    expect(unmatchablePairs.length).toBeGreaterThanOrEqual(5);
  });

  it("produces exceptions with field-level diffs, candidate pool analysis, and calibrated confidence", () => {
    const dataset = generateAdversarialDataset(2026);
    const allRecords = [...dataset.bank, ...dataset.ledger, ...dataset.processor];
    const t1 = tier1Exact(allRecords);
    const t2 = tier2Fuzzy(t1.residual);

    const outcomes: Outcome[] = [...t1.outcomes, ...t2.outcomes];
    for (const r of t2.residual) {
      outcomes.push(buildExceptionOutcome(r, t2.candidatePools.get(r.id) ?? [], 2));
    }

    const exceptions = outcomes.filter((o) => o.status === "exception");
    expect(exceptions.length).toBeGreaterThanOrEqual(5);

    for (const exc of exceptions) {
      expect(exc.status).toBe("exception");
      expect(exc.tier).toBeGreaterThanOrEqual(1);
      expect(typeof exc.candidatesConsidered).toBe("number");
      expect(exc.auditTrail).toBeDefined();
      expect(exc.auditTrail?.confidence).toBeLessThan(0.70);
      expect(exc.auditTrail?.evidence).toBeDefined();
      expect(exc.auditTrail?.evidence.length).toBeGreaterThan(0);

      // Verify field-level diff format
      for (const ev of exc.auditTrail!.evidence) {
        expect(ev.field).toBeDefined();
        expect(ev.recordAVal !== undefined).toBe(true);
        expect(ev.recordBVal !== undefined).toBe(true);
        expect(typeof ev.similarity).toBe("number");
        expect(typeof ev.explanation).toBe("string");
      }
    }
  });

  it("evaluates honest exceptions without false positive penalties", () => {
    const dataset = generateAdversarialDataset(2026);
    const allRecords = [...dataset.bank, ...dataset.ledger, ...dataset.processor];
    const t1 = tier1Exact(allRecords);
    const t2 = tier2Fuzzy(t1.residual);

    const outcomes: Outcome[] = [...t1.outcomes, ...t2.outcomes];
    for (const r of t2.residual) {
      outcomes.push(buildExceptionOutcome(r, t2.candidatePools.get(r.id) ?? [], 2));
    }

    const runResult: RunResult = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 40,
      model: "deterministic-tiers",
      outcomes,
      stats: {
        totalRecords: allRecords.length,
        matched: outcomes.filter((o) => o.status === "matched").length,
        exceptions: outcomes.filter((o) => o.status === "exception").length,
        tier3Calls: 0,
        tier3Tokens: 0,
        tier3CostUsd: 0,
      },
    };

    const groundTruth: GroundTruth = {
      meta: { seed: 2026, generatedAt: new Date().toISOString(), counts: {} },
      pairs: dataset.truth,
    };

    const report = scoreRun(groundTruth, runResult, {
      dataset: "adversarial-test",
    });

    // Zero false positives on honest exceptions
    expect(report.falsePositives).toBe(0);
    expect(report.falsePositiveRate).toBe(0);
    expect(report.fitness).toBe(1.0);
    expect(report.recall).toBe(1.0);

    // Verify honest counts for unmatchable categories
    expect(report.byCategory.collision_near_duplicate?.honest).toBeGreaterThan(0);
    expect(report.byCategory.partial_refund_fee_drift?.honest).toBeGreaterThan(0);
    expect(report.byCategory.multi_currency_split?.honest).toBeGreaterThan(0);
    expect(report.byCategory.suspense_distractor?.honest).toBeGreaterThan(0);
  });

  it("penalizes false matches on adversarial unmatchable records with -2x FPR penalty", () => {
    const dataset = generateAdversarialDataset(2026);
    const allRecords = [...dataset.bank, ...dataset.ledger, ...dataset.processor];
    const t1 = tier1Exact(allRecords);
    const t2 = tier2Fuzzy(t1.residual);

    const outcomes: Outcome[] = [...t1.outcomes, ...t2.outcomes];
    for (const r of t2.residual) {
      outcomes.push(buildExceptionOutcome(r, t2.candidatePools.get(r.id) ?? [], 2));
    }

    // Find an unmatchable suspense bank record
    const suspenseTruth = dataset.truth.find((p) => p.category === "suspense_distractor" && p.bankId);
    expect(suspenseTruth).toBeDefined();
    const suspenseBankId = suspenseTruth!.bankId!;

    // Find an unmatchable suspense ledger record
    const suspenseLedgerTruth = dataset.truth.find((p) => p.category === "suspense_distractor" && p.ledgerIds.length > 0);
    expect(suspenseLedgerTruth).toBeDefined();
    const suspenseLedgerId = suspenseLedgerTruth!.ledgerIds[0]!;

    // Artificially create a false positive match between the unmatchables
    const falseOutcomes = outcomes.map((o) => {
      if (o.recordId === suspenseBankId) {
        return {
          status: "matched" as const,
          recordId: suspenseBankId,
          source: "bank",
          matchedIds: [suspenseLedgerId],
          confidence: 0.90,
          tier: 2 as const,
          reasonCode: "exact_match" as const,
          reasoning: "hallucinated false match",
        };
      }
      if (o.recordId === suspenseLedgerId) {
        return {
          status: "matched" as const,
          recordId: suspenseLedgerId,
          source: "ledger",
          matchedIds: [suspenseBankId],
          confidence: 0.90,
          tier: 2 as const,
          reasonCode: "exact_match" as const,
          reasoning: "hallucinated false match",
        };
      }
      return o;
    });

    const runResult: RunResult = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 40,
      model: "deterministic-tiers",
      outcomes: falseOutcomes,
      stats: {
        totalRecords: allRecords.length,
        matched: falseOutcomes.filter((o) => o.status === "matched").length,
        exceptions: falseOutcomes.filter((o) => o.status === "exception").length,
        tier3Calls: 0,
        tier3Tokens: 0,
        tier3CostUsd: 0,
      },
    };

    const groundTruth: GroundTruth = {
      meta: { seed: 2026, generatedAt: new Date().toISOString(), counts: {} },
      pairs: dataset.truth,
    };

    const report = scoreRun(groundTruth, runResult, {
      dataset: "adversarial-test-with-fp",
    });

    // Verify FP was penalized
    expect(report.falsePositives).toBeGreaterThan(0);
    expect(report.falsePositiveRate).toBeGreaterThan(0);
    expect(report.fitness).toBeLessThan(1.0);
  });
});
