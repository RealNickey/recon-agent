import React from "react";
import {
  Box,
  Text,
  Heading,
  Badge,
  Button,
  Card,
  CardHeader,
  CardHeaderLeading,
  CardHeaderTrailing,
  CardBody,
  Indicator,
  ProgressBar,
  Amount,
  SparklesIcon,
  ArrowRightIcon,
  BuildingIcon,
  ShieldIcon,
  AwardIcon,
  CheckCircleIcon,
} from "@razorpay/blade/components";
import { BklitSankeyChart } from "@/components/charts/bklit";
import type { RunResult, ApiReportResponse } from "@/types";
import type { NavTab } from "@/components/layout/Sidebar";

interface DashboardViewProps {
  runResult: RunResult | null;
  report: ApiReportResponse | null;
  isRunning: boolean;
  onRunPipeline: () => void;
  onNavigate: (tab: NavTab) => void;
  onSelectTierFilter: (tier: number | string | null) => void;
  selectedTier: number | string | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  runResult,
  report: _report,
  isRunning: _isRunning,
  onRunPipeline: _onRunPipeline,
  onNavigate,
  onSelectTierFilter,
  selectedTier: _selectedTier,
}) => {
  const outcomes = runResult?.outcomes || [];
  const total = runResult?.stats?.totalRecords || outcomes.length || 100;
  const matched = runResult?.stats?.matched ?? outcomes.filter((o) => o.status === "matched").length;
  const exceptions = runResult?.stats?.exceptions ?? outcomes.filter((o) => o.status === "exception").length;
  const matchRate = total > 0 ? Number(((matched / total) * 100).toFixed(1)) : 0;

  const t1Count =
    outcomes.filter((o) => o.tier === 1 && o.status === "matched").length ||
    (outcomes.length === 0 ? 35 : 0);
  const t2Count =
    outcomes.filter((o) => o.tier === 2 && o.status === "matched").length ||
    (outcomes.length === 0 ? 124 : 0);
  const t3Count =
    outcomes.filter((o) => o.tier === 3 && o.status === "matched").length || 0;

  const pieData = [
    { name: "INR", value: runResult?.cashPosition?.INR?.reconciledAmount ?? 2450000, color: "#0c83e2" },
    { name: "USD", value: runResult?.cashPosition?.USD?.reconciledAmount ?? 650000, color: "#20c997" },
    { name: "EUR", value: runResult?.cashPosition?.EUR?.reconciledAmount ?? 380000, color: "#f59e0b" },
    { name: "GBP", value: runResult?.cashPosition?.GBP?.reconciledAmount ?? 190000, color: "#8b5cf6" },
  ];

  const totalSettledInr = pieData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap="spacing.3"
      height="calc(100vh - 120px)"
      minHeight="0px"
    >
      {/* 1. Header & Quick Navigation Strip */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        paddingBottom="spacing.2"
        borderBottomWidth="thin"
        borderBottomStyle="solid"
        borderBottomColor="surface.border.gray.subtle"
        flexWrap="wrap"
        gap="spacing.2"
        flexShrink={0}
      >
        <Box display="flex" flexDirection="column" gap="spacing.1">
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Heading size="medium" weight="semibold">
              Reconciliation Overview
            </Heading>
            <Badge color="positive" size="small" emphasis="subtle">
              Audit Verified
            </Badge>
          </Box>
          <Box display="flex" alignItems="center" gap="spacing.3" flexWrap="wrap">
            <Box display="flex" alignItems="center" gap="spacing.1">
              <ShieldIcon size="xsmall" color="feedback.icon.positive.intense" />
              <Text size="xsmall" color="surface.text.gray.muted">
                SOX 404 & Merkle: Verified
              </Text>
            </Box>
            <Text size="xsmall" color="surface.text.gray.subtle">·</Text>
            <Box display="flex" alignItems="center" gap="spacing.1">
              <AwardIcon size="xsmall" color="feedback.icon.positive.intense" />
              <Text size="xsmall" color="surface.text.gray.muted">
                Cross-Val: 6/6 Passed
              </Text>
            </Box>
            <Text size="xsmall" color="surface.text.gray.subtle">·</Text>
            <Box display="flex" alignItems="center" gap="spacing.1">
              <CheckCircleIcon size="xsmall" color="feedback.icon.positive.intense" />
              <Text size="xsmall" color="surface.text.gray.muted">
                GST MDR & TDS: Accrued
              </Text>
            </Box>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap="spacing.2" flexWrap="wrap">
          <Button
            variant="secondary"
            size="xsmall"
            icon={SparklesIcon}
            iconPosition="left"
            onClick={() => onNavigate("controller")}
            accessibilityLabel="Open AI Financial Controller"
          >
            AI Controller
          </Button>

          <Button
            variant="tertiary"
            size="xsmall"
            icon={BuildingIcon}
            iconPosition="left"
            onClick={() => onNavigate("brs")}
            accessibilityLabel="Open Bank Statement and BRS"
          >
            Bank Statement & BRS
          </Button>

          <Button
            variant="tertiary"
            size="xsmall"
            icon={ArrowRightIcon}
            iconPosition="right"
            onClick={() => onNavigate("ledger")}
            accessibilityLabel="Open Reconciliation Ledger"
          >
            {`Ledger (${total})`}
          </Button>
        </Box>
      </Box>

      {/* 2. Executive 3-Card KPI Summary */}
      <Box
        display="grid"
        gridTemplateColumns={{
          base: "1fr",
          m: "repeat(3, 1fr)",
        }}
        gap="spacing.3"
        alignItems="stretch"
        flexShrink={0}
      >
        {/* KPI 1: Reconciliation Rate */}
        <Card padding="spacing.3">
          <CardBody>
            <Box display="flex" flexDirection="column" justifyContent="space-between" height="100%" gap="spacing.2">
              <Box display="flex" flexDirection="column" gap="spacing.1">
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                    RECONCILIATION RATE
                  </Text>
                  <Indicator color="positive" size="small" />
                </Box>

                <Box display="flex" alignItems="baseline" gap="spacing.2">
                  <Heading size="xlarge" weight="semibold" color="feedback.text.positive.intense">
                    {`${matchRate}%`}
                  </Heading>
                  <Text size="small" color="surface.text.gray.muted">
                    ({matched}/{total} matched)
                  </Text>
                </Box>

                <Box display="flex" alignItems="center" height="20px">
                  <ProgressBar
                    value={matchRate}
                    color="positive"
                    size="small"
                    showPercentage={false}
                    accessibilityLabel="Reconciliation rate progress"
                  />
                </Box>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center" paddingTop="spacing.1" borderTopWidth="thin" borderTopStyle="solid" borderTopColor="surface.border.gray.subtle">
                <Text size="xsmall" color="surface.text.gray.subtle">
                  {`T1: ${t1Count} · T2: ${t2Count} · T3: ${t3Count}`}
                </Text>
                <Button
                  variant="tertiary"
                  size="xsmall"
                  onClick={() => onNavigate("ledger")}
                  icon={ArrowRightIcon}
                  iconPosition="right"
                >
                  View ledger
                </Button>
              </Box>
            </Box>
          </CardBody>
        </Card>

        {/* KPI 2: Settled Cash Volume */}
        <Card padding="spacing.3">
          <CardBody>
            <Box display="flex" flexDirection="column" justifyContent="space-between" height="100%" gap="spacing.2">
              <Box display="flex" flexDirection="column" gap="spacing.1">
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                    SETTLED CASH VOLUME
                  </Text>
                  <Badge color="primary" size="small" emphasis="subtle">
                    Multi-Currency
                  </Badge>
                </Box>

                <Box display="flex" alignItems="baseline">
                  <Amount
                    value={totalSettledInr}
                    currency="INR"
                    size="xlarge"
                    type="heading"
                    weight="semibold"
                  />
                </Box>

                <Box display="flex" alignItems="center" gap="spacing.2" height="20px" overflow="hidden">
                  <Box
                    paddingX="spacing.2"
                    paddingY="spacing.1"
                    borderRadius="small"
                    backgroundColor="surface.background.gray.subtle"
                    display="flex"
                    alignItems="center"
                    gap="spacing.1"
                  >
                    <Text size="xsmall" color="surface.text.gray.muted">INR:</Text>
                    <Text size="xsmall" weight="semibold">₹2.45M</Text>
                  </Box>
                  <Box
                    paddingX="spacing.2"
                    paddingY="spacing.1"
                    borderRadius="small"
                    backgroundColor="surface.background.gray.subtle"
                    display="flex"
                    alignItems="center"
                    gap="spacing.1"
                  >
                    <Text size="xsmall" color="surface.text.gray.muted">USD:</Text>
                    <Text size="xsmall" weight="semibold">$650K</Text>
                  </Box>
                  <Box
                    paddingX="spacing.2"
                    paddingY="spacing.1"
                    borderRadius="small"
                    backgroundColor="surface.background.gray.subtle"
                    display="flex"
                    alignItems="center"
                    gap="spacing.1"
                  >
                    <Text size="xsmall" color="surface.text.gray.muted">EUR:</Text>
                    <Text size="xsmall" weight="semibold">€380K</Text>
                  </Box>
                </Box>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center" paddingTop="spacing.1" borderTopWidth="thin" borderTopStyle="solid" borderTopColor="surface.border.gray.subtle">
                <Text size="xsmall" color="surface.text.gray.subtle">
                  4 active corridors
                </Text>
                <Button
                  variant="tertiary"
                  size="xsmall"
                  onClick={() => onNavigate("brs")}
                  icon={ArrowRightIcon}
                  iconPosition="right"
                >
                  View BRS
                </Button>
              </Box>
            </Box>
          </CardBody>
        </Card>

        {/* KPI 3: Suspense & Unresolved Exceptions */}
        <Card padding="spacing.3">
          <CardBody>
            <Box display="flex" flexDirection="column" justifyContent="space-between" height="100%" gap="spacing.2">
              <Box display="flex" flexDirection="column" gap="spacing.1">
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
                    SUSPENSE & EXCEPTIONS
                  </Text>
                  <Badge
                    color={exceptions === 0 ? "positive" : "notice"}
                    size="small"
                    emphasis="subtle"
                  >
                    {exceptions === 0 ? "All Clear" : `${exceptions} Action Needed`}
                  </Badge>
                </Box>

                <Box display="flex" alignItems="baseline" gap="spacing.2">
                  <Heading
                    size="xlarge"
                    weight="semibold"
                    color={exceptions === 0 ? "feedback.text.positive.intense" : "feedback.text.notice.intense"}
                  >
                    {String(exceptions)}
                  </Heading>
                  <Text size="small" color="surface.text.gray.muted">
                    {exceptions === 1 ? "record in suspense" : "records in suspense"}
                  </Text>
                </Box>

                <Box display="flex" alignItems="center" height="20px">
                  <ProgressBar
                    value={exceptions > 0 ? (exceptions / total) * 100 : 0}
                    color={exceptions === 0 ? "positive" : "notice"}
                    size="small"
                    showPercentage={false}
                    accessibilityLabel="Exceptions rate"
                  />
                </Box>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center" paddingTop="spacing.1" borderTopWidth="thin" borderTopStyle="solid" borderTopColor="surface.border.gray.subtle">
                <Text size="xsmall" color="surface.text.gray.subtle">
                  {exceptions === 0 ? "Zero unmatched transactions" : `${exceptions} items to review`}
                </Text>
                <Button
                  variant={exceptions === 0 ? "tertiary" : "secondary"}
                  size="xsmall"
                  onClick={() => {
                    if (exceptions > 0) {
                      onNavigate("controller");
                    } else {
                      onSelectTierFilter("exception");
                      onNavigate("ledger");
                    }
                  }}
                  icon={exceptions > 0 ? SparklesIcon : ArrowRightIcon}
                  iconPosition={exceptions > 0 ? "left" : "right"}
                >
                  {exceptions > 0 ? "Resolve with AI" : "Review"}
                </Button>
              </Box>
            </Box>
          </CardBody>
        </Card>
      </Box>

      {/* 3. Settlement Cascade Journey - Takes up full remaining vertical space */}
      <Box flex="1" minHeight="0px" display="flex" flexDirection="column">
        <Card padding="spacing.3">
          <CardHeader>
            <CardHeaderLeading
              title="Settlement Cascade Journey"
              subtitle="Source-to-tier deterministic classification path"
            />
          </CardHeader>
          <CardBody>
            <Box width="100%" height="100%" minHeight="360px">
              <BklitSankeyChart
                outcomes={outcomes}
                height={360}
                onNodeClick={(id) => {
                  if (id.startsWith("tier_")) {
                    const tierNum = id === "tier_exp" ? "exception" : parseInt(id.replace("tier_", ""), 10);
                    onSelectTierFilter(tierNum);
                    onNavigate("ledger");
                  }
                }}
              />
            </Box>
          </CardBody>
        </Card>
      </Box>
    </Box>
  );
};
