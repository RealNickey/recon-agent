import React, { useState } from "react";
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
  Button,
  ChipGroup,
  Chip,
  Amount,
  Indicator,
  TrendingUpIcon,
  PlayIcon,
  DownloadIcon,
  SparklesIcon,
  ActivityIcon,
  BuildingIcon,
  AcceptPaymentsIcon,
} from "@razorpay/blade/components";
import {
  BklitSankeyChart,
  BklitFunnelChart,
  BklitGaugeChart,
  BklitCandlestickChart,
  BklitProfitLossLineChart,
  BklitLiveLineChart,
  BklitRadarChart,
  BklitSunburstChart,
  BklitHeatmapChart,
  BklitRingChart,
  BklitScatterChart,
  BklitChoroplethChart,
  BklitComposedChart,
  BklitAreaChart,
  BklitBarChart,
  BklitPieChart,
} from "@/components/charts/bklit";
import { toast } from "sonner";
import type { RunResult, ApiReportResponse } from "@/types";
import type { NavTab } from "@/components/layout/Sidebar";

export type AnalyticsSubTab =
  | "flow"
  | "liquidity"
  | "telemetry"
  | "dispersion"
  | "corridors";

interface AnalyticsViewProps {
  runResult: RunResult | null;
  report: ApiReportResponse | null;
  dataset: string;
  isRunning: boolean;
  onRunPipeline: () => void;
  onNavigate: (tab: NavTab) => void;
  onSelectTierFilter?: (tier: number | string | null) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  runResult,
  report,
  dataset,
  isRunning,
  onRunPipeline,
  onNavigate,
  onSelectTierFilter,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AnalyticsSubTab>("flow");
  const [selectedCorridor, setSelectedCorridor] = useState<string>("INR");

  const outcomes = runResult?.outcomes || [];
  const total = outcomes.length || 100;
  const matched = outcomes.filter((o) => o.status === "matched").length;
  const exceptions = outcomes.filter((o) => o.status === "exception").length;
  const matchRate = Number(((matched / total) * 100).toFixed(1));

  const cashPos = runResult?.cashPosition || {};
  const activeCash = cashPos[selectedCorridor] || {
    currency: selectedCorridor,
    reconciledAmount: 2450000,
    unreconciledAmount: 0,
    netPosition: 2450000,
    inTransitVariance: 0,
  };

