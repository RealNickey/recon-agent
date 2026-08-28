import { describe, expect, it } from "bun:test";
import {
  createControllerTools,
  askFinanceController,
  approveOrRejectActionToken,
  pendingActionApprovals,
} from "./controller-agent";
import type { FinRecord, RunResult } from "../types";
import app from "../index";

const mockRecords: FinRecord[] = [
  { id: "B101", source: "bank", date: "2026-06-01", amount: 1000.0, currency: "USD", description: "Deposit Acme Corp", reference: "INV-101" },
  { id: "L101", source: "ledger", date: "2026-06-01", amount: 1000.0, currency: "USD", description: "Acme Invoice 101", reference: "INV-101" },
  { id: "B102", source: "bank", date: "2026-06-02", amount: 488.2, currency: "INR", description: "Razorpay Payout Net", reference: "RZP-PAY-1" },
  { id: "L102", source: "ledger", date: "2026-06-02", amount: 500.0, currency: "INR", description: "Gross Customer Payment", reference: "INV-102" },
  { id: "B103", source: "bank", date: "2026-06-03", amount: 2500.0, currency: "USD", description: "Unmatched Wire Deposit", reference: "WIRE-999" },
  { id: "L103", source: "ledger", date: "2026-06-10", amount: 2500.0, currency: "USD", description: "Delayed Ledger Booking", reference: "PO-777" },
];

const mockRunResult: RunResult = {
  startedAt: "2026-06-01T00:00:00.000Z",
  finishedAt: "2026-06-01T00:00:01.000Z",
  durationMs: 120,
  model: "offline-deterministic",
  stats: {
    totalRecords: 6,
    matched: 2,
    exceptions: 4,
    skippedInvalid: 0,
    tier3Calls: 0,
    tier3Tokens: 0,
    tier3CostUsd: 0,
  },
  cashPosition: {
    USD: {
      currency: "USD",
      reconciledAmount: 1000.0,
      unreconciledAmount: 2500.0,
      netPosition: 3500.0,
      bankBalance: 3500.0,
      internalLedgerBalance: 3500.0,
      processorNodalBalance: 0,
      taxWithheldMdr: 0,
      inTransitVariance: 2500.0,
      reconciledCount: 1,
      unreconciledCount: 2,
      reconciliationRate: 0.5,
      brs: {
        currency: "USD",
        openingBankBalance: 0,
        clearedDeposits: 1000.0,
        clearedDisbursements: 0,
        closingBankBalance: 3500.0,
        unreconciledInTransitDeposits: 2500.0,
        unreconciledOutstandingPayments: 0,
        subledgerBalance: 3500.0,
        processorNodalBalance: 0,
        statutoryAccrualsMdrTds: 0,
        netVariance: 2500.0,
      },
    },
    INR: {
      currency: "INR",
      reconciledAmount: 488.2,
      unreconciledAmount: 0,
      netPosition: 488.2,
      bankBalance: 488.2,
      internalLedgerBalance: 500.0,
      processorNodalBalance: 500.0,
      taxWithheldMdr: 11.8,
      inTransitVariance: 0,
      reconciledCount: 2,
      unreconciledCount: 0,
      reconciliationRate: 1.0,
    },
  },
  outcomes: [
    {
      status: "matched",
      recordId: "B101",
      source: "bank",
      matchedIds: ["L101"],
      confidence: 1.0,
      tier: 1,
      reasonCode: "exact_match",
      reasoning: "Normalized ref and Decimal amount matched exactly",
      auditTrail: {
        tier: 1,
        ruleTriggered: "Tier 1 Exact Hash Match",
        confidence: 1.0,
        evidence: [
          { field: "amount", recordAVal: 1000, recordBVal: 1000, similarity: 1.0, explanation: "Exact amount" },
          { field: "reference", recordAVal: "INV-101", recordBVal: "INV-101", similarity: 1.0, explanation: "Exact reference" },
        ],
      },
    },
    {
      status: "matched",
      recordId: "L101",
      source: "ledger",
      matchedIds: ["B101"],
      confidence: 1.0,
      tier: 1,
      reasonCode: "exact_match",
      reasoning: "Normalized ref and Decimal amount matched exactly",
    },
    {
      status: "exception",
      recordId: "B102",
      source: "bank",
      reasonCode: "amount_variance",
      tier: 2,
      candidatesConsidered: 1,
      reasoning: "Razorpay MDR 2.36% fee variance",
      auditTrail: {
        tier: 2,
        ruleTriggered: "Tier 2 Fee Variance",
        confidence: 0.65,
        evidence: [],
      },
    },
    {
      status: "exception",
      recordId: "L102",
      source: "ledger",
      reasonCode: "amount_variance",
      tier: 2,
      candidatesConsidered: 1,
      reasoning: "Razorpay gross ledger billing",
    },
    {
      status: "exception",
      recordId: "B103",
      source: "bank",
      reasonCode: "no_candidate_found",
      tier: 3,
      candidatesConsidered: 0,
      reasoning: "No candidate counterpart found in settlement window",
    },
    {
      status: "exception",
      recordId: "L103",
      source: "ledger",
      reasonCode: "no_candidate_found",
      tier: 3,
      candidatesConsidered: 0,
      reasoning: "No candidate counterpart found in settlement window",
    },
  ],
};

