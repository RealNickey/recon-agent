import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFileSync, existsSync } from "node:fs";
import { runPipeline } from "./pipeline/run";

const app = new Hono();
let running = false;

app.get("/api/report", (c) => {
  const historyPath = "logs/eval-history.jsonl";
  const runPath = "results/latest-run.json";
  const history = existsSync(historyPath)
    ? readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const run = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) : null;
  return c.json({ latest: history.at(-1) ?? null, history: history.slice(-50), run, running });
});

app.post("/api/run", async (c) => {
  if (running) return c.json({ error: "already running" }, 409);
  running = true;
  try {
    const result = await runPipeline();
    return c.json(result);
  } finally {
    running = false;
  }
});

app.get("/api/traces", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 200);
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
