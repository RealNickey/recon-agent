import React from "react";
import {
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface ComposedDataPoint {
  period: string;
  ledgerVolume: number;
  bankVolume: number;
  clearedAccumulation: number;
  varianceRate: number; // percentage
}

interface BklitComposedChartProps {
  data?: ComposedDataPoint[];
  currency?: string;
  height?: number;
}

export const BklitComposedChart: React.FC<BklitComposedChartProps> = ({
  data,
  currency = "INR",
  height = 280,
}) => {
  const chartData: ComposedDataPoint[] = data || [
    { period: "W1", ledgerVolume: 320000, bankVolume: 315000, clearedAccumulation: 315000, varianceRate: 1.5 },
    { period: "W2", ledgerVolume: 450000, bankVolume: 450000, clearedAccumulation: 765000, varianceRate: 0.0 },
    { period: "W3", ledgerVolume: 510000, bankVolume: 502000, clearedAccumulation: 1267000, varianceRate: 1.6 },
    { period: "W4", ledgerVolume: 620000, bankVolume: 620000, clearedAccumulation: 1887000, varianceRate: 0.0 },
    { period: "W5", ledgerVolume: 580000, bankVolume: 580000, clearedAccumulation: 2467000, varianceRate: 0.0 },
  ];

  return (
    <div className="w-full select-none space-y-2">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">Multi-Axis Volume & In-Transit Variance</span>
        <span className="text-[11px] font-mono text-muted-foreground">Bar (Gross) + Area (Cumulative) + Line (%)</span>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="period"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[0, 5]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1 min-w-[180px]">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-1">
                        {label} Settlement Batch
                      </div>
                      {payload.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-[11px] gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}:
                          </span>
                          <span className="font-mono text-foreground font-medium">
                            {p.dataKey === "varianceRate"
                              ? `${p.value}%`
                              : formatCurrency(Number(p.value), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} iconType="circle" iconSize={6} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="clearedAccumulation"
              name="Cumulative Cleared"
              fill="var(--chart-1)"
              fillOpacity={0.15}
              stroke="var(--chart-1)"
              strokeWidth={1.5}
            />
            <Bar
              yAxisId="left"
              dataKey="ledgerVolume"
              name="Internal Ledger"
              barSize={12}
              fill="var(--chart-2)"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="bankVolume"
              name="Bank Statement"
              barSize={12}
              fill="var(--chart-3)"
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="varianceRate"
              name="Variance %"
              stroke="var(--destructive)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--destructive)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
