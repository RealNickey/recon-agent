import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface PieChartItem {
  name: string;
  value: number;
  color: string;
  sublabel?: string;
}

interface BklitPieChartProps {
  data: PieChartItem[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  title?: string;
  centerText?: string;
  centerSubtext?: string;
  isCurrency?: boolean;
  currency?: string;
}

export const BklitPieChart: React.FC<BklitPieChartProps> = ({
  data,
  height = 240,
  innerRadius = 50,
  outerRadius = 70,
  title,
  centerText,
  centerSubtext,
  isCurrency = false,
  currency = "INR",
}) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="w-full select-none space-y-2">
      {title && (
        <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-[11px] font-mono text-muted-foreground">{data.length} Segments</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        <div className="relative flex items-center justify-center" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as PieChartItem;
                    return (
                      <div className="rounded border border-border bg-card p-2 shadow-sm text-xs space-y-1">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </div>
                        <div className="text-[11px] font-mono text-foreground font-bold">
                          {isCurrency ? formatCurrency(d.value, currency) : `${formatNumber(d.value)} items`}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Share: {((d.value / total) * 100).toFixed(1)}%
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
                innerRadius={innerRadius}
                outerRadius={outerRadius}
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

          {(centerText || centerSubtext) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {centerSubtext && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {centerSubtext}
                </span>
              )}
              {centerText && (
                <span className="text-xs font-bold font-mono text-foreground truncate max-w-[90px]">
                  {centerText}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="space-y-1.5 pr-1">
          {data.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="font-medium text-foreground">{d.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-right font-mono text-[11px] text-foreground font-medium">
                {isCurrency ? formatCurrency(d.value, currency) : formatNumber(d.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
