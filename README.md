# Recon Agent — multi-source financial reconciliation

An AI agent that reconciles records across a bank statement, internal ledger, and
payment-processor export, then reports a **measured** match rate and an **honest**
exception list. Built for the AI Finance Controller hackathon track.

## Stack

Bun · Hono · Vercel AI SDK (`generateObject`, structured output) · OpenRouter
(`z-ai/glm-5.2:free`) · decimal.js · fastest-levenshtein · papaparse · fflate · zod

## Quick start

```sh
bun install
# fill in .env (OPENROUTER_API_KEY required for tier 3)
bun run gen            # synthetic dataset (seed 42) -> data/  (requires GROUND_TRUTH_PATH outside the repo)
bun run pipeline -- --no-ai
bun run eval           # score against the external answer key
bun run dev            # dashboard on http://localhost:3000
```

Useful variants:

```sh
bun run pipeline -- --no-ai                 # tiers 1-2 only (fast baseline)
bun run gen -- --seed 123                   # fresh dataset
bun run gen:holdout                         # held-out seed 777 -> data/holdout/
bun run pipeline -- --data data/holdout --out results/holdout-run.json --no-ai
bun run eval:holdout                        # score the holdout run
bun run fetch-benchrec                      # optional: mix real Kaggle BenchRec rows in
```

`bun run gen` **refuses** to run without `GROUND_TRUTH_PATH` pointing outside this
repo. Source files without an answer key cannot be evaluated, so generation is
fail-closed.

## Architecture

```
            ┌──────────────────────────────────────────────┐
 all records│                                              │
 ──────────►│  TIER 1 exact    hash-join on normalized     │──► matched (conf 1.0)
            │                (ref|amount|date|currency)    │
            │        │ residual                            │
            │        ▼                                     │
            │  TIER 2 fuzzy    invoice identity, unique    │──► matched
            │                amount+date, unique subset-sum│
            │        │ residual + candidate pools (≤12)    │
            │        ▼                                     │
            │  TIER 3 agentic  generateObject per residual │──► matched (conf ≥ .70)
            │                sequential, 20s timeout       │
            │        │                                     │
            │        ▼                                     │
            │   EXCEPTIONS with reason codes               │──► honest exception list
            └──────────────────────────────────────────────┘
```

Every valid input record gets exactly one outcome. Every tier-3 call is logged
to `logs/reasoning-trace.jsonl` and viewable in the dashboard.

## Scoring

`bun run eval` reports pair-level precision, recall, FPR, fitness, per-category
and per-tier breakdowns, throughput, token spend, and lists every false positive.

**Fitness = recall − 2 × falsePositiveRate.** Units are pair-level throughout.
A wrong match costs twice as much as a missed one — an honest exception always
beats a guess. One claimed group is one global FP even if it overlaps several
truth pairs; category tables may still attribute that group to each affected
pair.

Holdout eval exits 2 if fitness drops more than 0.05 versus the previous
holdout line in `logs/eval-history.jsonl`.

## Answer key

The ground truth never lives in this repo. `eval.ts` reads it from
`GROUND_TRUTH_PATH` / `GROUND_TRUTH_HOLDOUT_PATH` (set in `.env`, gitignored and
read-denied to agents). Paths that resolve inside the repo are refused. There
is no fallback to `data/ground-truth.json`. The pipeline cannot access the key.

## Measured no-AI results (do not compare across hashes)

| dataset | truth hash | pairs | fitness | recall | precision | FPR | rec/s |
|---|---|---|---|---|---|---|---|
| historical 70-pair baseline | (pre-regen) | 23/70 | 0.3286 | 0.3286 | 1 | 0 | ~994 |
| seed 42 + reconstructed BenchRec | `f7c0b963363fca70` | 81/81 | 1.0000 | 1.0000 | 1 | 0 | 427 |
| holdout seed 777 (synthetic only) | `e8e4fa7bb6da52a0` | 66/66 | 1.0000 | 1.0000 | 1 | 0 | 444 |

On the current mixed dev set, every synthetic category and all 15 BenchRec
groups were recovered with 0 false positives. Unmatchable records stayed
exceptions (10 honest). Tier 3 was not used for these numbers.

BenchRec mix on this run: 15 groups (10 one-to-one, 5 many-to-one) after
dedup + amount reconstruction. Groups whose A-rows do not reconstruct the
bank amount are dropped rather than written into the answer key.

## Tests

`bun test`: 69 pass, 0 fail, 131 `expect()` calls, 7 files (last run).
