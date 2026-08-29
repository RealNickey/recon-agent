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
import type { CashPositionCurrency } from "@/types";

interface CashVarianceAreaChartProps {
  cashPosition?: Record<string, CashPositionCurrency>;
}

export const CashVarianceAreaChart: React.FC<CashVarianceAreaChartProps> = ({
  cashPosition,
}) => {
  const entries = Object.entries(cashPosition || {});

  const chartData = entries.map(([curr, data]) => {
    const brs = data.brs;
    return {
      currency: curr,
      bankBalance: brs?.closingBankBalance ?? data.bankBalance ?? data.reconciledAmount,
      subledgerBalance: brs?.subledgerBalance ?? data.internalLedgerBalance ?? data.reconciledAmount,
      processorNodal: brs?.processorNodalBalance ?? data.processorNodalBalance ?? (data.reconciledAmount * 0.4),
      inTransit: Math.abs(brs?.unreconciledInTransitDeposits ?? data.inTransitVariance ?? data.unreconciledAmount),
      variance: Math.abs(brs?.netVariance ?? 0),
    };
  });

  if (chartData.length === 0) {
    chartData.push({
      currency: "INR",
      bankBalance: 245000,
      subledgerBalance: 245000,
      processorNodal: 125000,
      inTransit: 0,
      variance: 0,
    });
  }

  return (
    <div className="w-full">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorBank" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorLedger" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.12} />
                <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorProcessor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.08} />
                <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="currency"
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
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1 min-w-[160px]">
                      <div className="font-medium text-foreground pb-0.5 border-b border-border/40">
                        {label} Position
                      </div>
                      {payload.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-[11px] gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}
                          </span>
                          <span className="font-mono text-foreground font-medium">
                            {formatCurrency(Number(p.value), label)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
              iconType="circle"
              iconSize={6}
            />
            <Area
              type="monotone"
              dataKey="bankBalance"
              name="Bank Balance"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorBank)"
            />
            <Area
              type="monotone"
              dataKey="subledgerBalance"
              name="Internal Ledger"
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorLedger)"
            />
            <Area
              type="monotone"
              dataKey="processorNodal"
              name="Gateway Nodal"
              stroke="var(--chart-3)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              fillOpacity={1}
              fill="url(#colorProcessor)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
