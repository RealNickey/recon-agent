/**
 * AI Finance Controller Agent — Interactive Settlement Q&A and Financial Operations Copilot.
 * Allows human controllers and hackathon judges to query the reconciliation engine,
 * investigate exceptions, audit cash positions, and explore decision reasoning.
 */
import { generateText } from "ai";
import type { FinRecord, RunResult, AgentChatResponse } from "../types";
import { executeWithProviderFallback, hasApprovedProvider, type ProviderTarget } from "./agentic-providers";

export async function askFinanceController(
  prompt: string,
  runResult: RunResult | null,
  records: FinRecord[] = [],
  focusRecordId?: string
): Promise<AgentChatResponse> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const focusRecord = focusRecordId ? byId.get(focusRecordId) : undefined;
  const focusOutcome = focusRecordId && runResult
    ? runResult.outcomes.find((o) => o.recordId === focusRecordId)
    : undefined;

  const systemPrompt = `You are the AI Finance Controller for an enterprise finance-ops department.
You have direct visibility into the latest reconciliation pipeline run, cash position balances, match proofs, and exception lists.

Your responsibilities:
1. Explain why any transaction was matched or marked as an exception with concrete facts (amounts, dates, references, reason codes).
2. Detail cash positions and unreconciled balance risks across all active currencies.
3. Suggest clear, compliant next-step actions for finance teams (e.g. request bank trace, check GST TDS schedule, issue vendor credit note).
4. Maintain a professional, quantitative, audit-grade tone.

Pipeline Context:
- Run Summary: ${runResult ? `Total: ${runResult.stats.totalRecords}, Matched: ${runResult.stats.matched}, Exceptions: ${runResult.stats.exceptions}, Duration: ${runResult.durationMs}ms` : "No run loaded"}
- Cash Position: ${runResult?.cashPosition ? JSON.stringify(runResult.cashPosition) : "Not available"}
${focusRecord ? `- Focus Record: ${JSON.stringify(focusRecord)}\n- Focus Outcome: ${JSON.stringify(focusOutcome)}` : ""}
`;

  if (!hasApprovedProvider()) {
    let fallbackReply = `Finance Controller Notice (Offline Mode):\n\n`;
    if (focusOutcome) {
      fallbackReply += `Record ${focusRecordId} status: ${focusOutcome.status} (Tier ${focusOutcome.tier}). Reason: ${focusOutcome.reasonCode ?? "N/A"}.\nReasoning: ${focusOutcome.reasoning ?? "No reasoning provided"}.`;
    } else if (runResult?.cashPosition) {
      fallbackReply += `Current Cash Position:\n` + Object.entries(runResult.cashPosition)
        .map(([cur, pos]) => `- ${cur}: Reconciled ${pos.reconciledAmount.toLocaleString()} ${cur}, Unreconciled ${pos.unreconciledAmount.toLocaleString()} ${cur}, Net ${pos.netPosition.toLocaleString()} ${cur}`)
        .join("\n");
    } else {
      fallbackReply += `Pipeline statistics: ${runResult?.stats.matched ?? 0} matched, ${runResult?.stats.exceptions ?? 0} exceptions.`;
    }

    return {
      reply: fallbackReply,
      modelUsed: "offline-deterministic-controller",
      referencedRecords: focusRecordId ? [focusRecordId] : [],
      suggestedActions: ["View Field Diff Audit Trail", "Inspect Unreconciled Cash Position", "Export Exception Ledger"],
      insights: [
        `Reconciliation Engine processed ${runResult?.stats.totalRecords ?? 0} records (${runResult?.stats.matched ?? 0} matched, ${runResult?.stats.exceptions ?? 0} exceptions).`,
        `Cash position reflects ${Object.keys(runResult?.cashPosition ?? {}).length} active currencies.`,
      ],
    };
  }

  try {
    const fallbackExec = await executeWithProviderFallback(async (target: ProviderTarget) => {
      const res = await generateText({
        model: target.createModel(),
        system: systemPrompt,
        prompt: `User Question: ${prompt}\n\nProvide an answer with concrete evidence and actionable financial guidance.`,
        maxOutputTokens: 600,
        abortSignal: AbortSignal.timeout(15_000),
      });
      return res;
    });

    const reply = fallbackExec.result.text;
    const referencedRecords: string[] = [];
    for (const r of records) {
      if (reply.includes(r.id) && !referencedRecords.includes(r.id)) {
        referencedRecords.push(r.id);
      }
    }

    return {
      reply,
      modelUsed: fallbackExec.targetUsed.model,
      referencedRecords: referencedRecords.slice(0, 10),
      suggestedActions: [
        "View Field Diff Audit Trail",
        "Inspect Unreconciled Cash Position",
        "Export Exception Ledger",
      ],
      insights: [
        `Reconciliation Engine processed ${runResult?.stats.totalRecords ?? 0} records (${runResult?.stats.matched ?? 0} matched, ${runResult?.stats.exceptions ?? 0} exceptions).`,
        `Cash position reflects ${Object.keys(runResult?.cashPosition ?? {}).length} currency portfolios.`,
      ],
    };
  } catch (err) {
    let fallbackReply = `Finance Controller Notice: ${err instanceof Error ? err.message : String(err)}\n\n`;
    if (focusOutcome) {
      fallbackReply += `Record ${focusRecordId} status: ${focusOutcome.status} (Tier ${focusOutcome.tier}). Reason: ${focusOutcome.reasonCode ?? "N/A"}.\nReasoning: ${focusOutcome.reasoning ?? "No reasoning provided"}.`;
    } else if (runResult?.cashPosition) {
      fallbackReply += `Current Cash Position:\n` + Object.entries(runResult.cashPosition)
        .map(([cur, pos]) => `- ${cur}: Reconciled ${pos.reconciledAmount.toLocaleString()} ${cur}, Unreconciled ${pos.unreconciledAmount.toLocaleString()} ${cur}, Net ${pos.netPosition.toLocaleString()} ${cur}`)
        .join("\n");
    } else {
      fallbackReply += `Pipeline statistics: ${runResult?.stats.matched ?? 0} matched, ${runResult?.stats.exceptions ?? 0} exceptions.`;
    }

    return {
      reply: fallbackReply,
      modelUsed: "deterministic-controller-fallback",
      referencedRecords: focusRecordId ? [focusRecordId] : [],
      suggestedActions: ["Retry with Online Model", "Inspect Audit Log"],
      insights: ["Deterministic Controller activated."],
    };
  }
}
