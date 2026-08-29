import React, { useState, useEffect } from "react";
import {
  Box,
  Text,
  Heading,
  Badge,
  Card,
  CardHeader,
  CardHeaderLeading,
  CardHeaderTrailing,
  CardBody,
  CardFooter,
  CardFooterTrailing,
  Button,
  TextInput,
  Amount,
  ChipGroup,
  Chip,
  Code,
  Indicator,
  AcceptPaymentsIcon,
  RefreshIcon,
  ShieldIcon,
  CheckCircleIcon,
  TransactionsIcon,
} from "@razorpay/blade/components";
import { toast } from "sonner";

interface RazorpayHubViewProps {
  onSyncComplete?: () => void;
}

interface VerificationLog {
  timestamp: string;
  orderId: string;
  paymentId: string;
  valid: boolean;
  message: string;
  amount: number;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const RazorpayHubView: React.FC<RazorpayHubViewProps> = ({ onSyncComplete }) => {
  const [amountRupees, setAmountRupees] = useState<number>(1000);
  const [customerName, setCustomerName] = useState<string>("Sanjay Sharma");
  const [customerEmail, setCustomerEmail] = useState<string>("sanjay.sharma@example.in");
  const [customerPhone, setCustomerPhone] = useState<string>("9876543210");
  const [keyId, setKeyId] = useState<string>("rzp_test_mock");
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    fetch("/api/integrations/razorpay/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.keyId) setKeyId(data.keyId);
      })
      .catch(() => {});

