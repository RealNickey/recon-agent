import React from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface RadarMetric {
  subject: string;
  current: number; // 0 to 100
  baseline: number; // 0 to 100
  fullMark: number;
}

interface BklitRadarChartProps {
  metrics?: RadarMetric[];
  height?: number;
}

export const BklitRadarChart: React.FC<BklitRadarChartProps> = ({
  metrics,
  height = 300,
}) => {
  const chartData: RadarMetric[] = metrics || [
    { subject: "Exact Hash Recall", current: 100, baseline: 92, fullMark: 100 },
    { subject: "Fuzzy Sensitivity", current: 99, baseline: 85, fullMark: 100 },
    { subject: "Timing Window (±5d)", current: 97, baseline: 80, fullMark: 100 },
    { subject: "MDR Fee Precision", current: 100, baseline: 88, fullMark: 100 },
    { subject: "False Positive Immunity", current: 100, baseline: 90, fullMark: 100 },
    { subject: "Multi-Seed Generalization", current: 99, baseline: 82, fullMark: 100 },
  ];

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">6-Axis Pipeline Capability Radar</span>
        <span className="text-[11px] font-mono text-muted-foreground">Deterministic Evaluation</span>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke="var(--border)" opacity={0.6} />
            <PolarAngleAxis
              dataKey="subject"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              stroke="var(--muted-foreground)"
              fontSize={9}
              tick={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as RadarMetric;
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-0.5">
                        {d.subject}
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="flex items-center gap-1 text-chart-1">
                          <span className="w-2 h-2 rounded-full bg-chart-1" />
                          Recon Agent v2.4:
                        </span>
                        <span className="font-mono font-bold text-foreground">{d.current}%</span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                          Standard Rule Baseline:
                        </span>
                        <span className="font-mono text-muted-foreground">{d.baseline}%</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
              iconType="circle"
              iconSize={6}
            />
            <Radar
              name="Recon Agent v2.4"
              dataKey="current"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.4}
              strokeWidth={2}
            />
            <Radar
              name="Rule Baseline"
              dataKey="baseline"
              stroke="var(--muted-foreground)"
              fill="var(--muted)"
              fillOpacity={0.2}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
