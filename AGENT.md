# AGENT.md — Autonomous Engineer Guide for `recon-agent`

This document defines the architecture, hard constraints, evaluation metrics, and operational playbooks for autonomous agents running iterative improvement loops in this repository.

---

## 1. Mission & Engineering Philosophy

**Goal**: Build a deterministic + agentic financial reconciliation engine across bank statements, internal ledgers, and payment-processor exports that maximizes pair-level fitness, reports an honest exception list, and sustains high throughput.

### Golden Rules
1. **Easy Lock is a Regression Lock**: 100% on dev (`f7c0b963363fca70`) and holdout (`e8e4fa7bb6da52a0`) is a permanent regression lock. Never break easy matches on purpose.
2. **Optimize Hard Fitness**: All matcher improvements and tuning must be measured against the un-tuned hard evaluation set (`b3057890b01ecebf`).
3. **An Honest Exception Always Beats a Wrong Match**: A missed pair costs `1.0` in recall; a false positive costs `2.0` in fitness penalty ($FPR$). Never guess.
4. **Never Cheat / Strict Isolation**: Never read `GROUND_TRUTH_PATH`, `GROUND_TRUTH_HOLDOUT_PATH`, `GROUND_TRUTH_HARD_PATH`, `.env`, or answer keys into the pipeline, dashboard, or matcher logic. Matcher code in `src/` must operate completely blind.
5. **No Floating Point Money Math**: Never use JS `Number.toFixed(2)` or float arithmetic for money compares, sums, or join keys. Always use `Decimal` and `amountKey()` from `src/normalize.ts`.

---

## 2. Dataset Population & Truth Hashes

Never compare scores across different hashes. Always specify dataset name and truth hash.

| Dataset | Seed / Source | Truth Hash | Status | Notes |
|---|---|---|---|---|
| **Dev (Mixed)** | Seed 42 + BenchRec | `f7c0b963363fca70` | 81/81 (Fitness 1.0000, FPR 0) | **Easy Lock** (Synthetic 66/66 + BenchRec 15/15) |
| **Holdout** | Seed 777 (Synthetic) | `e8e4fa7bb6da52a0` | 66/66 (Fitness 1.0000, FPR 0) | **Holdout Lock** (Regression delta check <= 0.05) |
| **Hard** | Seed 999 (Synthetic) | `b3057890b01ecebf` | 39/62 (Fitness 0.5968, FPR 0.0161) | **Active Optimization Target** (1 FP, 22 missed) |

---

## 3. Pipeline Architecture

```
            ┌──────────────────────────────────────────────┐
 all records│                                              │
 ──────────►│  TIER 1 exact    hash-join on normalized     │──► matched (conf 1.0)
            │                (ref|amount|date|currency)    │
            │        │ residual                            │
            │        ▼                                     │
            │  TIER 2 fuzzy    invoice identity, unique    │──► matched (conf 0.94-0.97)
            │                amount+date, unique subset-sum│
            │        │ residual + candidate pools (<=12)   │
            │        ▼                                     │
            │  TIER 3 agentic  generateObject per residual │──► matched (conf >= 0.70)
            │                sequential, 20s timeout       │
            │        │                                     │
            │        ▼                                     │
            │   EXCEPTIONS with reason codes               │──► honest exception list
            └──────────────────────────────────────────────┘
```

* **Coverage Invariant**: Every valid input record produces exactly one outcome (matched or exception).
* **Tier 1 (`src/pipeline/tier1-exact.ts`)**: Fast hash-join on `normalizeRef(ref) | amountKey(amount) | date | currency`.
* **Tier 2 (`src/pipeline/tier2-fuzzy.ts`)**:
  * Invoice identity within settlement window (timing drift, id format drift, partial, FX).
  * Unique large amount+date+currency clusters (BenchRec).
  * Duplicate postings.
  * Unique subset-sum with rival collision guards and vendor filtering.
* **Tier 3 (`src/pipeline/tier3-agentic.ts`)**: Structured output (`generateObject`) for complex residual cases using free model `z-ai/glm-5.2:free`. Sequential processing with claimed-ID exclusion and Decimal sum verification.

