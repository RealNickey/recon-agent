import { describe, expect, it, beforeEach } from "bun:test";
import {
  directVerifyDecimalMath,
  directVerifyTaxMdrRail,
  directVerifyFxCorridor,
  directVerifySettlementTiming,
  createReconTools,
} from "./recon-tools";
import {
  verifyUntrustedProposal,
  createReconciliationToolLoopAgent,
  executeAgentBatchReconciliation,
  CONFIDENCE_FLOOR,
  MAX_AGENT_STEPS,
} from "./agentic-orchestrator";
import {
  startSpan,
  enrichSpan,
  endSpan,
  withSpan,
  getRecordedSpans,
  clearRecordedSpans,
  createReconTelemetry,
} from "./telemetry";
import type { FinRecord } from "../types";
import type { Candidate } from "./tier2-fuzzy";

describe("Deterministic Grounded Recon Tools", () => {
  describe("verifyDecimalMath", () => {
    it("verifies 1:1 exact decimal equality with zero float error", () => {
      const res = directVerifyDecimalMath({
        targetAmount: 1000.05,
        candidateAmounts: [1000.05],
        tolerance: 0.05,
      });
      expect(res.valid).toBe(true);
      expect(res.delta).toBe(0);
      expect(res.candidateSum).toBe(1000.05);
    });

    it("verifies multi-item subset sum for batch deposits", () => {
      const res = directVerifyDecimalMath({
        targetAmount: 5000.0,
        candidateAmounts: [1500.0, 2000.0, 1500.0],
        tolerance: 0.05,
      });
      expect(res.valid).toBe(true);
      expect(res.candidateSum).toBe(5000.0);
      expect(res.delta).toBe(0);
    });

    it("rejects amount mismatch exceeding tolerance", () => {
      const res = directVerifyDecimalMath({
        targetAmount: 5000.0,
        candidateAmounts: [1500.0, 2000.0, 1400.0],
        tolerance: 0.05,
      });
      expect(res.valid).toBe(false);
      expect(res.delta).toBe(100.0);
    });

    it("handles empty candidate list safely", () => {
      const res = directVerifyDecimalMath({
        targetAmount: 100.0,
        candidateAmounts: [],
      });
      expect(res.valid).toBe(false);
      expect(res.candidateSum).toBe(0);
    });
  });

  describe("verifyTaxMdrRail", () => {
    it("verifies Razorpay standard MDR (2.36% = 2% fee + 18% GST)", () => {
      const gross = 10000.0;
      const net = 9764.0; // 10000 - 2.36% = 9764
      const res = directVerifyTaxMdrRail({
        grossAmount: gross,
        netAmount: net,
        taxRail: "razorpay_mdr_2_36",
      });
      expect(res.valid).toBe(true);
      expect(res.withholdingOrFee).toBeCloseTo(236.0, 1);
    });

    it("verifies Section 194J Indian statutory TDS (10% professional)", () => {
      const gross = 50000.0;
      const net = 45000.0; // 50000 - 10% = 45000
      const res = directVerifyTaxMdrRail({
        grossAmount: gross,
        netAmount: net,
        taxRail: "section_194j_tds_10",
      });
      expect(res.valid).toBe(true);
      expect(res.withholdingOrFee).toBe(5000.0);
    });

    it("verifies Section 194C contractor TDS (1% and 2%)", () => {
      const gross = 100000.0;
      const net1 = 99000.0;
      const res1 = directVerifyTaxMdrRail({
        grossAmount: gross,
        netAmount: net1,
        taxRail: "section_194c_tds_1",
      });
      expect(res1.valid).toBe(true);

      const net2 = 98000.0;
      const res2 = directVerifyTaxMdrRail({
        grossAmount: gross,
        netAmount: net2,
        taxRail: "section_194c_tds_2",
      });
      expect(res2.valid).toBe(true);
    });

    it("auto-detects applicable Indian statutory schedule", () => {
      const res = directVerifyTaxMdrRail({
        grossAmount: 10000.0,
        netAmount: 9764.0,
        taxRail: "auto_detect",
      });
      expect(res.valid).toBe(true);
      expect(res.ruleApplied).toContain("MDR");
    });

    it("rejects non-statutory arbitrary deductions", () => {
      const res = directVerifyTaxMdrRail({
        grossAmount: 10000.0,
        netAmount: 8200.0, // 18% arbitrary deduction without rule
        taxRail: "auto_detect",
      });
      expect(res.valid).toBe(false);
    });
  });

  describe("verifyFxCorridor", () => {
    it("verifies EUR/USD currency corridor within rate bounds and settlement window", () => {
      const res = directVerifyFxCorridor({
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        baseAmount: 1000.0,
        quoteAmount: 1080.0,
        valueDateBase: "2026-03-01",
        valueDateQuote: "2026-03-03",
        maxDaysDrift: 5,
      });
      expect(res.valid).toBe(true);
      expect(res.corridorSupported).toBe(true);
      expect(res.dateCheckPassed).toBe(true);
      expect(res.dateDriftDays).toBe(2);
    });

    it("rejects cross-currency pair when date drift exceeds threshold", () => {
      const res = directVerifyFxCorridor({
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        baseAmount: 1000.0,
        quoteAmount: 1080.0,
        valueDateBase: "2026-03-01",
        valueDateQuote: "2026-03-20",
        maxDaysDrift: 5,
      });
      expect(res.valid).toBe(false);
      expect(res.dateCheckPassed).toBe(false);
      expect(res.dateDriftDays).toBe(19);
    });

    it("rejects unsupported FX corridor", () => {
      const res = directVerifyFxCorridor({
        baseCurrency: "BRL",
        quoteCurrency: "JPY",
        baseAmount: 1000.0,
        quoteAmount: 1000.0,
      });
      expect(res.valid).toBe(false);
      expect(res.corridorSupported).toBe(false);
    });
  });

  describe("verifySettlementTiming", () => {
    it("verifies value-date settlement within allowable window", () => {
      const res = directVerifySettlementTiming({
        dateA: "2026-03-01",
        dateB: "2026-03-15",
        maxDays: 30,
      });
      expect(res.valid).toBe(true);
      expect(res.daysBetween).toBe(14);
    });

    it("rejects value-date settlement exceeding window", () => {
      const res = directVerifySettlementTiming({
        dateA: "2026-03-01",
        dateB: "2026-04-15",
        maxDays: 30,
      });
      expect(res.valid).toBe(false);
      expect(res.daysBetween).toBe(45);
    });
  });

  describe("createReconTools tool definition", () => {
    it("creates all 4 AI SDK tool wrappers with input schemas", () => {
      const tools = createReconTools();
      expect(tools.verifyDecimalMath).toBeDefined();
      expect(tools.verifyTaxMdrRail).toBeDefined();
      expect(tools.verifyFxCorridor).toBeDefined();
      expect(tools.verifySettlementTiming).toBeDefined();
      expect(tools.direct).toBeDefined();
    });
  });
});

