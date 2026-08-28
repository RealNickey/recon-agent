# Security & Strict Isolation Rules

## 1. Environment and Secrets Protection
- **NEVER** read, inspect, print, or edit `.env` or `.env.*` files under any circumstances.
- **NEVER** run commands that expose environment variables (such as `printenv`, `env`, `set`, `Get-ChildItem env:`, `echo $env:*`, or reading process environment).
- All secret resolution is handled exclusively at runtime by the execution environment.

## 2. Blind Evaluation Integrity
- **NEVER** attempt to locate, read, or inspect external ground truth files or answer keys (`GROUND_TRUTH_PATH`, `GROUND_TRUTH_HOLDOUT_PATH`, `GROUND_TRUTH_HARD_PATH`).
- All reconciliation logic in `src/` must remain strictly blind and generic across all datasets.
- Scoring and evaluation are performed only via the designated eval harness (`bun run eval`, `bun run loop-eval`).
