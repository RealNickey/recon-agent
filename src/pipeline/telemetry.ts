/**
 * OpenTelemetry GenAI Telemetry & Structured Audit Trace Logger.
 *
 * Implements OpenTelemetry-compatible GenAI semantic conventions and
 * AI SDK Telemetry interface for tracing reconciliation runs,
 * multi-step agent reasoning, grounded tool executions, and audit records.
 */
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Telemetry } from "ai";
import { registerTelemetry } from "ai";

export type SpanStatus = "ok" | "error" | "unset";

export interface TelemetrySpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean | undefined>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
  error?: string;
}

export interface ReconSpanAttributes {
  "recon.run_id"?: string;
  "recon.record_id"?: string;
  "recon.source"?: string;
  "recon.amount"?: number;
  "recon.currency"?: string;
  "recon.tier"?: number;
  "recon.decision"?: string;
  "recon.tool.name"?: string;
  "recon.tool.execution_ms"?: number;
  "gen_ai.system"?: string;
  "gen_ai.request.model"?: string;
  "gen_ai.usage.prompt_tokens"?: number;
  "gen_ai.usage.completion_tokens"?: number;
  "gen_ai.usage.total_tokens"?: number;
  [key: string]: string | number | boolean | undefined;
}

const activeSpans = new Map<string, TelemetrySpan>();
const recordedSpans: TelemetrySpan[] = [];
let defaultTracePath = "logs/reasoning-trace.jsonl";

function ensureTraceLogDir(filePath: string) {
  const dir = filePath.includes("/") || filePath.includes("\\")
    ? filePath.replace(/[/\\][^/\\]+$/, "")
    : "logs";
  if (dir && !existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
  }
}

export function setTraceLogPath(path: string) {
  defaultTracePath = path;
}

export function writeTraceLogEntry(entry: Record<string, unknown>, filePath = defaultTracePath) {
  try {
    ensureTraceLogDir(filePath);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    });
    appendFileSync(filePath, line + "\n");
  } catch {}
}

export function startSpan(
  name: string,
  attributes: ReconSpanAttributes = {},
  parentSpanId?: string,
  traceId?: string
): TelemetrySpan {
  const spanId = `span_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const resolvedTraceId = traceId ?? `trace_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const span: TelemetrySpan = {
    spanId,
    traceId: resolvedTraceId,
    parentSpanId,
    name,
    startTime: Date.now(),
    status: "unset",
    attributes: { ...attributes },
    events: [],
  };

  activeSpans.set(spanId, span);
  return span;
}

export function enrichSpan(
  spanId: string,
  attributes: Partial<ReconSpanAttributes>
): TelemetrySpan | undefined {
  const span = activeSpans.get(spanId);
  if (!span) return undefined;

  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined) {
      span.attributes[k] = v;
    }
  }
  return span;
}

