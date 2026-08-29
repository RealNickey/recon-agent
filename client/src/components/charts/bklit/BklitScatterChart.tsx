import React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface ScatterPoint {
  id: string;
  driftDays: number;
  amount: number;
  confidence: number;
  tier: 1 | 2 | 3 | "exception";
  source: string;
  currency: string;
}

interface BklitScatterChartProps {
  points?: ScatterPoint[];
  height?: number;
}

export const BklitScatterChart: React.FC<BklitScatterChartProps> = ({
  points,
  height = 300,
}) => {
  // Default synthetic dispersion points
  const chartPoints: ScatterPoint[] = points || [
    { id: "TX-101", driftDays: 0, amount: 2450.0, confidence: 1.0, tier: 1, source: "ledger", currency: "INR" },
    { id: "TX-102", driftDays: 1, amount: 12500.0, confidence: 0.98, tier: 2, source: "processor", currency: "INR" },
    { id: "TX-103", driftDays: 2, amount: 48000.0, confidence: 0.95, tier: 2, source: "bank", currency: "INR" },
    { id: "TX-104", driftDays: -1, amount: 890.0, confidence: 0.99, tier: 1, source: "ledger", currency: "INR" },
    { id: "TX-105", driftDays: 4, amount: 154000.0, confidence: 0.82, tier: 3, source: "processor", currency: "INR" },
    { id: "TX-106", driftDays: -3, amount: 7200.0, confidence: 0.88, tier: 3, source: "ledger", currency: "INR" },
    { id: "TX-107", driftDays: 0, amount: 31000.0, confidence: 1.0, tier: 1, source: "bank", currency: "INR" },
    { id: "TX-108", driftDays: 1, amount: 95000.0, confidence: 0.96, tier: 2, source: "processor", currency: "INR" },
    { id: "TX-109", driftDays: 5, amount: 210000.0, confidence: 0.0, tier: "exception", source: "ledger", currency: "INR" },
    { id: "TX-110", driftDays: -2, amount: 14500.0, confidence: 0.94, tier: 2, source: "bank", currency: "INR" },
    { id: "TX-111", driftDays: 0, amount: 6200.0, confidence: 1.0, tier: 1, source: "ledger", currency: "INR" },
    { id: "TX-112", driftDays: 3, amount: 88000.0, confidence: 0.85, tier: 3, source: "processor", currency: "INR" },
  ];

  const getColor = (tier: 1 | 2 | 3 | "exception") => {
    if (tier === 1) return "var(--chart-1)";
    if (tier === 2) return "var(--chart-2)";
    if (tier === 3) return "var(--chart-4)";
    return "var(--destructive)";
  };

  return (
    <div className="w-full select-none space-y-2">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">Timing Drift vs Amount Dispersion Scatter</span>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} /> T1
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} /> T2
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-4)" }} /> T3
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--destructive)" }} /> Exception
          </span>
        </div>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis
              type="number"
              dataKey="driftDays"
              name="Timing Drift (Days)"
              unit="d"
              domain={[-5, 6]}
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="amount"
              name="Settlement Amount"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <ZAxis type="number" dataKey="confidence" range={[40, 140]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as ScatterPoint;
                  return (
                    <div className="rounded border border-border bg-card p-2.5 shadow-sm text-xs space-y-1">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-0.5 flex justify-between items-center gap-2">
                        <span>{d.id}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted">
                          {d.tier === "exception" ? "Exception" : `Tier ${d.tier}`}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-mono font-bold text-foreground">
                          {formatCurrency(d.amount, d.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="text-muted-foreground">Settlement Drift:</span>
                        <span className="font-mono text-foreground">{d.driftDays >= 0 ? `+${d.driftDays}` : d.driftDays} days</span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[10px] text-muted-foreground font-mono">
                        <span>Confidence:</span>
                        <span>{(d.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
            <Scatter data={chartPoints} shape="circle">
              {chartPoints.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(entry.tier)}
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
