import React, { useState, useEffect, useRef } from "react";
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
  CardFooterLeading,
  CardFooterTrailing,
  Button,
  ChatInput,
  Code,
  Spinner,
  Avatar,
  ShieldIcon,
  CheckCircleIcon,
  CloseIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RazorSense,
  preloadRazorSenseAssets,
} from "@razorpay/blade/components";
import { toast } from "sonner";
import type {
  AgentChatResponse,
  ToolCallRecord,
  ActionApprovalRequest,
  AuditProofCertificate,
} from "@/types";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
  approvalRequests?: ActionApprovalRequest[];
  auditProof?: AuditProofCertificate;
  modelUsed?: string;
  timestamp: string;
}

interface AiControllerChatViewProps {
  initialPrompt?: string;
  dataset: string;
  onRefreshApprovals?: () => void;
  onOpenAuditProof?: (proof?: AuditProofCertificate) => void;
}

export const AiControllerChatView: React.FC<AiControllerChatViewProps> = ({
  initialPrompt,
  dataset,
  onRefreshApprovals,
  onOpenAuditProof,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      content:
        "Welcome! I am your AI Financial Reconciliation Controller. Ask me to verify bank balances, inspect suspense exceptions, explain matched pairs, simulate gateway fee adjustments, or export cryptographic audit proofs.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      modelUsed: "Llama-3.3-70B Controller",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<ActionApprovalRequest[]>([]);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [isWavePreloaded, setIsWavePreloaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    preloadRazorSenseAssets("bottomWave")
      .then(() => setIsWavePreloaded(true))
      .catch(() => setIsWavePreloaded(true));
  }, []);

  const fetchApprovals = async () => {
    try {
      const res = await fetch("/api/agent/pending-approvals");
      const data = await res.json();
      if (data.approvals) {
        setPendingApprovals(data.approvals);
      }
    } catch {}
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const toggleToolExpand = (key: string) => {
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    toast.info("Generation stopped");
  };

  const handleSendMessage = async (promptToSend?: string) => {
    const query = (promptToSend || inputPrompt).trim();
    if (!query || isLoading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsg: MessageItem = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setInputPrompt("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: query,
          dataset,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data: AgentChatResponse = await res.json();

      const assistantMsg: MessageItem = {
        id: `asst_${Date.now()}`,
        role: "assistant",
        content: data.reply || "Query analyzed.",
        toolCalls: data.toolCalls,
        approvalRequests: data.approvalRequests,
        auditProof: data.auditProof,
        modelUsed: data.modelUsed,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.approvalRequests && data.approvalRequests.length > 0) {
        fetchApprovals();
        onRefreshApprovals?.();
      }

      if (data.auditProof && onOpenAuditProof) {
        onOpenAuditProof(data.auditProof);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return;
      }
      toast.error(err.message || "Failed to communicate with controller");
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `Controller error: ${err.message || "Unknown error"}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovalDecision = async (
    token: string,
    decision: "approve" | "reject"
  ) => {
    try {
      const res = await fetch("/api/agent/approve-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decision,
          comment: `Authorized by human controller via web console`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      toast.success(data.message || `Action ${decision === "approve" ? "approved" : "declined"}`);
      fetchApprovals();
      onRefreshApprovals?.();

      setMessages((prev) => [
        ...prev,
        {
          id: `asst_appr_${Date.now()}`,
          role: "assistant",
          content: `Action token \`${token}\` was **${decision === "approve" ? "APPROVED" : "DECLINED"}**.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err: any) {
      toast.error(err.message || "Decision failed");
    }
  };

  const suggestedPrompts = [
    "Run summary & metrics",
    "Inspect cash & BRS variance",
    "Top exceptions",
    "Simulate 2.36% fee impact",
    "Export audit certificate",
  ];

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
              AI Financial Controller
            </Heading>
            <Badge color="primary" size="small">
              10 Grounded Tools
            </Badge>
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            Autonomous multi-step reasoning agent with deterministic financial verification and human-in-the-loop controls
          </Text>
        </Box>

        <Button
          variant="secondary"
          size="small"
          icon={ShieldIcon}
          iconPosition="left"
          onClick={() => handleSendMessage("export_audit_proof")}
          accessibilityLabel="Export Merkle audit certificate"
        >
          Export Audit Certificate
        </Button>
      </Box>

      {/* Main Layout */}
      <Box
        display="grid"
        gridTemplateColumns={{ base: "1fr", l: "8fr 4fr" }}
        gap="spacing.5"
      >
        {/* Left: Chat Stream with Ambient RazorSense Bottom Wave */}
        <Card padding="spacing.4">
          <CardBody>
            <Box
              position="relative"
              height="510px"
              overflow="hidden"
              borderRadius="medium"
              display="flex"
              flexDirection="column"
            >
              {/* Messages Scroll Area */}
              <Box
                position="relative"
                zIndex={2}
                flex="1"
                overflow="auto"
                display="flex"
                flexDirection="column"
                gap="spacing.3"
                padding="spacing.3"
              >
                {messages.map((msg) => (
                  <Box
                    key={msg.id}
                    display="flex"
                    justifyContent={msg.role === "user" ? "flex-end" : "flex-start"}
                    gap="spacing.2"
                  >
                    {msg.role === "assistant" && (
                      <Avatar
                        icon={SparklesIcon}
                        color="primary"
                        size="small"
                        variant="circle"
                      />
                    )}

                    <Box
                      maxWidth="85%"
                      padding="spacing.4"
                      borderRadius="medium"
                      backgroundColor={
                        msg.role === "user"
                          ? "surface.background.primary.intense"
                          : "surface.background.gray.subtle"
                      }
                      borderWidth="thin"
                      borderStyle="solid"
                      borderColor={
                        msg.role === "user"
                          ? "surface.border.primary.normal"
                          : "surface.border.gray.subtle"
                      }
                    >
                      <Text
                        size="small"
                        color={
                          msg.role === "user"
                            ? "surface.text.staticWhite.normal"
                            : "surface.text.gray.normal"
                        }
                      >
                        {msg.content}
                      </Text>

                      {/* Tool Invocations */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <Box
                          marginTop="spacing.3"
                          paddingTop="spacing.3"
                          borderTopWidth="thin"
                          borderTopStyle="solid"
                          borderTopColor="surface.border.gray.subtle"
                          display="flex"
                          flexDirection="column"
                          gap="spacing.2"
                        >
                          {msg.toolCalls.map((tc, idx) => {
                            const toolKey = `${msg.id}_tool_${idx}`;
                            const isExp = expandedTools[toolKey];
                            return (
                              <Box
                                key={idx}
                                padding="spacing.2"
                                borderRadius="small"
                                backgroundColor="surface.background.gray.intense"
                                borderWidth="thin"
                                borderStyle="solid"
                                borderColor="surface.border.gray.subtle"
                              >
                                <div
                                  onClick={() => toggleToolExpand(toolKey)}
                                  style={{ cursor: "pointer" }}
                                >
                                  <Box
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <Box display="flex" alignItems="center" gap="spacing.2">
                                      <SparklesIcon size="small" color="interactive.icon.primary.subtle" />
                                      <Code size="small">{tc.toolName}</Code>
                                    </Box>
                                    <Box display="flex" alignItems="center" gap="spacing.1">
                                      <Text size="xsmall" color="surface.text.gray.muted">
                                        {`${tc.durationMs}ms`}
                                      </Text>
                                      {isExp ? (
                                        <ChevronUpIcon size="small" color="surface.icon.gray.muted" />
                                      ) : (
                                        <ChevronDownIcon size="small" color="surface.icon.gray.muted" />
                                      )}
                                    </Box>
                                  </Box>
                                </div>

                                {isExp && (
                                  <Box
                                    marginTop="spacing.2"
                                    paddingTop="spacing.2"
                                    borderTopWidth="thin"
                                    borderTopStyle="solid"
                                    borderTopColor="surface.border.gray.subtle"
                                  >
                                    <Code size="small">
                                      {JSON.stringify(tc.result, null, 2)}
                                    </Code>
                                  </Box>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                      )}

                      {/* HITL Action Approvals */}
                      {msg.approvalRequests && msg.approvalRequests.length > 0 && (
                        <Box display="flex" flexDirection="column" gap="spacing.2" marginTop="spacing.3">
                          {msg.approvalRequests.map((req) => (
                            <Box
                              key={req.token}
                              padding="spacing.3"
                              borderRadius="medium"
                              backgroundColor="feedback.background.neutral.subtle"
                              borderWidth="thin"
                              borderStyle="solid"
                              borderColor="surface.border.gray.subtle"
                            >
                              <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom="spacing.1">
                                <Badge color="notice" size="small">
                                  {`Authorization Required: ${String(req.action || "action").toUpperCase()}`}
                                </Badge>
                                <Code size="small">{String(req.targetRecordId || "N/A")}</Code>
                              </Box>
                              <Text size="xsmall" color="surface.text.gray.muted" marginBottom="spacing.2">
                                {req.reason || "Action requires human controller confirmation before state mutation."}
                              </Text>
                              <Box display="flex" gap="spacing.2">
                                <Button
                                  size="xsmall"
                                  variant="primary"
                                  icon={CheckCircleIcon}
                                  iconPosition="left"
                                  onClick={() => handleApprovalDecision(req.token, "approve")}
                                  accessibilityLabel="Approve action"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="xsmall"
                                  variant="secondary"
                                  icon={CloseIcon}
                                  iconPosition="left"
                                  onClick={() => handleApprovalDecision(req.token, "reject")}
                                  accessibilityLabel="Decline action"
                                >
                                  Decline
                                </Button>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      )}

                      {/* Audit Certificate */}
                      {msg.auditProof && (
                        <Box
                          marginTop="spacing.3"
                          padding="spacing.3"
                          borderRadius="medium"
                          backgroundColor="surface.background.primary.subtle"
                          borderWidth="thin"
                          borderStyle="solid"
                          borderColor="interactive.border.primary.default"
                        >
                          <Box display="flex" alignItems="center" gap="spacing.2">
                            <ShieldIcon size="small" color="feedback.icon.positive.intense" />
                            <Text size="small" weight="semibold">
                              Audit Certificate Verified
                            </Text>
                          </Box>
                          <Text size="xsmall" color="surface.text.gray.muted" marginTop="spacing.1">
                            Merkle root: <Code size="small">{msg.auditProof.merkleRoot}</Code>
                          </Text>
                        </Box>
                      )}

                      <Box textAlign="right" marginTop="spacing.1">
                        <Text
                          size="xsmall"
                          color={
                            msg.role === "user"
                              ? "surface.text.staticWhite.muted"
                              : "surface.text.gray.muted"
                          }
                        >
                          {msg.timestamp}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                ))}

                {isLoading && (
                  <Box display="flex" alignItems="center" gap="spacing.2" padding="spacing.2">
                    <Spinner size="medium" accessibilityLabel="Reasoning" />
                    <Text size="small" color="surface.text.gray.muted">
                      Controller analyzing inquiry & evaluating double-entry invariants...
                    </Text>
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </Box>

              {/* Ambient RazorSense Bottom Wave */}
              {isWavePreloaded && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 120,
                    pointerEvents: "none",
                    opacity: 0.28,
                    mixBlendMode: "screen",
                  }}
                >
                  <RazorSense
                    width="100%"
                    height="100%"
                    preset="bottomWave"
                    edgeFeather={[0.5, 0, 0, 0]}
                  />
                </div>
              )}
            </Box>

            {/* Quick Inquiry Pills & Prompt Input */}
            <Box
              marginTop="spacing.3"
              paddingTop="spacing.3"
              borderTopWidth="thin"
              borderTopStyle="solid"
              borderTopColor="surface.border.gray.subtle"
              display="flex"
              flexDirection="column"
              gap="spacing.3"
            >
              {/* Quick Inquiry Pills */}
              <Box
                display="flex"
                alignItems="center"
                gap="spacing.2"
                overflow="auto"
                paddingBottom="spacing.1"
              >
                {suggestedPrompts.map((sp, idx) => (
                  <Button
                    key={idx}
                    variant="tertiary"
                    size="xsmall"
                    onClick={() => handleSendMessage(sp)}
                    accessibilityLabel={sp}
                  >
                    {sp}
                  </Button>
                ))}
              </Box>

              {/* ChatInput Component with hideFileUpload */}
              <ChatInput
                value={inputPrompt}
                onChange={({ value }) => setInputPrompt(value ?? "")}
                onSubmit={({ value }) => handleSendMessage(value)}
                placeholder="Ask the AI controller (e.g. explain match for B5001, verify BRS)..."
                isGenerating={isLoading}
                onStop={handleStopGeneration}
                suggestions={suggestedPrompts}
                onSuggestionAccept={({ suggestion }) => setInputPrompt(suggestion)}
                accessibilityLabel="AI finance controller chat input"
                hideFileUpload={true}
              />
            </Box>
          </CardBody>
        </Card>

        {/* Right Column: Verified Financial Operations & Pending Approvals */}
        <Box display="flex" flexDirection="column" gap="spacing.5">
          {/* Verified Financial Operations Card */}
          <Card padding="spacing.4">
            <CardHeader>
              <CardHeaderLeading
                title="Verified Financial Operations"
                subtitle="10 tools grounded against deterministic GL invariants"
              />
              <CardHeaderTrailing
                visual={
                  <Button
                    variant="secondary"
                    size="xsmall"
                    icon={ShieldIcon}
                    iconPosition="left"
                    onClick={() => handleSendMessage("export_audit_proof")}
                    accessibilityLabel="Export audit certificate"
                  >
                    Audit Cert
                  </Button>
                }
              />
            </CardHeader>
            <CardBody>
              <Box maxHeight="240px" overflow="auto" display="flex" flexDirection="column" gap="spacing.2">
                {[
                  { name: "get_run_summary", desc: "Aggregate statistics & tier breakdown" },
                  { name: "get_cash_position", desc: "Multi-currency balances & BRS statement" },
                  { name: "get_exceptions", desc: "Filter unresolved exception ledger" },
                  { name: "get_exception_detail", desc: "Field diffs & candidate pool analysis" },
                  { name: "explain_match", desc: "Verifiable mathematical match proof" },
                  { name: "force_match", desc: "Manual match with HITL authorization" },
                  { name: "mark_as_suspense", desc: "Route to GL-9999 with approval token" },
                  { name: "re_run_residuals", desc: "Re-evaluate residual exception pool" },
                  { name: "simulate_what_if", desc: "Simulate fee & tolerance adjustments" },
                  { name: "export_audit_proof", desc: "Cryptographic SHA-256 Merkle root proof" },
                ].map((t) => (
                  <div
                    key={t.name}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSendMessage(`Explain how ${t.name} works and run an inspection.`)}
                  >
                    <Box
                      padding="spacing.2"
                      borderRadius="small"
                      backgroundColor="surface.background.gray.subtle"
                      borderWidth="thin"
                      borderStyle="solid"
                      borderColor="surface.border.gray.subtle"
                      display="flex"
                      flexDirection="column"
                      gap="spacing.1"
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Code size="small">{t.name}</Code>
                        <Text size="xsmall" color="feedback.text.information.intense" weight="medium">
                          Grounded
                        </Text>
                      </Box>
                      <Text size="xsmall" color="surface.text.gray.muted">
                        {t.desc}
                      </Text>
                    </Box>
                  </div>
                ))}
              </Box>
            </CardBody>
          </Card>

          {/* Pending Approvals Card */}
          <Card padding="spacing.4">
            <CardHeader>
              <CardHeaderLeading
                title="Pending Approvals"
                subtitle="Human-in-the-loop authorization queue"
              />
              <CardHeaderTrailing
                visual={
                  <Badge color={pendingApprovals.length > 0 ? "notice" : "neutral"} size="small">
                    {`${pendingApprovals.length} pending`}
                  </Badge>
                }
              />
            </CardHeader>
            <CardBody>
              {pendingApprovals.length === 0 ? (
                <Box
                  padding="spacing.5"
                  borderRadius="medium"
                  backgroundColor="surface.background.gray.subtle"
                  textAlign="center"
                >
                  <Text size="small" color="surface.text.gray.muted">
                    No pending state mutation requests.
                  </Text>
                </Box>
              ) : (
                <Box display="flex" flexDirection="column" gap="spacing.3">
                  {pendingApprovals.map((req) => (
                    <Box
                      key={req.token}
                      padding="spacing.3"
                      borderRadius="medium"
                      backgroundColor="surface.background.gray.subtle"
                      borderWidth="thin"
                      borderStyle="solid"
                      borderColor="surface.border.gray.subtle"
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom="spacing.1">
                        <Badge color="notice" size="small">
                          {String(req?.action || "action").toUpperCase()}
                        </Badge>
                        <Code size="small">{String(req?.targetRecordId || "N/A")}</Code>
                      </Box>
                      <Text size="xsmall" color="surface.text.gray.muted" marginBottom="spacing.2">
                        {req.reason || "Action pending authorization"}
                      </Text>
                      <Box display="flex" gap="spacing.2">
                        <Button
                          size="xsmall"
                          variant="primary"
                          icon={CheckCircleIcon}
                          iconPosition="left"
                          onClick={() => handleApprovalDecision(req.token, "approve")}
                          accessibilityLabel="Approve"
                        >
                          Approve
                        </Button>
                        <Button
                          size="xsmall"
                          variant="secondary"
                          icon={CloseIcon}
                          iconPosition="left"
                          onClick={() => handleApprovalDecision(req.token, "reject")}
                          accessibilityLabel="Decline"
                        >
                          Decline
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardBody>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