export function addSpanEvent(
  spanId: string,
  name: string,
  attributes?: Record<string, unknown>
): void {
  const span = activeSpans.get(spanId);
  if (!span) return;

  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

export function endSpan(
  spanId: string,
  status: SpanStatus = "ok",
  error?: string,
  tracePath = defaultTracePath
): TelemetrySpan | undefined {
  const span = activeSpans.get(spanId);
  if (!span) return undefined;

  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status = status;
  if (error) {
    span.error = error;
    span.attributes["error.message"] = error;
  }

  activeSpans.delete(spanId);
  recordedSpans.push(span);

  writeTraceLogEntry(
    {
      type: "otel_span",
      spanId: span.spanId,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      durationMs: span.durationMs,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
      error: span.error,
    },
    tracePath
  );

  return span;
}

export async function withSpan<T>(
  name: string,
  attributes: ReconSpanAttributes,
  fn: (span: TelemetrySpan) => Promise<T>,
  parentSpanId?: string,
  traceId?: string
): Promise<T> {
  const span = startSpan(name, attributes, parentSpanId, traceId);
  try {
    const result = await fn(span);
    endSpan(span.spanId, "ok");
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    endSpan(span.spanId, "error", msg);
    throw err;
  }
}

export function getRecordedSpans(): readonly TelemetrySpan[] {
  return recordedSpans;
}

export function clearRecordedSpans(): void {
  recordedSpans.length = 0;
  activeSpans.clear();
}

export interface CreateReconTelemetryOptions {
  tracePath?: string;
  runId?: string;
  enrichCallback?: (span: TelemetrySpan) => void;
}

/**
 * Creates an AI SDK Telemetry integration instance that captures
 * LLM lifecycle events, tool calls, token usage, and latency into OpenTelemetry spans
 * and structured JSONL logs.
 */
export function createReconTelemetry(options: CreateReconTelemetryOptions = {}): Telemetry {
  const tracePath = options.tracePath ?? defaultTracePath;
  const runId = options.runId ?? `run_${Date.now().toString(36)}`;
  const opSpans = new Map<string, TelemetrySpan>();
  const stepSpans = new Map<string, TelemetrySpan>();
  const toolSpans = new Map<string, TelemetrySpan>();

  return {
    onStart: (event) => {
      const callId = event.callId ?? `call_${randomUUID().slice(0, 8)}`;
      const span = startSpan(`ai.generation`, {
        "recon.run_id": runId,
        "gen_ai.system": "recon-agent",
        "gen_ai.request.model": event.modelId,
      });
      opSpans.set(callId, span);
      if (options.enrichCallback) options.enrichCallback(span);
    },

    onStepStart: (event) => {
      const callId = event.callId ?? `call_${randomUUID().slice(0, 8)}`;
      const stepId = `step_${event.stepNumber ?? 0}_${randomUUID().slice(0, 6)}`;
      const parentSpan = opSpans.get(callId);
      const span = startSpan(
        `ai.step.${event.stepNumber ?? 0}`,
        {
          "recon.run_id": runId,
          "step.number": event.stepNumber,
        },
        parentSpan?.spanId,
        parentSpan?.traceId
      );
      stepSpans.set(stepId, span);
      if (options.enrichCallback) options.enrichCallback(span);
    },

    onLanguageModelCallStart: (event) => {
      const callId = event.callId ?? `call_${randomUUID().slice(0, 6)}`;
      writeTraceLogEntry(
        {
          type: "llm_call_start",
          runId,
          callId,
          modelId: event.modelId,
          provider: event.provider,
        },
        tracePath
      );
    },

    onLanguageModelCallEnd: (event) => {
      writeTraceLogEntry(
        {
          type: "llm_call_end",
          runId,
          callId: event.callId,
          modelId: event.modelId,
          usage: event.usage,
          finishReason: event.finishReason,
        },
        tracePath
      );
    },

    onToolExecutionStart: (event) => {
      const toolCallId = event.toolCall.toolCallId ?? `tool_${randomUUID().slice(0, 6)}`;
      const toolName = event.toolCall.toolName;
      const span = startSpan(`tool.${toolName}`, {
        "recon.run_id": runId,
        "recon.tool.name": toolName,
      });
      toolSpans.set(toolCallId, span);
    },

    onToolExecutionEnd: (event) => {
      const toolCallId = event.toolCall.toolCallId;
      const span = toolSpans.get(toolCallId);
      if (span) {
        enrichSpan(span.spanId, {
          "recon.tool.execution_ms": event.toolExecutionMs,
        });
        endSpan(span.spanId, "ok", undefined, tracePath);
        toolSpans.delete(toolCallId);
      }
    },

    onStepEnd: (event) => {
      const parentSpan = opSpans.get(event.callId);
      const stepSpan = Array.from(stepSpans.values()).find((s) => s.traceId === parentSpan?.traceId);
      if (stepSpan) {
        enrichSpan(stepSpan.spanId, {
          "gen_ai.usage.prompt_tokens": event.usage?.inputTokens,
          "gen_ai.usage.completion_tokens": event.usage?.outputTokens,
          "gen_ai.usage.total_tokens": event.usage?.totalTokens,
        });
        endSpan(stepSpan.spanId, "ok", undefined, tracePath);
      }
    },

    onEnd: (event) => {
      const span = opSpans.get(event.callId);
      if (span) {
        endSpan(span.spanId, "ok", undefined, tracePath);
        opSpans.delete(event.callId);
      }
    },

    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      writeTraceLogEntry(
        {
          type: "telemetry_error",
          runId,
          error: msg,
        },
        tracePath
      );
    },
  };
}

/**
 * Registers the reconciliation telemetry integration globally with Vercel AI SDK.
 */
export function registerReconTelemetry(options: CreateReconTelemetryOptions = {}): void {
  const telemetry = createReconTelemetry(options);
  registerTelemetry(telemetry);
}