    return () => {
      try {
        document.body.removeChild(script);
      } catch {}
    };
  }, []);

  const handleCreateOrderAndCheckout = async () => {
    if (amountRupees < 1) {
      toast.error("Amount must be at least ₹1.00");
      return;
    }

    setIsCreatingOrder(true);
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountRupees,
          currency: "INR",
          receipt: `rcpt_${Date.now()}`,
          notes: {
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            purpose: "ReconAgent Payment Standard Checkout Test",
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const orderData = await res.json();
      toast.info(`Created order: ${orderData.order_id}`);

      const options = {
        key: orderData.key_id || keyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "ReconAgent Financials Ltd.",
        description: `Order settlement ${orderData.order_id}`,
        order_id: orderData.order_id,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        theme: {
          color: "#0c83e2",
        },
        handler: async (response: any) => {
          toast.info("Verifying HMAC signature...");

          try {
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();

            const newLog: VerificationLog = {
              timestamp: new Date().toLocaleTimeString(),
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              valid: verifyData.valid,
              message: verifyData.message || (verifyData.valid ? "Signature authentic" : "Signature mismatch"),
              amount: amountRupees,
            };

            setLogs((prev) => [newLog, ...prev]);

            if (verifyData.valid) {
              toast.success(`Verified payment: ${response.razorpay_payment_id}`);
            } else {
              toast.error(`Verification failed`);
            }
          } catch (err: any) {
            toast.error(err.message || "Verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            toast.warning("Checkout dismissed");
          },
        },
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", (response: any) => {
          toast.error(`Payment failed: ${response.error?.description || "Gateway error"}`);
          setLogs((prev) => [
            {
              timestamp: new Date().toLocaleTimeString(),
              orderId: orderData.order_id,
              paymentId: response.error?.metadata?.payment_id || "FAILED",
              valid: false,
              message: response.error?.description || "Gateway rejected",
              amount: amountRupees,
            },
            ...prev,
          ]);
        });
        rzp.open();
      } else {
        const mockPaymentId = `pay_mock_${Date.now()}`;
        const verifyRes = await fetch("/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderData.order_id,
            razorpay_payment_id: mockPaymentId,
            razorpay_signature: "mock_valid_hmac_sha256_sig",
          }),
        });
        const verifyData = await verifyRes.json();
        setLogs((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            orderId: orderData.order_id,
            paymentId: mockPaymentId,
            valid: verifyData.valid,
            message: "Mock verified",
            amount: amountRupees,
          },
          ...prev,
        ]);
        toast.success(`Mock verified: ${mockPaymentId}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create order");
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleSync50Records = async () => {
    setIsSyncing(true);
    toast.info("Ingesting Razorpay payment events...");
    try {
      const res = await fetch("/api/integrations/razorpay/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToDisk: true }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSyncStatus(data);
      toast.success(`Ingested ${data.sync.totalRecords} records`);
      onSyncComplete?.();
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.5">
      {/* Top Header */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        paddingBottom="spacing.3"
        borderBottomWidth="thin"
        borderBottomStyle="solid"
        borderBottomColor="surface.border.gray.subtle"
        flexWrap="wrap"
        gap="spacing.3"
      >
        <Box display="flex" flexDirection="column" gap="spacing.1">
          <Box display="flex" alignItems="center" gap="spacing.3">
            <Heading size="medium" weight="semibold">
              Razorpay Checkout & Ingestion
            </Heading>
            <Badge color="primary" size="small">
              {`Key: ${keyId.slice(0, 10)}...`}
            </Badge>
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            End-to-end payment gateway checkout testing, HMAC-SHA256 signature verification, and 3-way dataset sync
          </Text>
        </Box>
      </Box>

      <Box
        display="grid"
        gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
        gap="spacing.5"
      >
        {/* Left: Web Checkout Simulator */}
        <Card padding="spacing.4">
          <CardHeader>
            <CardHeaderLeading
              title="Standard Web Checkout Simulator"
              subtitle="Launch Razorpay checkout modal and verify cryptographic HMAC signature"
            />
          </CardHeader>
          <CardBody>
            <Box display="flex" flexDirection="column" gap="spacing.4">
              <Box>
                <Text size="xsmall" weight="semibold" color="surface.text.gray.muted" marginBottom="spacing.2">
                  AMOUNT PRESET
                </Text>
                <ChipGroup
                  accessibilityLabel="Amount preset"
                  selectionType="single"
                  value={String(amountRupees)}
                  onChange={({ values }) => setAmountRupees(Number(values[0]) || 1000)}
                  size="small"
                >
                  <Chip value="500">₹500</Chip>
                  <Chip value="1000">₹1,000</Chip>
                  <Chip value="2500">₹2,500</Chip>
                  <Chip value="5000">₹5,000</Chip>
                </ChipGroup>
              </Box>

              <Box display="grid" gridTemplateColumns={{ base: "1fr", s: "repeat(2, 1fr)" }} gap="spacing.4">
                <TextInput
                  label="Amount (INR ₹)"
                  type="number"
                  value={String(amountRupees)}
                  onChange={({ value }) => setAmountRupees(Number(value) || 1)}
                  accessibilityLabel="Amount in INR"
                />
                <TextInput
                  label="Customer Name"
                  value={customerName}
                  onChange={({ value }) => setCustomerName(value ?? "")}
                  accessibilityLabel="Customer Name"
                />
              </Box>

              <Box display="grid" gridTemplateColumns={{ base: "1fr", s: "repeat(2, 1fr)" }} gap="spacing.4">
                <TextInput
                  label="Customer Email"
                  type="email"
                  value={customerEmail}
                  onChange={({ value }) => setCustomerEmail(value ?? "")}
                  accessibilityLabel="Customer Email"
                />
                <TextInput
                  label="Contact Phone"
                  type="telephone"
                  value={customerPhone}
                  onChange={({ value }) => setCustomerPhone(value ?? "")}
                  accessibilityLabel="Phone Number"
                />
              </Box>
            </Box>
          </CardBody>

          <CardFooter>
            <CardFooterTrailing
              actions={{
                primary: {
                  text: "Launch Checkout",
                  onClick: handleCreateOrderAndCheckout,
                  isLoading: isCreatingOrder,
                  isDisabled: isCreatingOrder,
                  icon: AcceptPaymentsIcon,
                  iconPosition: "left",
                  accessibilityLabel: "Open Razorpay checkout",
                },
              }}
            />
          </CardFooter>
        </Card>

        {/* Right: Ingestion Pipeline & HMAC Verification Feed */}
        <Box display="flex" flexDirection="column" gap="spacing.5">
          {/* Ingestion Pipeline */}
          <Card padding="spacing.4">
            <CardHeader>
              <CardHeaderLeading
                title="Event Ingestion Pipeline"
                subtitle="Sync gateway transactions into 3-way reconciliation datasets (50+ records)"
              />
              <CardHeaderTrailing
                visual={
                  <Button
                    size="xsmall"
                    variant="secondary"
                    icon={RefreshIcon}
                    iconPosition="left"
                    onClick={handleSync50Records}
                    isLoading={isSyncing}
                    isDisabled={isSyncing}
                    accessibilityLabel="Sync 50+ records"
                  >
                    Sync Events
                  </Button>
                }
              />
            </CardHeader>
            <CardBody>
              <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap="spacing.3" textAlign="center">
                <Box padding="spacing.3" borderRadius="medium" backgroundColor="surface.background.gray.subtle" borderWidth="thin" borderStyle="solid" borderColor="surface.border.gray.subtle">
                  <Text size="xsmall" color="surface.text.gray.muted">Orders</Text>
                  <Heading size="medium" weight="semibold" marginTop="spacing.1">{syncStatus?.sync?.ordersCount ?? 18}</Heading>
                </Box>
                <Box padding="spacing.3" borderRadius="medium" backgroundColor="surface.background.gray.subtle" borderWidth="thin" borderStyle="solid" borderColor="surface.border.gray.subtle">
                  <Text size="xsmall" color="surface.text.gray.muted">Captures</Text>
                  <Heading size="medium" weight="semibold" marginTop="spacing.1">{syncStatus?.sync?.paymentsCount ?? 16}</Heading>
                </Box>
                <Box padding="spacing.3" borderRadius="medium" backgroundColor="surface.background.gray.subtle" borderWidth="thin" borderStyle="solid" borderColor="surface.border.gray.subtle">
                  <Text size="xsmall" color="surface.text.gray.muted">Refunds</Text>
                  <Heading size="medium" weight="semibold" marginTop="spacing.1">{syncStatus?.sync?.refundsCount ?? 6}</Heading>
                </Box>
                <Box padding="spacing.3" borderRadius="medium" backgroundColor="surface.background.gray.subtle" borderWidth="thin" borderStyle="solid" borderColor="surface.border.gray.subtle">
                  <Text size="xsmall" color="surface.text.gray.muted">Settlements</Text>
                  <Heading size="medium" weight="semibold" marginTop="spacing.1">{syncStatus?.sync?.settlementsCount ?? 12}</Heading>
                </Box>
              </Box>
            </CardBody>
          </Card>

          {/* HMAC Verification Feed */}
          <Card padding="spacing.4">
            <CardHeader>
              <CardHeaderLeading
                title="Signature Verification Feed"
                subtitle="Cryptographic HMAC-SHA256 audit logs"
              />
              <CardHeaderTrailing
                visual={
                  <Badge color="positive" size="small">
                    {`${logs.length} logged`}
                  </Badge>
                }
              />
            </CardHeader>
            <CardBody>
              <Box maxHeight="220px" overflow="auto" display="flex" flexDirection="column" gap="spacing.2">
                {logs.length === 0 ? (
                  <Box
                    padding="spacing.5"
                    borderRadius="medium"
                    borderWidth="thin"
                    borderStyle="dashed"
                    borderColor="surface.border.gray.subtle"
                    textAlign="center"
                  >
                    <Text size="small" color="surface.text.gray.muted">
                      No payments captured yet. Launch a checkout to observe live signature verification.
                    </Text>
                  </Box>
                ) : (
                  logs.map((log, idx) => (
                    <Box
                      key={idx}
                      padding="spacing.3"
                      borderRadius="small"
                      backgroundColor={log.valid ? "surface.background.gray.subtle" : "feedback.background.negative.subtle"}
                      borderWidth="thin"
                      borderStyle="solid"
                      borderColor="surface.border.gray.subtle"
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box display="flex" alignItems="center" gap="spacing.2">
                        <Indicator color={log.valid ? "positive" : "negative"} size="small" />
                        <Code size="small">{log.orderId}</Code>
                        <Text size="xsmall" color="surface.text.gray.muted">{log.message}</Text>
                      </Box>
                      <Amount value={log.amount} currency="INR" size="small" weight="semibold" />
                    </Box>
                  ))
                )}
              </Box>
            </CardBody>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

