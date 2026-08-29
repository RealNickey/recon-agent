import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface AreaSeriesPoint {
  date: string;
  [key: string]: number | string;
}

interface BklitAreaChartProps {
  data?: AreaSeriesPoint[];
  series?: { key: string; name: string; color: string }[];
  currency?: string;
  height?: number;
  stacked?: boolean;
}

export const BklitAreaChart: React.FC<BklitAreaChartProps> = ({
  data,
  series = [
    { key: "inr", name: "INR Corridor", color: "var(--chart-1)" },
    { key: "usd", name: "USD Corridor", color: "var(--chart-2)" },
    { key: "eur", name: "EUR Corridor", color: "var(--chart-3)" },
  ],
  currency = "INR",
  height = 240,
  stacked = false,
}) => {
  const chartData: AreaSeriesPoint[] = data || [
    { date: "09:00", inr: 450000, usd: 120000, eur: 45000 },
    { date: "11:00", inr: 680000, usd: 140000, eur: 60000 },
    { date: "13:00", inr: 920000, usd: 155000, eur: 72000 },
    { date: "15:00", inr: 1350000, usd: 190000, eur: 85000 },
    { date: "17:00", inr: 1840000, usd: 210000, eur: 98000 },
    { date: "19:00", inr: 2450000, usd: 250000, eur: 110000 },
  ];

  return (
    <div className="w-full select-none space-y-2">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">Multi-Corridor Cash Balance Curves</span>
        <span className="text-[11px] font-mono text-muted-foreground">Intraday Settlement Flows</span>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`areaGrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0.0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1 min-w-[160px]">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-0.5">
                        {label} Settlement
                      </div>
                      {payload.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-[11px] gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}:
                          </span>
                          <span className="font-mono text-foreground font-semibold">
                            {formatCurrency(Number(p.value), currency)}
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
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId={stacked ? "1" : undefined}
                stroke={s.color}
                strokeWidth={1.75}
                fillOpacity={1}
                fill={`url(#areaGrad-${s.key})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
