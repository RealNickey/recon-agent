import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runPipeline } from "./pipeline/run";
import { askFinanceController } from "./pipeline/controller-agent";
import { runCrossValidation } from "../scripts/cross-validate";
import type { FinRecord, RunResult } from "./types";

const app = new Hono();
let running = false;

function loadAllDatasetRecords(dataDir = "data"): FinRecord[] {
  const records: FinRecord[] = [];
  for (const file of ["bank-statement.json", "internal-ledger.json", "processor-export.json"]) {
    const p = join(dataDir, file);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        if (Array.isArray(raw)) records.push(...raw);
      } catch {}
    }
  }
  return records;
}

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
  const dataDir = c.req.query("data") ?? "data";
  const records = loadAllDatasetRecords(dataDir);
  return c.json({ records, count: records.length });
});

app.post("/api/run", async (c) => {
  if (running) return c.json({ error: "Pipeline currently executing" }, 409);
  running = true;
  try {
    const body = await c.req.json().catch(() => ({}));
    const dataDir = body.dataDir ?? "data";
    const useAi = body.useAi ?? true;
    const outFile = body.outFile ?? "results/latest-run.json";
    const result = await runPipeline(dataDir, outFile, useAi);
    return c.json(result);
  } finally {
    running = false;
  }
});

app.post("/api/agent/chat", async (c) => {
  try {
    const body = await c.req.json();
    const prompt = String(body.prompt ?? "");
    const focusRecordId = body.focusRecordId ? String(body.focusRecordId) : undefined;
    const dataDir = body.dataDir ?? "data";

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
    const body = await c.req.json().catch(() => ({}));
    const seeds = body.seeds ? [42, 123, 555, 777, 999, 2026].slice(0, body.seeds) : [42, 123, 555, 777, 999];
    const mode = body.mode ?? "all";
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

app.get("/*", serveStatic({ root: "./public" }));

export default {
  port: 3000,
  fetch: app.fetch,
};