---

## 4. Scoring Formula

$$\text{Recall} = \frac{\text{Correct Pairs}}{\text{Total Truth Pairs}}$$
$$\text{Precision} = \frac{\text{Correct Pairs}}{\text{Correct Pairs} + \text{False Positives}}$$
$$\text{False Positive Rate (FPR)} = \frac{\text{False Positives}}{\text{Total Truth Pairs}}$$
$$\text{Fitness} = \text{Recall} - 2 \times \text{False Positive Rate}$$

* Units are **pair-level** throughout.
* Unmatchable records that stay exceptions score as **honest exceptions**. Unmatchables that get matched count as **false positives**.
* Claimed groups whose known sources are all ledger-side are illegal and count as misses / FPs.

---

## 5. Hard Dataset Optimization Playbook

Diagnostics from `bun run error-analysis` reveal the remaining opportunities on the Hard dataset:

### 1. `timing_drift_wide` (8 pairs missed)
- **Pattern**: Exact same invoice number (`INV-XXXXX`) and exact same amount, but date delta is 5–14 days (exceeds default `SETTLE_DAYS = 2`).
- **Fix Strategy**: In Tier 2, allow a wider timing window (e.g. up to 15 days) **only when** both records have identical `invoiceToken(ref)` AND identical `amountKey(amount)` AND there is no rival duplicate in the window.

### 2. `identity_weak` (8 pairs missed)
- **Pattern**: Reference fields do not match directly (e.g. `WIRE-2367` vs `PO-937478`), but the description contains the matching token (e.g. `HOOLI RET PO#937478`).
- **Fix Strategy**: Enhance reference token extraction in `src/normalize.ts` or `src/pipeline/tier2-fuzzy.ts` to inspect descriptions for embedded `PO#...` or `INV-...` patterns when reference field is a generic wire/settlement ID.

### 3. `fx_no_invoice` (6 pairs missed)
- **Pattern**: Bank in EUR, Ledger in USD (or vice versa), within 1–2 days, same vendor description, amount ratio between 0.80 and 1.25.
- **Fix Strategy**: Build a dedicated candidate pool / fuzzy rule for cross-currency vendor pairs within settlement window where the amount ratio fits typical EUR/USD rates (0.75 – 1.35).

### 4. Remaining False Positive (1 group on Hard)
- **Pattern**: Distractor bank payment `B5054` matched with `many_to_one_wide` ledger items plus unmatchables.
- **Fix Strategy**: Tighten subset-sum tolerances or limit `maxK` to 4 for synthetic amounts.

---

## 6. Autonomous Improvement Loop Protocol

When running an improvement loop (via Antigravity `/goal`), follow this strict iterative protocol:

### Iteration Workflow
1. **Analyze Diagnostics**:
   ```sh
   bun run error-analysis
   # Or for a specific category:
   bun run error-analysis -- --category timing_drift_wide
   ```
2. **Form a Concrete Hypothesis**: State the category, root cause, and intended rule change.
3. **Implement Matcher Changes**: Edit matcher logic in safe files.
4. **Run Verification & Regression Locks**:
   ```sh
   bun run typecheck
   bun test
   bun run loop-eval
   # or with AI enabled on hard set:
   bun run loop-eval -- --ai
   ```
5. **Evaluate Decision Rule**:
   - ✅ **KEEP**: Dev Lock is 1.0000 AND Holdout Lock is 1.0000 AND Hard Fitness improved. Append one line to `PROGRESS.md` and commit.
   - ❌ **REVERT**: If Dev or Holdout fitness dropped below 1.0000 or Hard FPR increased, immediately revert changes (`git checkout -- .`).

### Safe vs Restricted Files
- **Safe to Edit**:
  - `src/pipeline/tier2-fuzzy.ts`
  - `src/pipeline/tier3-agentic.ts`
  - `src/normalize.ts`
  - `src/pipeline/run.ts` (orchestration parameters only)
- **NEVER Edit (Cheating / Integrity violation)**:
  - `scripts/eval.ts`
  - `src/scoring.ts`
  - `scripts/generate-data.ts`
  - `data/` or any external answer keys
  - `.env`
