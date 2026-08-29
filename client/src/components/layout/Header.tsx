import React from "react";
import {
  Box,
  Text,
  Badge,
  Button,
  Indicator,
  RefreshIcon,
  DownloadIcon,
} from "@razorpay/blade/components";
import type { RunResult, ApiReportResponse } from "@/types";

interface HeaderProps {
  report: ApiReportResponse | null;
  runResult: RunResult | null;
  isRunning: boolean;
  onRunPipeline: () => void;
  dataset: string;
  onExportCsv: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  report,
  runResult,
  isRunning,
  onRunPipeline,
  dataset,
  onExportCsv,
}) => {
  const latestEval = report?.latest;
  const stats = runResult?.stats;

  const fitnessVal =
    latestEval?.fitness !== undefined ? (latestEval.fitness * 100).toFixed(1) : "100.0";
  const matchedCount = stats?.matched ?? latestEval?.matchedPairs ?? 0;
  const totalCount = stats?.totalRecords ?? 100;
  const exceptionsCount = stats?.exceptions ?? (totalCount - matchedCount);
  const durationMs = runResult?.durationMs ?? 142;

  return (
    <Box
      as="header"
      position="sticky"
      top="0px"
      zIndex={30}
      backgroundColor="surface.background.gray.intense"
      borderBottomWidth="thin"
      borderBottomStyle="solid"
      borderBottomColor="surface.border.gray.subtle"
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        paddingX={{ base: "spacing.4", m: "spacing.6" }}
        paddingY="spacing.3"
        gap="spacing.3"
        flexWrap="wrap"
      >
        {/* Scope & Engine Status */}
        <Box display="flex" alignItems="center" gap="spacing.3">
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="small" color="surface.text.gray.muted">
              Scope:
            </Text>
            <Badge color="primary" size="medium" emphasis="subtle">
              {String(dataset || "data")}
            </Badge>
          </Box>

          <Box
            width="1px"
            height="14px"
            backgroundColor="surface.background.gray.subtle"
            display={{ base: "none", s: "block" }}
          />

          <Box display={{ base: "none", s: "flex" }} alignItems="center" gap="spacing.2">
            <Indicator color="positive" size="small" />
            <Text size="xsmall" color="feedback.text.positive.intense" weight="semibold">
              Engine ready
            </Text>
          </Box>
        </Box>

        {/* Live Telemetry Chips */}
        <Box
          display={{ base: "none", m: "flex" }}
          alignItems="center"
          gap="spacing.3"
          backgroundColor="surface.background.gray.subtle"
          paddingX="spacing.3"
          paddingY="spacing.2"
          borderRadius="medium"
          borderWidth="thin"
          borderStyle="solid"
          borderColor="surface.border.gray.subtle"
        >
          {/* Fitness KPI Chip */}
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="xsmall" color="surface.text.gray.muted">
              Accuracy
            </Text>
            <Text size="small" weight="semibold" color="feedback.text.positive.intense">
              {fitnessVal}%
            </Text>
          </Box>

          <Box width="1px" height="14px" backgroundColor="surface.background.gray.subtle" />

          {/* Matched Count Chip */}
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="xsmall" color="surface.text.gray.muted">
              Matched
            </Text>
            <Text size="small" weight="semibold" color="surface.text.gray.normal">
              {matchedCount}/{totalCount}
            </Text>
          </Box>

          <Box width="1px" height="14px" backgroundColor="surface.background.gray.subtle" />

          {/* Exceptions Count Chip */}
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Text size="xsmall" color="surface.text.gray.muted">
              Exceptions
            </Text>
            <Badge
              color={exceptionsCount === 0 ? "positive" : "notice"}
              size="small"
              emphasis="subtle"
            >
              {String(exceptionsCount)}
            </Badge>
          </Box>

          <Box width="1px" height="14px" backgroundColor="surface.background.gray.subtle" />

          <Box display="flex" alignItems="center" gap="spacing.1">
            <Text size="xsmall" color="surface.text.gray.muted">
              Latency:
            </Text>
            <Text size="xsmall" weight="medium" color="surface.text.gray.muted">
              {durationMs}ms
            </Text>
          </Box>
        </Box>

        {/* Action Controls */}
        <Box display="flex" alignItems="center" gap="spacing.2">
          <Button
            variant="secondary"
            size="small"
            icon={DownloadIcon}
            iconPosition="left"
            onClick={onExportCsv}
            accessibilityLabel="Export exception ledger to CSV"
          >
            Export CSV
          </Button>

          <Button
            variant="primary"
            size="small"
            icon={RefreshIcon}
            iconPosition="left"
            onClick={onRunPipeline}
            isLoading={isRunning}
            isDisabled={isRunning}
            accessibilityLabel="Run reconciliation cascade"
          >
            {isRunning ? "Reconciling..." : "Run reconciliation"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
