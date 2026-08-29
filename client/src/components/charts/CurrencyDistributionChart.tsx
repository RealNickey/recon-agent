import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { CashPositionCurrency } from "@/types";

interface CurrencyDistributionChartProps {
  cashPosition?: Record<string, CashPositionCurrency>;
}

const THEME_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export const CurrencyDistributionChart: React.FC<CurrencyDistributionChartProps> = ({
  cashPosition,
}) => {
  const entries = Object.entries(cashPosition || {});

  const data = entries.map(([curr, d], i) => ({
    name: curr,
    value: Math.abs(d.reconciledAmount),
    unreconciled: Math.abs(d.unreconciledAmount),
    rate: d.reconciliationRate ? (d.reconciliationRate * 100).toFixed(1) : "100.0",
    color: THEME_COLORS[i % THEME_COLORS.length],
  }));

  const totalVolume = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs">
        No currency data available
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        <div className="h-44 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="rounded border border-border bg-card p-2 shadow-sm text-xs space-y-1">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: d.color }}
                          />
                          {d.name} Volume
                        </div>
                        <div className="text-[11px] font-mono text-foreground font-medium">
                          {formatCurrency(d.value, d.name)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Recon Rate: {d.rate}%
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={68}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] text-muted-foreground font-medium">
              Total Volume
            </span>
            <span className="text-sm font-semibold font-mono text-foreground">
              {formatCurrency(totalVolume, "INR")}
            </span>
          </div>
        </div>

        <div className="space-y-1 pr-1">
          {data.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="font-medium text-foreground">{d.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {((d.value / (totalVolume || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-right font-mono text-[11px] text-foreground font-medium">
                {formatCurrency(d.value, d.name)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