describe("AI Financial Controller — 10 Grounded Tools Specification", () => {
  const tools = createControllerTools(mockRunResult, mockRecords);

  it("1. get_run_summary: retrieves run metrics and tier breakdown", async () => {
    const res = await tools.direct.getRunSummary();
    expect(res.totalRecords).toBe(6);
    expect(res.matched).toBe(2);
    expect(res.exceptions).toBe(4);
    expect(res.tierBreakdown.tier1).toBe(2);
    expect(res.durationMs).toBe(120);
  });

  it("2. get_cash_position: retrieves multi-currency cash balances & BRS", async () => {
    const resAll = await tools.direct.getCashPosition({});
    expect(resAll).toHaveProperty("USD");
    expect(resAll).toHaveProperty("INR");
    expect(resAll.USD?.closingBankBalance).toBe(3500.0);
    expect(resAll.INR?.statutoryAccrualsMdrTds).toBe(11.8);

    const resUsd = await tools.direct.getCashPosition({ currency: "USD" });
    expect(resUsd).toHaveProperty("USD");
    expect(resUsd.USD?.unreconciledInTransitDeposits).toBe(2500.0);
  });

  it("3. get_exceptions: queries exception ledger with reason code and currency filters", async () => {
    const res = await tools.direct.getExceptions({ reasonCode: "amount_variance" });
    expect(res.totalExceptions).toBe(4);
    expect(res.returnedCount).toBe(2);
    expect(res.exceptions.every((e) => e.reasonCode === "amount_variance")).toBe(true);

    const resInr = await tools.direct.getExceptions({ currency: "INR" });
    expect(resInr.returnedCount).toBe(2);
    expect(resInr.exceptions[0]?.currency).toBe("INR");
  });

  it("4. get_exception_detail: returns side-by-side diffs and recommended finance action", async () => {
    const res = await tools.direct.getExceptionDetail({ recordId: "B102" });
    expect(res.targetRecord.id).toBe("B102");
    expect(res.targetRecord.amount).toBe(488.2);
    expect(res.recommendedFinanceAction).toContain("Audit contractual fee schedule");

    const resNotFound = await tools.direct.getExceptionDetail({ recordId: "NON_EXISTENT" });
    expect(resNotFound).toHaveProperty("error");
  });

  it("5. explain_match: provides verifiable math proofs and counterpart justification", async () => {
    const res = await tools.direct.explainMatch({ recordId: "B101" });
    expect(res.matchStatus).toBe("MATCHED");
    expect(res.tier).toBe(1);
    expect(res.counterparts).toHaveLength(1);
    expect(res.counterparts?.[0]?.id).toBe("L101");
    expect(res.mathVerification?.verified).toBe(true);
    expect(res.mathVerification?.difference).toBe(0);

    const resUnmatched = await tools.direct.explainMatch({ recordId: "B103" });
    expect(resUnmatched.message).toContain("not in a matched state");
  });

  it("6. force_match: enforces Decimal math verification & creates HITL approval token", async () => {
    const res = await tools.direct.forceMatch({
      targetRecordId: "B103",
      counterpartRecordIds: ["L103"],
      overrideReason: "Timing drift confirmed with wire confirmation receipt",
    });

    expect(res.status).toBe("PENDING_HUMAN_CONFIRMATION");
    expect(res.approvalRequired).toBe(true);
    expect(res.approvalToken).toMatch(/^TOKEN_MATCH_/);
    expect(res.verifiableMathCheck).toBe(true);
    expect(res.amountVariance).toBe(0);

    // Verify token registered in pendingActionApprovals
    expect(pendingActionApprovals.has(res.approvalToken)).toBe(true);
  });

  it("7. mark_as_suspense: routes unresolvable item to suspense account with HITL approval token", async () => {
    const res = await tools.direct.markAsSuspense({
      recordId: "B103",
      suspenseReason: "Unidentified wire deposit exceeding 30 days settlement window",
      category: "unidentified_deposit",
    });

    expect(res.status).toBe("PENDING_HUMAN_CONFIRMATION");
    expect(res.approvalRequired).toBe(true);
    expect(res.approvalToken).toMatch(/^TOKEN_SUSPENSE_/);
    expect(res.suspenseAccount).toBe("GL-9999-SUSPENSE-CLEARING");

    expect(pendingActionApprovals.has(res.approvalToken)).toBe(true);
  });

  it("8. re_run_residuals: re-evaluates residual candidates under expanded tolerances without mutating state", async () => {
    const res = await tools.direct.reRunResiduals({ amountTolPercent: 1.0, dateWindowDays: 15 });
    expect(res.residualRecordsEvaluated).toBeGreaterThan(0);
    expect(res.projectedMatchesFound).toBeGreaterThanOrEqual(1); // B103 and L103 (same amount 2500, 7 days drift <= 15)
    expect(res.proposedResidualMatches.some((p) => p.targetId === "B103" && p.counterpartId === "L103")).toBe(true);
  });

  it("9. simulate_what_if: simulates fee schedule adjustments and computes recovered volume", async () => {
    const res = await tools.direct.simulateWhatIf({
      scenario: "adjust_fee_schedule",
      feePercent: 2.36,
    });

    expect(res.scenario).toBe("adjust_fee_schedule");
    expect(res.unresolvedExceptionsAnalyzed).toBe(4);
    expect(res.accountingAdvice).toContain("Simulated parameter adjustments");
  });

  it("10. export_audit_proof: produces cryptographically signed compliance certificate", async () => {
    const cert = await tools.direct.exportAuditProof({ scope: "full_run" });
    expect(cert.proofId).toMatch(/^PROOF-/);
    expect(cert.sha256Digest).toHaveLength(64);
    expect(cert.merkleRoot).toHaveLength(64);
    expect(cert.signature).toHaveLength(64);
    expect(cert.complianceChecklist.soxSection404).toBe(true);
    expect(cert.complianceChecklist.indianTaxGstMdr).toBe(true);
    expect(cert.complianceChecklist.iso20022AuditIntegrity).toBe(true);
  });
});

