import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

export interface LineChartPoint {
  label: string;
  [key: string]: number | string;
}

interface BklitLineChartProps {
  data: LineChartPoint[];
  series: { key: string; name: string; color: string; dashed?: boolean }[];
  height?: number;
  title?: string;
  unit?: string;
  referenceValue?: number;
  domain?: [number, number];
}

export const BklitLineChart: React.FC<BklitLineChartProps> = ({
  data,
  series,
  height = 240,
  title,
  unit = "%",
  referenceValue,
  domain = [0, 100],
}) => {
  return (
    <div className="w-full select-none space-y-2">
      {title && (
        <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-[11px] font-mono text-muted-foreground">{series.length} Series</span>
        </div>
      )}

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={domain}
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1 min-w-[150px]">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-0.5">
                        {label}
                      </div>
                      {payload.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-[11px] gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}:
                          </span>
                          <span className="font-mono text-foreground font-bold">
                            {p.value}{unit}
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
            {referenceValue !== undefined && (
              <ReferenceLine y={referenceValue} stroke="var(--border)" strokeDasharray="3 3" />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "4 4" : undefined}
                dot={{ r: 3.5, fill: s.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
