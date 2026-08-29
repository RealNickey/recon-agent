import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Outcome } from "@/types";

interface ReasonCodeDistributionChartProps {
  outcomes: Outcome[];
}

export const ReasonCodeDistributionChart: React.FC<ReasonCodeDistributionChartProps> = ({
  outcomes,
}) => {
  const exceptions = outcomes.filter((o) => o.status === "exception");
  const counts: Record<string, number> = {};

  exceptions.forEach((e) => {
    const code = e.reasonCode || "unclassified";
    counts[code] = (counts[code] || 0) + 1;
  });

  const codeLabels: Record<string, string> = {
    exact_match: "Exact Match",
    timing_gap: "Timing Drift (>4d)",
    amount_variance: "Amount Variance",
    id_drift: "ID Format Drift",
    many_to_one: "Many-to-One Split",
    one_to_many: "One-to-Many Batch",
    duplicate_conflict: "Duplicate Collision",
    no_candidate_found: "No Pool Candidate",
    low_confidence: "Confidence < 0.70",
    currency_mismatch: "Currency Mismatch",
    refund_reversal: "Refund / Chargeback",
    partial_payment: "Partial Payment",
    model_error: "Model Fallback Error",
    collision_conflict: "Collision Conflict",
    fee_drift: "MDR Fee Drift (>3%)",
    suspense_unmatched: "Suspense Unallocated",
  };

  const data = Object.entries(counts)
    .map(([code, count]) => ({
      code,
      label: codeLabels[code] || code,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-44 text-muted-foreground text-xs">
        <span className="font-semibold text-foreground mb-1">0 Exceptions</span>
        <span>Clean reconciliation — 100% matched with zero unallocated variance</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={130}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded border border-border bg-card p-2 shadow-sm text-xs space-y-1">
                      <div className="font-medium text-foreground">{d.label}</div>
                      <div className="flex justify-between items-center gap-4 text-muted-foreground font-mono text-[11px]">
                        <span>Code: {d.code}</span>
                        <span className="font-semibold text-foreground">{d.count} records</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={13}>
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill="var(--destructive)"
                  opacity={Math.max(0.35, 0.7 - index * 0.08)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
