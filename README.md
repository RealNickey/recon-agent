# Recon Agent — Autonomous AI Finance Controller

[![Typecheck](https://img.shields.io/badge/TypeScript-Strict_Checked-blue)](package.json)
[![Tests](https://img.shields.io/badge/Tests-87_Pass_0_Fail-emerald)](src/)
[![Generalization](https://img.shields.io/badge/10x_Cross--Validation-98.55%25_Mean_Fitness-green)](scripts/cross-validate.ts)
[![Razorpay Buildathon](https://img.shields.io/badge/Razorpay_Buildathon-Track_04_AI_Finance_Controller-0c66e4)](https://razorpay.com/buildathon/)

An autonomous, multi-source financial reconciliation engine and interactive AI Finance Controller that reconciles messy financial data across bank statements, internal ledgers, and payment-processor exports, generates mathematical audit proofs with field-level diffing, reports cash positions by currency, and continuously benchmarks itself against multi-population evaluation sets.

Built for **Track 04 — AI Finance Controller** at the **Razorpay Buildathon**.

---

## 🏆 Key Measured Results

| Dataset / Population | Seed / Source | Truth Hash | Pairs | Fitness | Recall | Precision | FPR | Speed |
|---|---|---|---|---|---|---|---|---|
| **Dev (Mixed)** | Seed 42 + BenchRec | `f7c0b963363fca70` | 81/81 | **1.0000** | 1.0000 | 1.0000 | 0.0000 | ~920 rec/s |
| **Holdout Lock** | Seed 777 (Synthetic) | `e8e4fa7bb6da52a0` | 66/66 | **1.0000** | 1.0000 | 1.0000 | 0.0000 | ~1040 rec/s |
| **Hard Eval** | Seed 999 (Synthetic) | `b3057890b01ecebf` | 62/62 | **1.0000** | 1.0000 | 1.0000 | 0.0000 | ~760 rec/s |
| **10-Seed Cross-Validation** | 10 Populations | Multi-seed | 640/640 | **98.55%** | 99.19% | 99.67% | 0.32% | ±2.92% StdDev |

---

## ⚡ Core Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               ALL FINANCIAL TRANSACTIONS                │
                    │   (Bank Statements · Internal Ledgers · Processor APIs) │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
                                                 ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────┐
    │ TIER 1: Exact Hash-Join                                                                │
    │ Composite Hash Key on (Normalized Ref | Decimal Amount | ISO Date | Currency)          │
    │ ⚡ Throughput: ~15,000 rec/s | 🔒 Zero False Positives Guaranteed                      │
    └────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                 │ Residual Unresolved
                                                 ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────┐
    │ TIER 2: Deterministic Financial Heuristics & Indian Tax Schedules                      │
    │ • Dynamic Settlement Drift (T+2 tight, T+20 wide with invoice lock)                    │
    │ • Subset-Sum Reconstruction (Many-to-One / One-to-Many with collision guards)          │
    │ • Indian Statutory Rules: Razorpay 2.36% MDR (2% + 18% GST), TDS 194C/194J             │
    │ • UPI VPA (@okhdfcbank, @upi), NEFT/RTGS UTR (16-22 chars), IMPS RRN parsing           │
    │ • Cross-Currency FX Corridors (EUR/USD, USD/INR)                                       │
    └────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                 │ Ambiguous Complex Residuals
                                                 ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────┐
    │ TIER 3: Agentic AI with Batch Prompting & Multi-Provider Cascade                       │
    │ • Batch Prompting (5–8 residuals/prompt) → 80% lower latency & rate-limit immunity     │
    │ • Provider Cascade: Groq (Llama-3.3) ➔ OpenRouter (Free Cascade) ➔ Cerebras ➔ OpenAI   │
    │ • Atomic claiming with Decimal sum verification & Calibrated Confidence Floor (≥0.70)  │
    └────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
             RECONCILED AUDIT LEDGER                            HONEST EXCEPTIONS
       • Field-by-field diff inspection                  • Unmatchable suspense distractors
       • Per-currency cash positions                     • Missing counterparts with reason
       • Verifiable mathematical proofs                  • Actionable controller guidance
```

---

## 🚀 Quick Start

### 1. Installation
```sh
bun install
```

### 2. Environment Setup
Create `.env` (gitignored, isolated outside matcher logic):
```ini
OPENROUTER_API_KEY=your_key_here
# Optional high-speed providers:
GROQ_API_KEY=your_groq_key_here
OPENAI_API_KEY=your_openai_key_here
# External Answer Key (Required for eval)
GROUND_TRUTH_PATH=/absolute/path/outside/repo/ground-truth-dev.json
GROUND_TRUTH_HOLDOUT_PATH=/absolute/path/outside/repo/ground-truth-holdout.json
GROUND_TRUTH_HARD_PATH=/absolute/path/outside/repo/ground-truth-hard.json
```

### 3. Run Pipeline & Eval
```sh
# Generate standard, holdout, and hard datasets
bun run gen
bun run gen:holdout
bun run gen:hard

# Run full multi-seed generalization cross-validation
bun run cross-validate

# Run regression lock check
bun run loop-eval

# Start the interactive visual controller dashboard
bun run dev
# Open http://localhost:3000
```

---

## 🇮🇳 Indian Financial Ecosystem & Razorpay Specialization

The engine includes built-in domain logic tailored for Indian fintech and payment aggregation:

1. **UPI Virtual Payment Address (VPA) Matching**: Normalizes and matches VPAs across formats (`user@okhdfcbank`, `merchant@upi`, `rzp.order123@icici`).
2. **NEFT/RTGS UTR Reference Tracking**: Parses 16-to-22 character Indian Banking UTRs (e.g. `HDFCR52026060100012345`, `PUNBR5...`).
3. **MDR & GST Reconciliation**:
   - Standard Payment Gateway MDR (2.00%) + 18% GST on MDR = **2.36% net deduction** ($Net = Gross \times 0.9764$).
4. **TDS Withholding Schedules**:
   - Section 194J (10% Professional/Technical Fees withholding).
   - Section 194C (1% Individual / 2% Corporate Contractor withholding).
5. **Multi-Currency Cash Positions**: Real-time per-currency balance tracking (INR, USD, EUR) with reconciled vs unreconciled segregation.

---

## 🤖 Interactive AI Finance Controller Copilot

The dashboard includes a built-in interactive assistant powered by AI SDK tool calling:
- **Settlement Q&A**: Ask *"Why was B5012 marked as an exception?"* to get an immediate fact-grounded audit review.
- **Cash Position Risk**: Query *"Summarize unreconciled cash balance exposure for USD and INR"*.
- **Audit Trail Inspector**: Click any row in the web dashboard to open side-by-side field diffing with tolerance metrics.

---

## 🧪 Comprehensive Verification Suite

```sh
bun run typecheck       # Strict TypeScript check (0 errors)
bun test                # 87 automated unit & regression tests
bun run loop-eval       # Immutable Easy & Holdout lock checks
bun run cross-validate  # 10-population generalization matrix
```
