import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { runPipeline } from "./pipeline/run";
import { askFinanceController } from "./pipeline/controller-agent";
import { runCrossValidation } from "../scripts/cross-validate";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayCredentials,
  syncRazorpayData,
} from "./integrations/razorpay";
import type { FinRecord, RunResult } from "./types";

const app = new Hono();
let running = false;

// Security headers middleware with Razorpay Checkout allowance
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https://checkout.razorpay.com; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com; img-src 'self' data: https://*.razorpay.com;"
  );
});

function validateDataDir(dir: string): string {
  const norm = dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (norm.includes("..") || (!norm.startsWith("data") && norm !== "data")) {
    throw new Error(`Access denied: data directory '${dir}' outside allowed root`);
  }
  return norm;
}

function validateOutFile(file: string): string {
  const norm = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm.includes("..") || !norm.startsWith("results/")) {
    throw new Error(`Access denied: output file '${file}' outside results directory`);
  }
  return norm;
}

function loadAllDatasetRecords(dataDir = "data"): FinRecord[] {
  const safeDir = validateDataDir(dataDir);
  const records: FinRecord[] = [];
  for (const file of ["bank-statement.json", "internal-ledger.json", "processor-export.json"]) {
    const p = join(safeDir, file);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        if (Array.isArray(raw)) records.push(...raw);
      } catch {}
    }
  }
  return records;
}

const RunBodySchema = z.object({
  dataDir: z.string().optional().default("data"),
  useAi: z.boolean().optional().default(true),
  outFile: z.string().optional().default("results/latest-run.json"),
});

const AgentChatBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  focusRecordId: z.string().optional(),
  dataDir: z.string().optional().default("data"),
});

const CrossValBodySchema = z.object({
  seeds: z.number().int().min(1).max(10).optional(),
  mode: z.enum(["all", "standard", "hard"]).optional().default("all"),
});

app.get("/api/report", (c) => {
  const historyPath = "logs/eval-history.jsonl";
  const runPath = "results/latest-run.json";
  const history = existsSync(historyPath)
    ? readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const run: RunResult | null = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) : null;
  return c.json({
    latest: history.at(-1) ?? null,
    history: history.slice(-50),
    run,
    running,
  });
});

app.get("/api/records", (c) => {
  try {
    const rawDir = c.req.query("data") ?? "data";
    const dataDir = validateDataDir(rawDir);
    const records = loadAllDatasetRecords(dataDir);
    return c.json({ records, count: records.length });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/run", async (c) => {
  if (running) return c.json({ error: "Pipeline currently executing" }, 409);
  running = true;
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = RunBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.format() }, 400);
    }
    const dataDir = validateDataDir(parsed.data.dataDir);
    const outFile = validateOutFile(parsed.data.outFile);
    const result = await runPipeline(dataDir, outFile, parsed.data.useAi);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  } finally {
    running = false;
  }
});

app.post("/api/agent/chat", async (c) => {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = AgentChatBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid chat payload", details: parsed.error.format() }, 400);
    }
    const prompt = parsed.data.prompt;
    const focusRecordId = parsed.data.focusRecordId;
    const dataDir = validateDataDir(parsed.data.dataDir);

    const runPath = "results/latest-run.json";
    const runResult: RunResult | null = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) : null;
    const records = loadAllDatasetRecords(dataDir);

    const response = await askFinanceController(prompt, runResult, records, focusRecordId);
    return c.json(response);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get("/api/cross-validate", (c) => {
  const p = "results/cross-validation.json";
  if (!existsSync(p)) return c.json({ summary: null });
  try {
    const summary = JSON.parse(readFileSync(p, "utf8"));
    return c.json({ summary });
  } catch {
    return c.json({ summary: null });
  }
});

app.post("/api/cross-validate/run", async (c) => {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = CrossValBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid cross-validation request", details: parsed.error.format() }, 400);
    }
    const seeds = parsed.data.seeds ? [42, 123, 555, 777, 999, 2026].slice(0, parsed.data.seeds) : [42, 123, 555, 777, 999];
    const mode = parsed.data.mode;
    const summary = await runCrossValidation(seeds, mode);
    return c.json({ summary });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get("/api/traces", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const path = "logs/reasoning-trace.jsonl";
  if (!existsSync(path)) return c.json({ traces: [] });
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const traces = lines.slice(-limit).map((l) => JSON.parse(l));
  return c.json({ traces });
});

app.get("/api/exceptions/export", (c) => {
  const p = "results/exception-ledger.csv";
  if (!existsSync(p)) {
    return c.text("Record ID,Source,Date,Amount,Currency,Reason Code,Candidates Considered,Suggested Action,SLA Priority,Reasoning\n", 200, {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=exception-ledger.csv",
    });
  }
  const csv = readFileSync(p, "utf8");
  return c.text(csv, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": "attachment; filename=exception-ledger.csv",
  });
});

const CreateOrderBodySchema = z.object({
  amount: z.number().min(100, "Amount must be at least 100 paise (₹1.00)"),
  currency: z.string().optional().default("INR"),
  receipt: z.string().optional(),
  notes: z.record(z.string(), z.string()).optional(),
});

const VerifyPaymentBodySchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
  razorpay_signature: z.string().min(1, "razorpay_signature is required"),
});

const RazorpaySyncBodySchema = z.object({
  targetDir: z.string().optional().default("data/razorpay"),
  runRecon: z.boolean().optional().default(true),
  useAi: z.boolean().optional().default(false),
});

app.get("/api/razorpay/config", (c) => {
  const creds = getRazorpayCredentials();
  return c.json({
    key_id: creds.keyId,
    currency: "INR",
  });
});

app.post("/api/create-order", async (c) => {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = CreateOrderBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid create-order payload", details: parsed.error.format() }, 400);
    }
    const order = await createRazorpayOrder(parsed.data);
    const creds = getRazorpayCredentials();
    return c.json({
      ...order,
      key_id: creds.keyId,
    });
  } catch (err: any) {
    const status = err.statusCode === 401 ? 401 : 500;
    return c.json({ error: err instanceof Error ? err.message : String(err) }, status);
  }
});

app.post("/api/verify-payment", async (c) => {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = VerifyPaymentBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ success: false, error: "Missing required verification fields", details: parsed.error.format() }, 400);
    }
    const result = verifyPaymentSignature(parsed.data);
    if (!result.valid) {
      return c.json({ success: false, error: result.error || "Signature verification failed" }, 400);
    }
    return c.json({
      success: true,
      message: "Payment verified successfully",
      order_id: parsed.data.razorpay_order_id,
      payment_id: parsed.data.razorpay_payment_id,
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post("/api/integrations/razorpay/sync", async (c) => {
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = RazorpaySyncBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "Invalid sync request", details: parsed.error.format() }, 400);
    }
    const targetDir = validateDataDir(parsed.data.targetDir);
    const syncRes = await syncRazorpayData(targetDir);

    let pipelineRes = null;
    if (parsed.data.runRecon) {
      pipelineRes = await runPipeline(targetDir, "results/razorpay-sync-run.json", parsed.data.useAi);
    }

    return c.json({
      success: true,
      sync: syncRes,
      pipeline: pipelineRes,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get("/*", serveStatic({ root: "./public" }));

export default {
  port: 3000,
  fetch: app.fetch,
};
