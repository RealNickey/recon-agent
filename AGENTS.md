# AGENTS.md — Workspace Rules & Autonomous Agent Reference

Refer to [AGENT.md](AGENT.md) for the complete engineering reference, scoring formulas, and category playbooks.

## Strict Rules
1. **NEVER read, view, or inspect `.env` or `.env.*` files.**
2. **NEVER execute shell commands that print environment variables.**
3. **NEVER search for or read external ground truth answer keys.**
4. **Dev (1.0000) and Holdout (1.0000) regression locks are immutable.**
5. **Always verify using `bun run typecheck && bun test && bun run loop-eval`.**
