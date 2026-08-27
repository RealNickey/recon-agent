# Recon Agent — multi-source financial reconciliation

An AI agent that reconciles records across a bank statement, internal ledger, and
payment-processor export, then reports a **measured** match rate and an **honest**
exception list. Built for the AI Finance Controller hackathon track.

## Stack

Bun · Hono · Vercel AI SDK (`generateObject`, structured output) · OpenRouter
(`z-ai/glm-5.2:free`) · p-limit · fastest-levenshtein · decimal.js · papaparse · fflate

## Quick start

```sh
bun install
# fill in .env (OPENROUTER_API_KEY required for tier 3)
bun run gen            # synthetic dataset (seed 42) -> data/
bun run pipeline       # run 3-tier reconciliation -> results/latest-run.json
bun run eval           # score against answer key -> console + logs/eval-history.jsonl
bun run dev            # dashboard on http://localhost:3000
```

Useful variants:

```sh
bun run pipeline -- --no-ai                 # tiers 1-2 only (fast baseline)
bun run gen -- --seed 123                   # fresh dataset
bun run gen:holdout                         # held-out seed 777 -> data/holdout/
bun run pipeline -- --data data/holdout --out results/holdout-run.json
bun run eval:holdout                        # score the holdout run
bun run fetch-benchrec                      # optional: mix real Kaggle BenchRec rows in
```

## Architecture

```
            ┌──────────────────────────────────────────────┐
 all records│                                              │
 ──────────►│  TIER 1 exact    hash-join on normalized     │──► matched (conf 1.0)
            │                (ref|amount|date)             │
            │        │ residual                            │
            │        ▼                                     │
            │  TIER 2 fuzzy    amount tolerance + date     │──► matched (score ≥ .95)
            │                window + token/Levenshtein    │
            │        │ residual + candidate pools (≤8)     │
            │        ▼                                     │
            │  TIER 3 agentic  generateObject per record,  │──► matched (conf ≥ .70)
            │                p-limit concurrency 6         │
            │        │                                     │
            │        ▼                                     │
            │   EXCEPTIONS with reason codes               │──► honest exception list
            └──────────────────────────────────────────────┘
```

Every tier-3 call is logged to `logs/reasoning-trace.jsonl` (input, candidate pool,
decision, latency, tokens) and viewable in the dashboard.

## Scoring

`bun run eval` reports precision, recall, per-category and per-tier breakdowns,
throughput, token spend, and lists every false positive explicitly.

**Fitness = recall − 2 × falsePositiveRate.** A wrong match costs twice as much as
a missed one — an honest exception always beats a guess.

## Answer key

The ground truth never lives in this repo. `eval.ts` reads it from the path in the
`GROUND_TRUTH_PATH` env var (set in `.env`, which is gitignored and read-denied to
agents). The pipeline cannot access it — only the scorer can.

## Baseline (seed 42, tiers 1-2 only, no AI)

fitness 0.46 · recall 0.46 · precision 1.00 · 0 false positives · ~3,100 rec/s