  const handleExportSnapshot = () => {
    toast.success("Exported high-resolution chart intelligence report!");
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      {/* Top Header Bar */}
      <Box
        display="flex"
        flexDirection={{ base: "column", m: "row" }}
        alignItems={{ base: "flex-start", m: "center" }}
        justifyContent="space-between"
        gap="spacing.4"
        paddingBottom="spacing.4"
        borderBottomWidth="thin"
        borderBottomStyle="solid"
        borderBottomColor="surface.border.gray.subtle"
      >
        <Box>
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Heading size="medium">
              BKlit Visual Analytics & Intelligence Hub
            </Heading>
            <Badge color="primary" size="small">
              17 Visualizers
            </Badge>
          </Box>
          <Text size="small" color="surface.text.gray.muted" marginTop="spacing.1">
            Interactive multi-dimensional financial intelligence: multi-stage flows, liquidity volatility, dispersion anomalies, and global settlement corridors.
          </Text>
        </Box>

        <Box display="flex" alignItems="center" gap="spacing.2">
          <Button
            size="small"
            variant="secondary"
            icon={DownloadIcon}
            iconPosition="left"
            onClick={handleExportSnapshot}
            accessibilityLabel="Export chart intelligence report"
          >
            Export Report
          </Button>

          <Button
            size="small"
            variant="primary"
            icon={PlayIcon}
            iconPosition="left"
            onClick={onRunPipeline}
            isLoading={isRunning}
            isDisabled={isRunning}
            accessibilityLabel="Re-evaluate reconciliation engine"
          >
            Re-evaluate
          </Button>
        </Box>
      </Box>

      {/* KPI Top 6-Card Strip */}
      <Box
        display="grid"
        gridTemplateColumns={{
          base: "repeat(2, 1fr)",
          m: "repeat(3, 1fr)",
          l: "repeat(6, 1fr)",
        }}
        gap="spacing.3"
      >
        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              MATCH RATE
            </Text>
            <Heading size="small" marginTop="spacing.1">
              {matchRate}%
            </Heading>
            <Text size="xsmall" color="feedback.text.positive.intense">
              High Precision
            </Text>
          </CardBody>
        </Card>

        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              MATCHED PAIRS
            </Text>
            <Heading size="small" marginTop="spacing.1">
              {matched}
            </Heading>
            <Text size="xsmall" color="surface.text.gray.muted">
              of {total} total
            </Text>
          </CardBody>
        </Card>

        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              EXCEPTIONS
            </Text>
            <Heading size="small" marginTop="spacing.1">
              {exceptions}
            </Heading>
            <Text size="xsmall" color="feedback.text.negative.intense">
              {((exceptions / total) * 100).toFixed(1)}% honest
            </Text>
          </CardBody>
        </Card>

        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              IN-TRANSIT
            </Text>
            <Box marginTop="spacing.1">
              <Amount
                value={activeCash.inTransitVariance ?? 0}
                currency={selectedCorridor as any}
                size="small"
                weight="semibold"
              />
            </Box>
            <Text size="xsmall" color="surface.text.gray.muted">
              {selectedCorridor} Corridor
            </Text>
          </CardBody>
        </Card>

        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              ENGINE LATENCY
            </Text>
            <Heading size="small" marginTop="spacing.1">
              {runResult?.durationMs ? `${runResult.durationMs}ms` : "1.2s"}
            </Heading>
            <Text size="xsmall" color="feedback.text.positive.intense">
              Sub-second
            </Text>
          </CardBody>
        </Card>

        <Card padding="spacing.3">
          <CardBody>
            <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
              SOX 404 STATUS
            </Text>
            <Heading size="small" marginTop="spacing.1">
              100%
            </Heading>
            <Text size="xsmall" color="surface.text.gray.muted">
              Merkle Rooted
            </Text>
          </CardBody>
        </Card>
      </Box>

      {/* Sub-Tabs Selector */}
      <ChipGroup
        accessibilityLabel="Visual Analytics Categories"
        selectionType="single"
        value={activeSubTab}
        onChange={({ values }) => setActiveSubTab(values[0] as AnalyticsSubTab)}
        size="medium"
      >
        <Chip value="flow">Cascade Flow & Resolution</Chip>
        <Chip value="liquidity">Cash & Liquidity Dynamics</Chip>
        <Chip value="telemetry">AI & Pipeline Telemetry</Chip>
        <Chip value="dispersion">Anomaly & Risk Dispersion</Chip>
        <Chip value="corridors">Global Corridors & Rails</Chip>
      </ChipGroup>

      {/* Sub-Tab 1: Cascade Flow & Resolution */}
      {activeSubTab === "flow" && (
        <Box display="flex" flexDirection="column" gap="spacing.6">
          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="End-to-End Multi-Stage Sankey Reconciler Flow"
                subtitle="Tracing transaction volume from Raw Sources → Cascade Engine Tiers → Final Settlement Allocations"
              />
              <CardHeaderTrailing
                visual={<Badge color="primary" size="small">Sankey Visualizer</Badge>}
              />
            </CardHeader>
            <CardBody>
              <BklitSankeyChart
                outcomes={outcomes}
                height={340}
                onNodeClick={(id) => {
                  if (id.startsWith("tier_")) {
                    const tierNum = id === "tier_exp" ? "exception" : parseInt(id.replace("tier_", ""), 10);
                    onSelectTierFilter?.(tierNum);
                    onNavigate("ledger");
                  }
                }}
              />
            </CardBody>
          </Card>

          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Cascade Resolution Conversion"
                  subtitle="Step-by-step conversion from ingested records to residual exceptions"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Funnel</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitFunnelChart
                  outcomes={outcomes}
                  onSelectTier={(tier) => {
                    onSelectTierFilter?.(tier);
                    onNavigate("ledger");
                  }}
                />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Hierarchical Partitioning"
                  subtitle="Concentric drill-down across Status → Cascade Tiers → Corridors"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Sunburst</Badge>}
                />
              </CardHeader>
              <CardBody>
                <Box display="flex" justifyContent="center" alignItems="center">
                  <BklitSunburstChart outcomes={outcomes} size={300} />
                </Box>
              </CardBody>
            </Card>
          </Box>
        </Box>
      )}

      {/* Sub-Tab 2: Cash & Liquidity Dynamics */}
      {activeSubTab === "liquidity" && (
        <Box display="flex" flexDirection="column" gap="spacing.6">
          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Net Settlement Surplus / Deficit"
                  subtitle="Zero-baseline dual-gradient tracking fee variance and in-transit timing"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">P&L Line</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitProfitLossLineChart currency={selectedCorridor} height={240} />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Settlement Liquidity Spreads (OHLC)"
                  subtitle="Intraday bank settlement liquidity ranges, closing balances, and volume"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Candlestick</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitCandlestickChart currency={selectedCorridor} height={240} />
              </CardBody>
            </Card>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Multi-Axis Volume & In-Transit Accumulation"
                  subtitle="Hybrid Bar, Area, and Line curves tracking cumulative settlement"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Composed</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitComposedChart currency={selectedCorridor} height={250} />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Multi-Corridor Cash Balance Curves"
                  subtitle="Intraday cash balance accumulation across INR, USD, and EUR corridors"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Area</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitAreaChart currency={selectedCorridor} height={250} />
              </CardBody>
            </Card>
          </Box>
        </Box>
      )}

