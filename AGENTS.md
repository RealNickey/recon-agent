# AGENTS.md — Workspace Rules & Autonomous Agent Reference

Refer to [AGENT.md](AGENT.md) for the complete engineering reference, scoring formulas, and category playbooks.

## Strict Rules
1. **NEVER read, view, or inspect `.env` or `.env.*` files.**
2. **NEVER execute shell commands that print environment variables.**
3. **NEVER search for or read external ground truth answer keys.**
4. **Dev (1.0000) and Holdout (1.0000) regression locks are immutable.**
5. **Always verify using `bun run typecheck && bun test && bun run loop-eval`.**

---

## Razorpay Gateway & Standard Web Checkout Integration Reference

The project includes an end-to-end integration with Razorpay Standard Web Checkout and Live Test-Mode API Connector in `src/integrations/razorpay.ts`.

### 1. Checkout & Payment Verification Flow
- **Order Creation**: `POST /api/create-order`
  - Validates amount $\ge 100\text{ paise}$ (₹1.00 minimum).
  - Interacts with `POST https://api.razorpay.com/v1/orders` using HTTP Basic Auth.
  - Falls back seamlessly to offline mock orders when credentials are not configured or offline.
- **Frontend Modal**: Standard Razorpay Web Checkout SDK (`checkout.razorpay.com/v1/checkout.js`).
  - Launches modal with `order_id` and public `key_id`.
  - Handles dismissal, payment failure events, and success callbacks.
- **Signature Verification**: `POST /api/verify-payment`
  - Computes $\text{HMAC-SHA256}(\text{order\_id} + "|" + \text{payment\_id}, \text{KEY\_SECRET})$ with constant-time equality.
  - Secret key `RAZORPAY_KEY_SECRET` remains strictly isolated on the backend.

### 2. 50+ Records Ingestion Pipeline (`POST /api/integrations/razorpay/sync`)
- Ingests test-mode records across `/orders`, `/payments`, `/refunds`, and `/settlements`.
- Normalizes raw payloads to typed `FinRecord` schema with Decimal conversion ($100\text{ paise} = \text{₹}1.00$).
- Detects Indian payment rails: UPI VPAs, IMPS RRNs, NEFT/RTGS UTR numbers, and Razorpay standard MDR deductions ($2.36\% = 2\% \text{ fee} + 18\% \text{ GST}$).
- Offline mock fallback guarantees $50+$ records across all 3 source files (`internal-ledger.json`, `processor-export.json`, `bank-statement.json`) for CI & test stability.

