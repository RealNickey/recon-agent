import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface ProfitLossPoint {
  label: string;
  variance: number; // positive = surplus/gain, negative = deficit/unallocated
  volume?: number;
  inTransit?: number;
}

interface BklitProfitLossLineChartProps {
  data?: ProfitLossPoint[];
  currency?: string;
  height?: number;
}

export const BklitProfitLossLineChart: React.FC<BklitProfitLossLineChartProps> = ({
  data,
  currency = "INR",
  height = 240,
}) => {
  const chartData: ProfitLossPoint[] = useMemo(() => {
    if (data && data.length > 0) return data;
    return [
      { label: "Batch 01", variance: 0, volume: 45000, inTransit: 0 },
      { label: "Batch 02", variance: 120.5, volume: 52000, inTransit: 0 },
      { label: "Batch 03", variance: -350.0, volume: 61000, inTransit: 350 },
      { label: "Batch 04", variance: 0, volume: 58000, inTransit: 0 },
      { label: "Batch 05", variance: 45.0, volume: 72000, inTransit: 0 },
      { label: "Batch 06", variance: -180.25, volume: 64000, inTransit: 180 },
      { label: "Batch 07", variance: 0, volume: 83000, inTransit: 0 },
    ];
  }, [data]);

  // Calculate gradient split offset between positive and negative values
  const gradientOffset = useMemo(() => {
    const dataMax = Math.max(...chartData.map((i) => i.variance));
    const dataMin = Math.min(...chartData.map((i) => i.variance));

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

    return dataMax / (dataMax - dataMin);
  }, [chartData]);

  const netCumulative = chartData.reduce((s, d) => s + d.variance, 0);

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-2">
        <span className="font-semibold text-foreground">Net Settlement Variance & Surplus/Deficit</span>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-muted-foreground">Cumulative Net:</span>
          <span className={`font-semibold ${netCumulative >= 0 ? "text-chart-2" : "text-destructive"}`}>
            {formatCurrency(netCumulative, currency)}
          </span>
        </div>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={gradientOffset} stopColor="var(--chart-2)" stopOpacity={0.4} />
                <stop offset={gradientOffset} stopColor="var(--destructive)" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={gradientOffset} stopColor="var(--chart-2)" />
                <stop offset={gradientOffset} stopColor="var(--destructive)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as ProfitLossPoint;
                  const isGain = d.variance >= 0;
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-1">
                        {label} Settlement
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="text-muted-foreground">Variance:</span>
                        <span className={`font-mono font-bold ${isGain ? "text-chart-2" : "text-destructive"}`}>
                          {isGain ? "+" : ""}{formatCurrency(d.variance, currency)}
                        </span>
                      </div>
                      {d.inTransit !== undefined && d.inTransit > 0 && (
                        <div className="flex justify-between items-center gap-4 text-[10px] text-muted-foreground font-mono">
                          <span>In-Transit:</span>
                          <span>{formatCurrency(d.inTransit, currency)}</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
            <Area
              type="monotone"
              dataKey="variance"
              stroke="url(#splitStroke)"
              strokeWidth={2}
              fill="url(#splitColor)"
              dot={{ r: 3, fill: "var(--foreground)" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
