import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import app from "../index";
import { runPipeline } from "../pipeline/run";
import {
  createRazorpayOrder,
  generateOfflineRazorpayFixtures,
  getRazorpayCredentials,
  normalizeRazorpayOrder,
  normalizeRazorpayPayment,
  normalizeRazorpayRefund,
  normalizeRazorpaySettlement,
  syncRazorpayData,
  verifyPaymentSignature,
} from "./razorpay";
import { RecordSchema } from "../types";

describe("Razorpay Integration & Standard Checkout", () => {
  const creds = getRazorpayCredentials();

  describe("Credentials & Order Creation", () => {
    it("retrieves Razorpay Test credentials safely", () => {
      expect(creds.keyId).toBeDefined();
      expect(creds.keySecret).toBeDefined();
      expect(creds.keyId).toContain("rzp_test_");
    });

    it("rejects order creation for amounts less than 100 paise (< ₹1.00)", async () => {
      expect(createRazorpayOrder({ amount: 50 })).rejects.toThrow("at least 100 paise");
    });

    it("creates an order successfully with valid amount in paise", async () => {
      const order = await createRazorpayOrder({
        amount: 50000, // ₹500.00
        currency: "INR",
        receipt: "rcpt_test_001",
      });

      expect(order).toBeDefined();
      expect(order.order_id).toBeDefined();
      expect(order.amount).toBe(50000);
      expect(order.currency).toBe("INR");
    });
  });

  describe("HMAC-SHA256 Signature Verification", () => {
    const orderId = "order_DBJOWzybf0sJbb";
    const paymentId = "pay_29QQoUBi66xm2f";
    const payload = `${orderId}|${paymentId}`;
    const validSignature = createHmac("sha256", creds.keySecret).update(payload).digest("hex");

    it("validates a genuine HMAC-SHA256 signature", () => {
      const result = verifyPaymentSignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects an altered or forged signature", () => {
      const result = verifyPaymentSignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: "tampered_signature_hex_value_0000000000000000000000000000000000000000",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Signature verification failed");
    });

    it("rejects missing signature payload fields", () => {
      const result = verifyPaymentSignature({
        razorpay_order_id: "",
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required");
    });
  });

  describe("Data Normalization to FinRecord Schema", () => {
    it("normalizes a raw Razorpay Order into a ledger FinRecord", () => {
      const rawOrder = {
        id: "order_9A33XWu170gUtm",
        entity: "order" as const,
        amount: 150000, // ₹1,500.00
        amount_paid: 150000,
        amount_due: 0,
        currency: "INR",
        receipt: "rcpt_inv_9901",
        status: "paid",
        created_at: 1772323200,
      };

      const record = normalizeRazorpayOrder(rawOrder);
      expect(record.id).toBe("L_RZP_order_9A33XWu170gUtm");
      expect(record.source).toBe("ledger");
      expect(record.amount).toBe(1500);
      expect(record.currency).toBe("INR");
      expect(record.reference).toBe("order_9A33XWu170gUtm");
      expect(RecordSchema.safeParse(record).success).toBe(true);
    });

    it("normalizes a raw Razorpay Payment into a processor FinRecord with rail metadata", () => {
      const rawPayment = {
        id: "pay_29QQoUBi66xm2f",
        entity: "payment" as const,
        amount: 250000, // ₹2,500.00
        currency: "INR",
        status: "captured",
        order_id: "order_9A33XWu170gUtm",
        method: "upi",
        captured: true,
        fee: 5900, // ₹59.00 (2.36% MDR)
        tax: 900,
        vpa: "merchant@okhdfcbank",
        acquirer_data: {
          rrn: "612345678901",
        },
        created_at: 1772323200,
      };

      const record = normalizeRazorpayPayment(rawPayment);
      expect(record.id).toBe("P_RZP_pay_29QQoUBi66xm2f");
      expect(record.source).toBe("processor");
      expect(record.amount).toBe(2500);
      expect(record.currency).toBe("INR");
      expect(record.reference).toBe("pay_29QQoUBi66xm2f");
      expect(record.description).toContain("UPI:merchant@okhdfcbank");
      expect(record.description).toContain("RRN:612345678901");
      expect(record.description).toContain("for order_9A33XWu170gUtm");
      expect(RecordSchema.safeParse(record).success).toBe(true);
    });

    it("normalizes a raw Razorpay Refund into a ledger credit reversal FinRecord", () => {
      const rawRefund = {
        id: "rfnd_88291024",
        entity: "refund" as const,
        amount: 50000, // ₹500.00
        currency: "INR",
        payment_id: "pay_29QQoUBi66xm2f",
        status: "processed",
        created_at: 1772323200,
      };

      const record = normalizeRazorpayRefund(rawRefund);
      expect(record.id).toBe("L_RZP_rfnd_88291024");
      expect(record.source).toBe("ledger");
      expect(record.amount).toBe(-500);
      expect(RecordSchema.safeParse(record).success).toBe(true);
    });

    it("normalizes a raw Razorpay Settlement into a bank FinRecord", () => {
      const rawSettlement = {
        id: "setl_991823",
        entity: "settlement" as const,
        amount: 244100, // ₹2,441.00 net
        status: "processed",
        fees: 5000,
        tax: 900,
        utr: "HDFCR52026060100099",
        created_at: 1772323200,
      };

      const record = normalizeRazorpaySettlement(rawSettlement);
      expect(record.id).toBe("B_RZP_setl_991823");
      expect(record.source).toBe("bank");
      expect(record.amount).toBe(2441);
      expect(record.reference).toBe("HDFCR52026060100099");
      expect(RecordSchema.safeParse(record).success).toBe(true);
    });
  });

  describe("50+ Records Ingestion Pipeline & Reconciliation Loop", () => {
    it("ingests 50+ test-mode records and writes valid datasets to data/razorpay", async () => {
      const result = await syncRazorpayData("data/razorpay");
      expect(result.success).toBe(true);
      expect(result.totalRecords).toBeGreaterThanOrEqual(50);
      expect(result.counts.ledger).toBeGreaterThan(0);
      expect(result.counts.processor).toBeGreaterThan(0);
      expect(result.counts.bank).toBeGreaterThan(0);

      // Verify written JSON files exist and contain valid records
      for (const file of ["bank-statement.json", "internal-ledger.json", "processor-export.json"]) {
        const p = `data/razorpay/${file}`;
        expect(existsSync(p)).toBe(true);
        const rows = JSON.parse(readFileSync(p, "utf8"));
        expect(Array.isArray(rows)).toBe(true);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(RecordSchema.safeParse(row).success).toBe(true);
        }
      }
    });

    it("executes multi-tier reconciliation pipeline on ingested Razorpay records", async () => {
      const runResult = await runPipeline("data/razorpay", "results/razorpay-test-run.json", false);
      expect(runResult.stats.totalRecords).toBeGreaterThanOrEqual(50);
      expect(runResult.stats.matched).toBeGreaterThan(0);
      expect(runResult.outcomes.length).toBe(runResult.stats.totalRecords);
      expect(runResult.cashPosition).toBeDefined();
      expect(runResult.cashPosition?.INR).toBeDefined();
    });
  });

  describe("HTTP Server API Endpoints", () => {
    it("GET /api/razorpay/config returns public key ID without secret", async () => {
      const res = await app.fetch(new Request("http://localhost/api/razorpay/config"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.key_id).toBe(creds.keyId);
      expect(json).not.toHaveProperty("keySecret");
      expect(json).not.toHaveProperty("key_secret");
    });

    it("POST /api/create-order handles valid and invalid payloads", async () => {
      // Invalid (amount < 100 paise)
      const badRes = await app.fetch(
        new Request("http://localhost/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 50 }),
        })
      );
      expect(badRes.status).toBe(400);

      // Valid
      const goodRes = await app.fetch(
        new Request("http://localhost/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10000, currency: "INR" }),
        })
      );
      expect(goodRes.status).toBe(200);
      const goodJson = (await goodRes.json()) as any;
      expect(goodJson.order_id).toBeDefined();
      expect(goodJson.amount).toBe(10000);
    });

    it("POST /api/verify-payment validates signature", async () => {
      const orderId = "order_test_api_001";
      const paymentId = "pay_test_api_001";
      const payload = `${orderId}|${paymentId}`;
      const validSig = createHmac("sha256", creds.keySecret).update(payload).digest("hex");

      const validRes = await app.fetch(
        new Request("http://localhost/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: validSig,
          }),
        })
      );
      expect(validRes.status).toBe(200);
      const validJson = (await validRes.json()) as any;
      expect(validJson.success).toBe(true);

      const invalidRes = await app.fetch(
        new Request("http://localhost/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: "wrong_sig_0000000000000000000000000000000000000000000000000000000000000000",
          }),
        })
      );
      expect(invalidRes.status).toBe(400);
      const invalidJson = (await invalidRes.json()) as any;
      expect(invalidJson.success).toBe(false);
    });

    it("POST /api/integrations/razorpay/sync triggers ingestion and pipeline execution", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/integrations/razorpay/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetDir: "data/razorpay", runRecon: true }),
        })
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.sync.totalRecords).toBeGreaterThanOrEqual(50);
      expect(json.pipeline).toBeDefined();
    });
  });
});
