import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Box, Text, Button, Badge } from "@razorpay/blade/components";
import type { Outcome } from "@/types";

interface CascadeFlowChartProps {
  outcomes: Outcome[];
  selectedTier?: number | string | null;
  onSelectTier?: (tier: number | string | null) => void;
}

export const CascadeFlowChart: React.FC<CascadeFlowChartProps> = ({
  outcomes,
  selectedTier,
  onSelectTier,
}) => {
  const t1Count = outcomes.filter((o) => o.status === "matched" && o.tier === 1).length;
  const t2Count = outcomes.filter((o) => o.status === "matched" && o.tier === 2).length;
  const t3Count = outcomes.filter((o) => o.status === "matched" && o.tier === 3).length;
  const expCount = outcomes.filter((o) => o.status === "exception").length;
  const total = outcomes.length || 1;

  const data = [
    {
      name: "Tier 1: Hash-Join",
      key: "t1",
      tier: 1,
      count: t1Count,
      percent: ((t1Count / total) * 100).toFixed(1),
      color: "var(--chart-1)",
      sub: "Zero-latency exact & reference match",
    },
    {
      name: "Tier 2: Fuzzy Logic",
      key: "t2",
      tier: 2,
      count: t2Count,
      percent: ((t2Count / total) * 100).toFixed(1),
      color: "var(--chart-2)",
      sub: "Levenshtein + date drift + MDR fee",
    },
    {
      name: "Tier 3: Agentic AI",
      key: "t3",
      tier: 3,
      count: t3Count,
      percent: ((t3Count / total) * 100).toFixed(1),
      color: "var(--chart-3)",
      sub: "Deep multi-candidate LLM reasoning",
    },
    {
      name: "Exceptions",
      key: "exp",
      tier: "exception",
      count: expCount,
      percent: ((expCount / total) * 100).toFixed(1),
      color: "var(--destructive)",
      sub: "Honest unallocated & suspense ledger",
    },
  ];

  return (
    <Box width="100%">
      <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom="spacing.2">
        <Text size="xsmall" weight="medium" color="surface.text.gray.muted">
          Tier Allocation ({outcomes.length} records)
        </Text>
        {selectedTier && (
          <Button
            variant="tertiary"
            size="xsmall"
            onClick={() => onSelectTier?.(null)}
            accessibilityLabel="Reset tier filter"
          >
            Reset Filter
          </Button>
        )}
      </Box>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload[0]) {
                const item = state.activePayload[0].payload;
                onSelectTier?.(item.tier === selectedTier ? null : item.tier);
              }
            }}
          >
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={125}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded border border-border bg-card p-2 text-xs shadow-sm space-y-1">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        {d.name}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {d.sub}
                      </div>
                      <div className="flex items-center justify-between gap-4 font-mono pt-1 text-[11px]">
                        <span className="text-foreground">{d.count} records</span>
                        <span className="text-muted-foreground font-semibold">{d.percent}%</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="count"
              radius={[0, 3, 3, 0]}
              cursor="pointer"
              barSize={14}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  opacity={
                    selectedTier === null || selectedTier === entry.tier
                      ? 0.85
                      : 0.25
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        paddingTop="spacing.2"
        borderTopWidth="thin"
        borderTopStyle="solid"
        borderTopColor="surface.border.gray.subtle"
        flexWrap="wrap"
        gap="spacing.2"
      >
        {data.map((d) => (
          <div
            key={d.key}
            onClick={() => onSelectTier?.(d.tier === selectedTier ? null : d.tier)}
            style={{ cursor: "pointer" }}
          >
            <Badge
              color={selectedTier === d.tier ? "primary" : "neutral"}
              size="small"
              emphasis={selectedTier === d.tier ? "intense" : "subtle"}
            >
              {`${d.name.split(":")[0]}: ${d.count}`}
            </Badge>
          </div>
        ))}
      </Box>
    </Box>
  );
};