describe("HITL Action Approval Token Execution", () => {
  it("approves a pending action token", async () => {
    const tools = createControllerTools(mockRunResult, mockRecords);
    const forceRes = await tools.direct.forceMatch({
      targetRecordId: "B103",
      counterpartRecordIds: ["L103"],
      overrideReason: "Manual supervisor audit approval",
    });

    const token = forceRes.approvalToken;
    const approval = approveOrRejectActionToken(token, "approve", "Approved by Lead Controller");
    expect(approval.success).toBe(true);
    expect(approval.message).toContain("successfully approved");

    // Duplicate execution should fail safely
    const secondAttempt = approveOrRejectActionToken(token, "approve");
    expect(secondAttempt.success).toBe(false);
  });

  it("rejects an action token or handles missing token", () => {
    const missing = approveOrRejectActionToken("NON_EXISTENT_TOKEN", "reject");
    expect(missing.success).toBe(false);
    expect(missing.message).toContain("not found");
  });
});

describe("askFinanceController Agent Execution", () => {
  it("executes multi-step deterministic tool loop for cash position inquiry", async () => {
    const chatRes = await askFinanceController(
      "Generate the Bank Reconciliation Statement and cash position for USD and INR.",
      mockRunResult,
      mockRecords
    );

    expect(chatRes.reply).toContain("Bank Reconciliation & Cash Position Statement");
    expect(chatRes.reply).toContain("USD");
    expect(chatRes.modelUsed).toContain("deterministic-controller");
    expect(chatRes.toolCalls && chatRes.toolCalls.length).toBeGreaterThan(0);
    expect(chatRes.traceId).toBeDefined();
  }, 15000);

  it("executes multi-step tool loop for specific record inquiry", async () => {
    const chatRes = await askFinanceController(
      "Explain match for B101",
      mockRunResult,
      mockRecords,
      "B101"
    );

    expect(chatRes.reply).toContain("Match Audit for Record B101");
    expect(chatRes.reply).toContain("MATCHED");
    expect(chatRes.toolCalls?.some((t) => t.toolName === "explain_match")).toBe(true);
  }, 15000);

  it("executes multi-step tool loop for what-if simulation", async () => {
    const chatRes = await askFinanceController(
      "Simulate what-if fee schedule adjustment to 2.36% MDR.",
      mockRunResult,
      mockRecords
    );

    expect(chatRes.reply).toContain("What-If Simulation Report");
    expect(chatRes.toolCalls?.some((t) => t.toolName === "simulate_what_if")).toBe(true);
  }, 15000);

  it("executes multi-step tool loop for audit proof export", async () => {
    const chatRes = await askFinanceController(
      "Generate cryptographic audit proof certificate for compliance.",
      mockRunResult,
      mockRecords
    );

    expect(chatRes.reply).toContain("Cryptographic Audit Certificate Generated");
    expect(chatRes.auditProof).toBeDefined();
    expect(chatRes.auditProof?.sha256Digest).toHaveLength(64);
  }, 15000);
});

