import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatNumber } from "@/lib/utils";

export interface BarChartItem {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  sublabel?: string;
}

interface BklitBarChartProps {
  data: BarChartItem[];
  layout?: "horizontal" | "vertical";
  height?: number;
  barSize?: number;
  onBarClick?: (item: BarChartItem) => void;
  title?: string;
  unit?: string;
}

export const BklitBarChart: React.FC<BklitBarChartProps> = ({
  data,
  layout = "vertical",
  height = 240,
  barSize = 14,
  onBarClick,
  title,
  unit = "recs",
}) => {
  const isVertical = layout === "vertical";

  return (
    <div className="w-full select-none space-y-2">
      {title && (
        <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-[11px] font-mono text-muted-foreground">{data.length} Categories</span>
        </div>
      )}

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={isVertical ? "vertical" : "horizontal"}
            margin={{ top: 5, right: 20, left: isVertical ? 0 : -10, bottom: 5 }}
            onClick={(state) => {
              if (state && state.activePayload && state.activePayload[0]) {
                onBarClick?.(state.activePayload[0].payload as BarChartItem);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
            {isVertical ? (
              <>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={120}
                />
              </>
            ) : (
              <>
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
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as BarChartItem;
                  return (
                    <div className="rounded border border-border bg-card p-2 shadow-sm text-xs space-y-1">
                      <div className="font-semibold text-foreground">{d.label}</div>
                      {d.sublabel && (
                        <div className="text-[10px] text-muted-foreground">{d.sublabel}</div>
                      )}
                      <div className="flex justify-between items-center gap-4 text-[11px] font-mono">
                        <span className="text-muted-foreground">Count:</span>
                        <span className="font-bold text-foreground">{formatNumber(d.value)} {unit}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={barSize} cursor="pointer">
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || "var(--chart-1)"}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
