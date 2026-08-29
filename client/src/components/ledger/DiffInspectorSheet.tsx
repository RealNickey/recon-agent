import React from "react";
import {
  Drawer,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Box,
  Text,
  Badge,
  Button,
  Amount,
  Code,
  Alert,
  CheckCircleIcon,
  SparklesIcon,
  BookIcon,
  BuildingIcon,
  CreditCardIcon,
} from "@razorpay/blade/components";
import type { FinRecord, Outcome, AuditTrail } from "@/types";

interface DiffInspectorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcome: Outcome | null;
  targetRecord: FinRecord | null;
  counterparts: FinRecord[];
  onExplainMatch?: (recordId: string) => void;
  onForceMatch?: (recordId: string) => void;
  onMarkSuspense?: (recordId: string) => void;
}

export const DiffInspectorSheet: React.FC<DiffInspectorSheetProps> = ({
  open,
  onOpenChange,
  outcome,
  targetRecord,
  counterparts,
  onExplainMatch,
  onForceMatch,
  onMarkSuspense,
}) => {
  if (!outcome && !targetRecord) return null;

  const isMatched = outcome?.status === "matched";
  const tier = outcome?.tier ?? 1;
  const auditTrail: AuditTrail | undefined = outcome?.auditTrail;
  const recordId = outcome?.recordId || targetRecord?.id || "";

  const getSourceIcon = (src?: string) => {
    switch (src) {
      case "bank":
        return BuildingIcon;
      case "processor":
        return CreditCardIcon;
      case "ledger":
      default:
        return BookIcon;
    }
  };

  const TargetIcon = getSourceIcon(targetRecord?.source);

  return (
    <Drawer isOpen={open} onDismiss={() => onOpenChange(false)}>
      <DrawerHeader
        title={`Audit evidence: ${recordId}`}
        subtitle="Field-level comparison and counterpart validation"
      />
      <DrawerBody>
        <Box display="flex" flexDirection="column" gap="spacing.4">
          {/* Top Status Strip */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            padding="spacing.4"
            borderRadius="medium"
            backgroundColor="surface.background.gray.subtle"
            borderWidth="thin"
            borderStyle="solid"
            borderColor="surface.border.gray.subtle"
          >
            <Box display="flex" alignItems="center" gap="spacing.2">
              <Badge
                color={isMatched ? "positive" : "negative"}
                size="medium"
                emphasis="subtle"
              >
                {isMatched ? "Reconciled pair" : "Unmatched item"}
              </Badge>
              {isMatched && (
                <Badge color="primary" size="medium" emphasis="subtle">
                  {`Tier ${tier}`}
                </Badge>
              )}
            </Box>

            {(outcome as any)?.durationMs !== undefined && (
              <Text size="xsmall" color="surface.text.gray.muted">
                Evaluated in {(outcome as any).durationMs}ms
              </Text>
            )}
          </Box>

          {/* Target Transaction Record Details */}
          {targetRecord && (
            <Box
              padding="spacing.4"
              borderRadius="medium"
              backgroundColor="surface.background.gray.subtle"
              borderWidth="thin"
              borderStyle="solid"
              borderColor="surface.border.gray.subtle"
            >
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                marginBottom="spacing.3"
              >
                <Box display="flex" alignItems="center" gap="spacing.2">
                  <TargetIcon size="small" color="surface.icon.gray.muted" />
                  <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                    {`TARGET ${targetRecord.source ? targetRecord.source.toUpperCase() : "LEDGER"} RECORD`}
                  </Text>
                </Box>
                <Amount
                  value={targetRecord.amount}
                  currency={targetRecord.currency as any}
                  size="medium"
                  type="heading"
                  weight="semibold"
                />
              </Box>

              <Box
                display="grid"
                gridTemplateColumns="repeat(2, 1fr)"
                gap="spacing.3"
              >
                <Box>
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Record ID
                  </Text>
                  <Code size="small">{targetRecord.id}</Code>
                </Box>
                <Box>
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Posting date
                  </Text>
                  <Text size="small" weight="medium">
                    {targetRecord.date}
                  </Text>
                </Box>
                <Box gridColumn="1 / -1">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Description
                  </Text>
                  <Text size="small" weight="medium">
                    {targetRecord.description}
                  </Text>
                </Box>
                <Box gridColumn="1 / -1">
                  <Text size="xsmall" color="surface.text.gray.muted">
                    Reference
                  </Text>
                  <Code size="small">{targetRecord.reference || "None"}</Code>
                </Box>
              </Box>
            </Box>
          )}

          {/* Matched Counterpart Cards */}
          {isMatched && counterparts.length > 0 ? (
            <Box display="flex" flexDirection="column" gap="spacing.3">
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box display="flex" alignItems="center" gap="spacing.2">
                  <CheckCircleIcon size="small" color="feedback.icon.positive.intense" />
                  <Text size="small" weight="semibold" color="surface.text.gray.normal">
                    Matched counterparts ({counterparts.length})
                  </Text>
                </Box>
                <Badge color="positive" size="small">
                  {`Confidence ${((outcome?.confidence ?? 1.0) * 100).toFixed(0)}%`}
                </Badge>
              </Box>

              {counterparts.map((cp) => {
                const CpIcon = getSourceIcon(cp.source);
                return (
                  <Box
                    key={cp.id}
                    padding="spacing.4"
                    borderRadius="medium"
                    backgroundColor="surface.background.primary.subtle"
                    borderWidth="thin"
                    borderStyle="solid"
                    borderColor="interactive.border.primary.default"
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      marginBottom="spacing.3"
                    >
                      <Box display="flex" alignItems="center" gap="spacing.2">
                        <CpIcon size="small" color="interactive.icon.primary.subtle" />
                        <Text size="xsmall" weight="semibold" color="surface.text.primary.normal">
                          {`${cp.source ? cp.source.toUpperCase() : "COUNTERPART"}`}
                        </Text>
                      </Box>
                      <Amount
                        value={cp.amount}
                        currency={cp.currency as any}
                        size="medium"
                        type="heading"
                        weight="semibold"
                      />
                    </Box>

                    <Box
                      display="grid"
                      gridTemplateColumns="repeat(2, 1fr)"
                      gap="spacing.3"
                    >
                      <Box>
                        <Text size="xsmall" color="surface.text.gray.muted">
                          Counterpart ID
                        </Text>
                        <Code size="small">{cp.id}</Code>
                      </Box>
                      <Box>
                        <Text size="xsmall" color="surface.text.gray.muted">
                          Settlement date
                        </Text>
                        <Text size="small" weight="medium">
                          {cp.date}
                        </Text>
                      </Box>
                      <Box gridColumn="1 / -1">
                        <Text size="xsmall" color="surface.text.gray.muted">
                          Description
                        </Text>
                        <Text size="small" weight="medium">
                          {cp.description}
                        </Text>
                      </Box>
                      <Box gridColumn="1 / -1">
                        <Text size="xsmall" color="surface.text.gray.muted">
                          Reference
                        </Text>
                        <Code size="small">{cp.reference || "None"}</Code>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Alert
              color="notice"
              title={`Unmatched item — Reason: ${
                outcome?.status === "exception" ? outcome.reasonCode : "unmatched"
              }`}
              description={
                outcome?.reasoning ||
                "No counterpart met calibrated confidence threshold (≥ 0.70)."
              }
              isDismissible={false}
            />
          )}

          {/* Field Similarity Evidence */}
          {auditTrail?.evidence && auditTrail.evidence.length > 0 && (
            <Box display="flex" flexDirection="column" gap="spacing.2">
              <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                FIELD SIMILARITY ANALYSIS
              </Text>

              <Box
                borderWidth="thin"
                borderStyle="solid"
                borderColor="surface.border.gray.subtle"
                borderRadius="medium"
                overflow="hidden"
              >
                <Box
                  display="grid"
                  gridTemplateColumns="1fr 1fr 1fr 60px"
                  paddingX="spacing.3"
                  paddingY="spacing.2"
                  backgroundColor="surface.background.gray.subtle"
                  borderBottomWidth="thin"
                  borderBottomStyle="solid"
                  borderBottomColor="surface.border.gray.subtle"
                >
                  <Text size="xsmall" weight="semibold">Field</Text>
                  <Text size="xsmall" weight="semibold">Target</Text>
                  <Text size="xsmall" weight="semibold">Counterpart</Text>
                  <Text size="xsmall" weight="semibold" textAlign="right">Similarity</Text>
                </Box>

                {auditTrail.evidence.map((ev, i) => (
                  <Box
                    key={i}
                    display="grid"
                    gridTemplateColumns="1fr 1fr 1fr 60px"
                    paddingX="spacing.3"
                    paddingY="spacing.2"
                    borderBottomWidth={i < auditTrail.evidence.length - 1 ? "thin" : "none"}
                    borderBottomStyle="solid"
                    borderBottomColor="surface.border.gray.subtle"
                  >
                    <Text size="xsmall" weight="semibold" color="surface.text.gray.subtle">
                      {ev.field}
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>
                      {String(ev.recordAVal)}
                    </Text>
                    <Text size="xsmall" color="surface.text.gray.muted" truncateAfterLines={1}>
                      {String(ev.recordBVal)}
                    </Text>
                    <Text size="xsmall" weight="semibold" textAlign="right" color="surface.text.primary.normal">
                      {(ev.similarity * 100).toFixed(0)}%
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Rule Triggered Note */}
          <Box
            padding="spacing.3"
            borderRadius="medium"
            backgroundColor="surface.background.gray.subtle"
          >
            <Text size="xsmall" color="surface.text.gray.muted">
              Rule trigger: <Code size="small">{auditTrail?.ruleTriggered || (isMatched ? "T1_EXACT_REFERENCE" : "UNMATCHED_SUSPENSE")}</Code>
            </Text>
          </Box>
        </Box>
      </DrawerBody>

      <DrawerFooter>
        <Box display="flex" justifyContent="flex-end" gap="spacing.2">
          {onExplainMatch && (
            <Button
              variant="tertiary"
              size="small"
              icon={SparklesIcon}
              iconPosition="left"
              onClick={() => onExplainMatch(recordId)}
            >
              Ask AI controller
            </Button>
          )}
          {!isMatched && onMarkSuspense && (
            <Button
              variant="secondary"
              size="small"
              onClick={() => onMarkSuspense(recordId)}
            >
              Move to suspense
            </Button>
          )}
          {!isMatched && onForceMatch && (
            <Button
              variant="primary"
              size="small"
              onClick={() => onForceMatch(recordId)}
            >
              Propose match
            </Button>
          )}
        </Box>
      </DrawerFooter>
    </Drawer>
  );
};