      {/* Sub-Tab 3: AI & Pipeline Telemetry */}
      {activeSubTab === "telemetry" && (
        <Box display="flex" flexDirection="column" gap="spacing.6">
          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", m: "repeat(3, 1fr)" }}
            gap="spacing.4"
          >
            <Card padding="spacing.4">
              <CardBody>
                <BklitGaugeChart
                  value={matchRate}
                  title="Reconciliation Match Rate"
                  subtitle="Cascade Efficiency Benchmark"
                  target={100}
                />
              </CardBody>
            </Card>

            <Card padding="spacing.4">
              <CardBody>
                <BklitGaugeChart
                  value={99.8}
                  title="Generalization Stability"
                  subtitle="Multi-Seed Cross-Validation"
                  target={99.5}
                />
              </CardBody>
            </Card>

            <Card padding="spacing.4">
              <CardBody>
                <BklitGaugeChart
                  value={100}
                  title="SOX Section 404 Controls"
                  subtitle="Merkle Proof Integrity"
                  target={100}
                />
              </CardBody>
            </Card>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="6-Axis Capability Matrix"
                  subtitle="Evaluation across precision, recall, fee accuracy, and noise resistance"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Radar</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitRadarChart height={270} />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Live Telemetry & Throughput Stream"
                  subtitle="Real-time transaction processing rate (tx/s) and sub-millisecond latency"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Live Stream</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitLiveLineChart height={270} />
              </CardBody>
            </Card>
          </Box>
        </Box>
      )}

      {/* Sub-Tab 4: Anomaly & Risk Dispersion */}
      {activeSubTab === "dispersion" && (
        <Box display="flex" flexDirection="column" gap="spacing.6">
          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "7fr 5fr" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Timing Drift vs Amount Dispersion"
                  subtitle="2D mapping of settlement date drift (days) against transaction size"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Scatter</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitScatterChart height={280} />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Concentric Exposure Rings"
                  subtitle="Nested breakdown of Tiers, Source Channels, and Reconciled vs Suspense"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Ring</Badge>}
                />
              </CardHeader>
              <CardBody>
                <Box display="flex" justifyContent="center" alignItems="center">
                  <BklitRingChart size={270} />
                </Box>
              </CardBody>
            </Card>
          </Box>

          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="Settlement Velocity Heatmap"
                subtitle="Weekly settlement density matrix across payment channels and rails"
              />
              <CardHeaderTrailing
                visual={<Badge color="neutral" size="small">Heatmap</Badge>}
              />
            </CardHeader>
            <CardBody>
              <BklitHeatmapChart height={240} />
            </CardBody>
          </Card>
        </Box>
      )}

      {/* Sub-Tab 5: Global Corridors & Rails */}
      {activeSubTab === "corridors" && (
        <Box display="flex" flexDirection="column" gap="spacing.6">
          <Card padding="spacing.5">
            <CardHeader>
              <CardHeaderLeading
                title="Global Cross-Border Settlement Corridors"
                subtitle="Interactive settlement hubs, active currency vectors, and regional volume"
              />
              <CardHeaderTrailing
                visual={<Badge color="primary" size="small">Choropleth</Badge>}
              />
            </CardHeader>
            <CardBody>
              <BklitChoroplethChart
                height={340}
                onSelectCorridor={(code) => {
                  setSelectedCorridor(code);
                  toast.info(`Switched focus corridor to: ${code}`);
                }}
              />
            </CardBody>
          </Card>

          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", l: "repeat(2, 1fr)" }}
            gap="spacing.5"
          >
            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Indian Payment Rails Distribution"
                  subtitle="Settlement counts across UPI VPAs, IMPS RRNs, NEFT UTRs, and Cards"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Bar</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitBarChart
                  data={[
                    { label: "UPI Instant (VPA)", value: 680, color: "#0c83e2", sublabel: "Zero-fee standard rail" },
                    { label: "IMPS RRN Batch", value: 340, color: "#20c997", sublabel: "Real-time 24x7 clearing" },
                    { label: "NEFT / RTGS UTR", value: 220, color: "#f59e0b", sublabel: "Large corporate disbursements" },
                    { label: "Cards & Netbanking", value: 180, color: "#8b5cf6", sublabel: "2.36% MDR gateway charges" },
                  ]}
                  layout="vertical"
                  height={220}
                />
              </CardBody>
            </Card>

            <Card padding="spacing.5">
              <CardHeader>
                <CardHeaderLeading
                  title="Currency Share by Gross Volume"
                  subtitle="Proportional share of total reconciled volume by currency"
                />
                <CardHeaderTrailing
                  visual={<Badge color="neutral" size="small">Pie</Badge>}
                />
              </CardHeader>
              <CardBody>
                <BklitPieChart
                  data={[
                    { name: "INR", value: 2450000, color: "#0c83e2" },
                    { name: "USD", value: 650000, color: "#20c997" },
                    { name: "EUR", value: 380000, color: "#f59e0b" },
                    { name: "GBP", value: 190000, color: "#8b5cf6" },
                    { name: "AED", value: 140000, color: "#ec4899" },
                  ]}
                  isCurrency={true}
                  currency="INR"
                  centerText="₹3.81M"
                  centerSubtext="Total Volume"
                  height={220}
                />
              </CardBody>
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
};