describe("HTTP API Endpoints for Controller Agent & Approvals", () => {
  it("GET /api/agent/tools returns registered 10 grounded tools", async () => {
    const res = await app.fetch(new Request("http://localhost/api/agent/tools"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(10);
    const names = body.tools.map((t: any) => t.name);
    expect(names).toContain("get_run_summary");
    expect(names).toContain("get_cash_position");
    expect(names).toContain("get_exceptions");
    expect(names).toContain("get_exception_detail");
    expect(names).toContain("explain_match");
    expect(names).toContain("force_match");
    expect(names).toContain("mark_as_suspense");
    expect(names).toContain("re_run_residuals");
    expect(names).toContain("simulate_what_if");
    expect(names).toContain("export_audit_proof");
  });

  it("POST /api/agent/chat processes queries and returns structured tool results", async () => {
    const res = await app.fetch(new Request("http://localhost/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Provide high level run summary." }),
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty("reply");
    expect(body).toHaveProperty("toolCalls");
  });

  it("POST /api/agent/approve-action authorizes pending tokens via API", async () => {
    const tools = createControllerTools(mockRunResult, mockRecords);
    const forceRes = await tools.direct.forceMatch({
      targetRecordId: "B103",
      counterpartRecordIds: ["L103"],
      overrideReason: "API Approval Test",
    });

    const res = await app.fetch(new Request("http://localhost/api/agent/approve-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: forceRes.approvalToken,
        decision: "approve",
        comment: "Authorized via HTTP API endpoint",
      }),
    }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.message).toContain("successfully approved");
  });
});