describe("Untrusted Proposal Verifier Sandbox", () => {
  const targetBank: FinRecord = {
    id: "B1001",
    source: "bank",
    date: "2026-03-10",
    amount: 1500.0,
    currency: "USD",
    description: "Deposit Acme Corp",
    reference: "INV-9901",
  };

  const candLedger: FinRecord = {
    id: "L1001",
    source: "ledger",
    date: "2026-03-09",
    amount: 1500.0,
    currency: "USD",
    description: "Invoice Acme Corp",
    reference: "INV-9901",
  };

  it("verifies valid 1:1 cross-source matching proposal", () => {
    const res = verifyUntrustedProposal(targetBank, [candLedger]);
    expect(res.valid).toBe(true);
    expect(res.evidence.length).toBeGreaterThan(0);
    expect(res.reason).toContain("Deterministic 1:1 Decimal amount verified");
  });

  it("rejects single-source proposals (both ledger)", () => {
    const ledger2: FinRecord = {
      id: "L1002",
      source: "ledger",
      date: "2026-03-09",
      amount: 1500.0,
      currency: "USD",
      description: "Invoice Acme Corp",
      reference: "INV-9901",
    };
    const res = verifyUntrustedProposal(candLedger, [ledger2]);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Single-source match rejected");
  });

  it("rejects sign mismatch between target and candidate", () => {
    const candNegative: FinRecord = {
      ...candLedger,
      amount: -1500.0,
    };
    const res = verifyUntrustedProposal(targetBank, [candNegative]);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Sign mismatch");
  });

  it("rejects proposal when settlement window exceeds 30 days", () => {
    const staleCand: FinRecord = {
      ...candLedger,
      date: "2026-01-01",
    };
    const res = verifyUntrustedProposal(targetBank, [staleCand]);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Settlement window exceeded");
  });

  it("verifies many-to-one subset sum group", () => {
    const split1: FinRecord = {
      id: "L2001",
      source: "ledger",
      date: "2026-03-08",
      amount: 1000.0,
      currency: "USD",
      description: "Part 1 Acme",
      reference: "INV-9901-A",
    };
    const split2: FinRecord = {
      id: "L2002",
      source: "ledger",
      date: "2026-03-09",
      amount: 500.0,
      currency: "USD",
      description: "Part 2 Acme",
      reference: "INV-9901-B",
    };

    const res = verifyUntrustedProposal(targetBank, [split1, split2]);
    expect(res.valid).toBe(true);
    expect(res.reason).toContain("subset sum verified (2 items)");
  });

  it("rejects many-to-one subset sum with incorrect sum", () => {
    const split1: FinRecord = {
      id: "L2001",
      source: "ledger",
      date: "2026-03-08",
      amount: 1000.0,
      currency: "USD",
      description: "Part 1 Acme",
      reference: "INV-9901-A",
    };
    const split2: FinRecord = {
      id: "L2002",
      source: "ledger",
      date: "2026-03-09",
      amount: 400.0, // Total 1400 != 1500
      currency: "USD",
      description: "Part 2 Acme",
      reference: "INV-9901-B",
    };

    const res = verifyUntrustedProposal(targetBank, [split1, split2]);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Subset sum failed");
  });
});

