import React, { useState } from "react";
import { Button } from "@razorpay/blade/components";
import { formatNumber } from "@/lib/utils";
import type { Outcome } from "@/types";

export interface FunnelStage {
  id: string;
  name: string;
  count: number;
  rate: number; // percentage of total
  stepConversion: number; // percentage of previous step
  color: string;
  description: string;
  tier?: number | string;
}

interface BklitFunnelChartProps {
  outcomes?: Outcome[];
  selectedTier?: number | string | null;
  onSelectTier?: (tier: number | string | null) => void;
  height?: number;
}

export const BklitFunnelChart: React.FC<BklitFunnelChartProps> = ({
  outcomes = [],
  selectedTier,
  onSelectTier,
  height = 320,
}) => {
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const total = Math.max(outcomes.length, 1);
  const t1Count = outcomes.filter((o) => o.status === "matched" && o.tier === 1).length;
  const t2Count = outcomes.filter((o) => o.status === "matched" && o.tier === 2).length;
  const t3Count = outcomes.filter((o) => o.status === "matched" && o.tier === 3).length;
  const expCount = outcomes.filter((o) => o.status === "exception").length;

  // Cumulative cascade funnel stages
  const afterT1 = total - t1Count;
  const afterT2 = afterT1 - t2Count;
  const afterT3 = afterT2 - t3Count;

  const stages: FunnelStage[] = [
    {
      id: "ingested",
      name: "1. Total Ingested Pool",
      count: total,
      rate: 100,
      stepConversion: 100,
      color: "var(--chart-1)",
      description: "Raw cross-source ingestion across ledger, processor & bank statements",
      tier: "all",
    },
    {
      id: "tier1",
      name: "2. Tier-1 Exact Match",
      count: t1Count,
      rate: Number(((t1Count / total) * 100).toFixed(1)),
      stepConversion: Number(((t1Count / total) * 100).toFixed(1)),
      color: "var(--chart-2)",
      description: "Zero-latency SHA-256 reference hash-join and invoice token equivalence",
      tier: 1,
    },
    {
      id: "tier2",
      name: "3. Tier-2 Fuzzy & Tolerance",
      count: t2Count,
      rate: Number(((t2Count / total) * 100).toFixed(1)),
      stepConversion: afterT1 > 0 ? Number(((t2Count / afterT1) * 100).toFixed(1)) : 0,
      color: "var(--chart-3)",
      description: "Levenshtein vendor similarity, T+1/T+2 timing drift, and 2.36% MDR adjustments",
      tier: 2,
    },
    {
      id: "tier3",
      name: "4. Tier-3 Agentic AI",
      count: t3Count,
      rate: Number(((t3Count / total) * 100).toFixed(1)),
      stepConversion: afterT2 > 0 ? Number(((t3Count / afterT2) * 100).toFixed(1)) : 0,
      color: "var(--chart-4)",
      description: "Multi-step LLM candidate reasoning with sandbox math verification",
      tier: 3,
    },
    {
      id: "exceptions",
      name: "5. Residual Suspense Pool",
      count: expCount,
      rate: Number(((expCount / total) * 100).toFixed(1)),
      stepConversion: Number(((expCount / total) * 100).toFixed(1)),
      color: "var(--destructive)",
      description: "Honest unallocated exceptions requiring controller audit or suspense clearing",
      tier: "exception",
    },
  ];

  return (
    <div className="w-full select-none space-y-3">
      {/* Top summary strip */}
      <div className="flex items-center justify-between text-xs pb-2 border-b border-border/40 font-mono text-muted-foreground">
        <span>Cascade Ingestion Progression</span>
        {selectedTier && (
          <Button
            variant="tertiary"
            size="xsmall"
            onClick={() => onSelectTier?.(null)}
            accessibilityLabel="Reset tier filter"
          >
            Reset Filter
          </Button>
        )}
      </div>

      {/* Funnel Stage Bars */}
      <div className="space-y-2.5">
        {stages.map((stage, idx) => {
          const isSelected = selectedTier === stage.tier;
          const isHovered = hoveredStage === stage.id;
          const widthPercent = Math.max(Math.min((stage.count / total) * 100, 100), 12);

          return (
            <div
              key={stage.id}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? "bg-muted/60 border-foreground/40 shadow-sm"
                  : isHovered
                  ? "bg-muted/30 border-border"
                  : "bg-card/60 border-border/60 hover:bg-muted/20"
              }`}
              onClick={() => onSelectTier?.(stage.tier === selectedTier ? null : stage.tier || null)}
              onMouseEnter={() => setHoveredStage(stage.id)}
              onMouseLeave={() => setHoveredStage(null)}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-semibold text-foreground">{stage.name}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-foreground font-semibold">
                    {formatNumber(stage.count)} recs
                  </span>
                  <span className="text-muted-foreground">({stage.rate}%)</span>
                </div>
              </div>

              {/* Progress Trapezoid Bar */}
              <div className="w-full bg-muted/40 rounded h-3.5 relative overflow-hidden flex items-center">
                <div
                  className="h-full rounded transition-all duration-300 flex items-center justify-end pr-1.5"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: stage.color,
                    opacity: isSelected ? 0.95 : isHovered ? 0.85 : 0.7,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1.5">
                <span className="truncate pr-2">{stage.description}</span>
                {idx > 0 && idx < 4 && (
                  <span className="font-mono text-foreground font-medium shrink-0">
                    Step Yield: {stage.stepConversion}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