describe("OpenTelemetry GenAI Telemetry & Tracing", () => {
  beforeEach(() => {
    clearRecordedSpans();
  });

  it("creates, enriches, and records OpenTelemetry spans", () => {
    const span = startSpan("test.recon_operation", {
      "recon.run_id": "test_run_123",
      "recon.record_id": "B1001",
      "recon.source": "bank",
      "recon.amount": 1500.0,
      "recon.currency": "USD",
      "recon.tier": 3,
    });

    expect(span.spanId).toBeDefined();
    expect(span.traceId).toBeDefined();
    expect(span.attributes["recon.run_id"]).toBe("test_run_123");

    enrichSpan(span.spanId, {
      "recon.decision": "verified_match",
      "recon.tool.name": "verifyDecimalMath",
      "recon.tool.execution_ms": 1.25,
      "gen_ai.request.model": "groq/llama-3.3-70b-versatile",
      "gen_ai.usage.total_tokens": 340,
    });

    const ended = endSpan(span.spanId, "ok");
    expect(ended).toBeDefined();
    expect(ended?.status).toBe("ok");
    expect(ended?.durationMs).toBeGreaterThanOrEqual(0);
    expect(ended?.attributes["recon.decision"]).toBe("verified_match");

    const recorded = getRecordedSpans();
    expect(recorded.length).toBe(1);
    expect(recorded[0]?.name).toBe("test.recon_operation");
    expect(recorded[0]?.attributes["gen_ai.usage.total_tokens"]).toBe(340);
  });

  it("withSpan wraps execution and handles error spans", async () => {
    await withSpan(
      "test.successful_task",
      { "recon.run_id": "run_abc" },
      async (span) => {
        expect(span.name).toBe("test.successful_task");
      }
    );

    const spans = getRecordedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]?.status).toBe("ok");

    await expect(
      withSpan(
        "test.failing_task",
        { "recon.run_id": "run_abc" },
        async () => {
          throw new Error("Simulated failure in test");
        }
      )
    ).rejects.toThrow("Simulated failure in test");

    const spansAfterError = getRecordedSpans();
    expect(spansAfterError.length).toBe(2);
    expect(spansAfterError[1]?.status).toBe("error");
    expect(spansAfterError[1]?.error).toBe("Simulated failure in test");
  });

  it("createReconTelemetry implements AI SDK Telemetry interface hooks", () => {
    const telemetry = createReconTelemetry({ runId: "test_run_tel" });
    expect(telemetry.onStart).toBeDefined();
    expect(telemetry.onStepStart).toBeDefined();
    expect(telemetry.onToolExecutionStart).toBeDefined();
    expect(telemetry.onToolExecutionEnd).toBeDefined();
    expect(telemetry.onStepEnd).toBeDefined();
    expect(telemetry.onEnd).toBeDefined();
    expect(telemetry.onError).toBeDefined();
  });
});

describe("ToolLoopAgent & Agentic Batch Orchestration", () => {
  it("exports configuration invariants (CONFIDENCE_FLOOR=0.7, MAX_AGENT_STEPS=5)", () => {
    expect(CONFIDENCE_FLOOR).toBe(0.7);
    expect(MAX_AGENT_STEPS).toBe(5);
  });

  it("executes offline fail-safe batch reconciliation with zero network I/O", async () => {
    const target: FinRecord = {
      id: "B5001",
      source: "bank",
      date: "2026-03-12",
      amount: 2500.0,
      currency: "USD",
      description: "Vendor Payout",
      reference: "PO-8821",
    };

    const cand: FinRecord = {
      id: "L5001",
      source: "ledger",
      date: "2026-03-11",
      amount: 2500.0,
      currency: "USD",
      description: "Vendor Payout",
      reference: "PO-8821",
    };

    const candidateItem: Candidate = {
      candidate: cand,
      score: 0.95,
      why: "Exact amount, 1 day drift, shared PO reference",
    };

    const batchPayload = [
      {
        targetRecord: target,
        candidates: [candidateItem],
      },
    ];

    const result = await executeAgentBatchReconciliation(batchPayload, "logs/reasoning-trace.jsonl", { forceOffline: true });
    expect(result.decisions.length).toBe(1);
    expect(result.decisions[0]?.targetRecordId).toBe("B5001");
    // Offline fail-safe emits verified honest exception with zero network I/O
    expect(result.decisions[0]?.matchedIds).toBeNull();
    expect(result.decisions[0]?.confidence).toBeLessThan(0.7);
    expect(result.calls).toBe(0); // Zero network I/O in offline mode
  });
});
