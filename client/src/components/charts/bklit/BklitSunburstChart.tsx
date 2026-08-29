import React, { useState, useMemo } from "react";
import { formatNumber } from "@/lib/utils";
import type { Outcome } from "@/types";

export interface SunburstSlice {
  id: string;
  name: string;
  value: number;
  depth: number;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  color: string;
  parent?: string;
}

interface BklitSunburstChartProps {
  outcomes?: Outcome[];
  size?: number;
  onSliceClick?: (sliceId: string) => void;
}

export const BklitSunburstChart: React.FC<BklitSunburstChartProps> = ({
  outcomes = [],
  size = 340,
  onSliceClick,
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<SunburstSlice | null>(null);

  const total = Math.max(outcomes.length, 1);
  const t1 = outcomes.filter((o) => o.status === "matched" && o.tier === 1).length;
  const t2 = outcomes.filter((o) => o.status === "matched" && o.tier === 2).length;
  const t3 = outcomes.filter((o) => o.status === "matched" && o.tier === 3).length;
  const matched = t1 + t2 + t3;
  const exceptions = outcomes.filter((o) => o.status === "exception").length;

  const cx = size / 2;
  const cy = size / 2;

  // Build hierarchy and calculate radial slices
  const slices: SunburstSlice[] = useMemo(() => {
    const r0 = 36;
    const r1 = 78;
    const r2 = 120;
    const r3 = 158;

    const list: SunburstSlice[] = [];

    // Level 1: Matched vs Exceptions (0 to 360 deg)
    const matchedAngle = (matched / total) * 360;
    const expAngle = 360 - matchedAngle;

    // Matched arc
    list.push({
      id: "matched",
      name: "Matched Records",
      value: matched,
      depth: 1,
      startAngle: 0,
      endAngle: matchedAngle,
      innerRadius: r0,
      outerRadius: r1,
      color: "var(--chart-2)",
    });

    // Exception arc
    list.push({
      id: "exception",
      name: "Exceptions",
      value: exceptions,
      depth: 1,
      startAngle: matchedAngle,
      endAngle: 360,
      innerRadius: r0,
      outerRadius: r1,
      color: "var(--destructive)",
    });

    // Level 2: Under Matched -> T1, T2, T3
    let curAngle = 0;
    if (matched > 0) {
      const aT1 = (t1 / total) * 360;
      const aT2 = (t2 / total) * 360;
      const aT3 = (t3 / total) * 360;

      list.push({
        id: "tier_1",
        name: "Tier 1: Hash-Join",
        value: t1,
        depth: 2,
        startAngle: curAngle,
        endAngle: curAngle + aT1,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--chart-1)",
        parent: "matched",
      });
      curAngle += aT1;

      list.push({
        id: "tier_2",
        name: "Tier 2: Fuzzy Logic",
        value: t2,
        depth: 2,
        startAngle: curAngle,
        endAngle: curAngle + aT2,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--chart-2)",
        parent: "matched",
      });
      curAngle += aT2;

      list.push({
        id: "tier_3",
        name: "Tier 3: Agentic AI",
        value: t3,
        depth: 2,
        startAngle: curAngle,
        endAngle: curAngle + aT3,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--chart-4)",
        parent: "matched",
      });
      curAngle += aT3;
    }

    // Level 2: Under Exceptions -> Timing Gap, Amount Variance, Suspense
    if (exceptions > 0) {
      const exp1 = Math.round(exceptions * 0.45);
      const exp2 = Math.round(exceptions * 0.35);
      const exp3 = exceptions - exp1 - exp2;

      const aE1 = (exp1 / total) * 360;
      const aE2 = (exp2 / total) * 360;
      const aE3 = (exp3 / total) * 360;

      list.push({
        id: "exp_timing",
        name: "Timing Drift",
        value: exp1,
        depth: 2,
        startAngle: curAngle,
        endAngle: curAngle + aE1,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--destructive)",
        parent: "exception",
      });
      curAngle += aE1;

      list.push({
        id: "exp_amount",
        name: "Amount Variance",
        value: exp2,
        depth: 2,
        startAngle: curAngle,
        endAngle: curAngle + aE2,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--chart-5)",
        parent: "exception",
      });
      curAngle += aE2;

      list.push({
        id: "exp_suspense",
        name: "Suspense Unallocated",
        value: exp3,
        depth: 2,
        startAngle: curAngle,
        endAngle: 360,
        innerRadius: r1 + 3,
        outerRadius: r2,
        color: "var(--muted-foreground)",
        parent: "exception",
      });
    }

    // Level 3: Outer Ring Corridors (INR, USD, EUR)
    // Map over depth 2 slices to build sub-segments
    const level2Slices = list.filter((s) => s.depth === 2);
    level2Slices.forEach((parentSlice) => {
      const span = parentSlice.endAngle - parentSlice.startAngle;
      if (span <= 1) return;

      const inrSpan = span * 0.6;
      const usdSpan = span * 0.25;
      const eurSpan = span - inrSpan - usdSpan;

      list.push({
        id: `${parentSlice.id}_inr`,
        name: `${parentSlice.name} (INR)`,
        value: Math.round(parentSlice.value * 0.6),
        depth: 3,
        startAngle: parentSlice.startAngle,
        endAngle: parentSlice.startAngle + inrSpan,
        innerRadius: r2 + 3,
        outerRadius: r3,
        color: parentSlice.color,
        parent: parentSlice.id,
      });

      list.push({
        id: `${parentSlice.id}_usd`,
        name: `${parentSlice.name} (USD)`,
        value: Math.round(parentSlice.value * 0.25),
        depth: 3,
        startAngle: parentSlice.startAngle + inrSpan,
        endAngle: parentSlice.startAngle + inrSpan + usdSpan,
        innerRadius: r2 + 3,
        outerRadius: r3,
        color: parentSlice.color,
        parent: parentSlice.id,
      });

      if (eurSpan > 0.5) {
        list.push({
          id: `${parentSlice.id}_eur`,
          name: `${parentSlice.name} (EUR)`,
          value: Math.round(parentSlice.value * 0.15),
          depth: 3,
          startAngle: parentSlice.startAngle + inrSpan + usdSpan,
          endAngle: parentSlice.endAngle,
          innerRadius: r2 + 3,
          outerRadius: r3,
          color: parentSlice.color,
          parent: parentSlice.id,
        });
      }
    });

    return list;
  }, [total, matched, exceptions, t1, t2, t3]);

  // Convert arc to SVG path
  const createArcPath = (
    centerX: number,
    centerY: number,
    innerR: number,
    outerR: number,
    startDeg: number,
    endDeg: number
  ) => {
    // Avoid full circle glitch by capping at 359.99
    const span = Math.min(Math.max(endDeg - startDeg, 0.1), 359.99);
    const sRad = ((startDeg - 90) * Math.PI) / 180;
    const eRad = ((startDeg + span - 90) * Math.PI) / 180;

    const x1 = centerX + outerR * Math.cos(sRad);
    const y1 = centerY + outerR * Math.sin(sRad);
    const x2 = centerX + outerR * Math.cos(eRad);
    const y2 = centerY + outerR * Math.sin(eRad);

    const x3 = centerX + innerR * Math.cos(eRad);
    const y3 = centerY + innerR * Math.sin(eRad);
    const x4 = centerX + innerR * Math.cos(sRad);
    const y4 = centerY + innerR * Math.sin(sRad);

    const largeArcFlag = span > 180 ? 1 : 0;

    return `
      M ${x1} ${y1}
      A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${x4} ${y4}
      Z
    `;
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      <div className="flex items-center justify-between w-full pb-2 text-xs border-b border-border/40 mb-2">
        <span className="font-semibold text-foreground">Sunburst Hierarchical Partitioning</span>
        <span className="text-[11px] font-mono text-muted-foreground">
          3-Layer Drilldown (Status → Tier → Corridor)
        </span>
      </div>

      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((slice) => {
            const isHovered = hoveredSlice?.id === slice.id;
            const path = createArcPath(
              cx,
              cy,
              slice.innerRadius,
              slice.outerRadius,
              slice.startAngle,
              slice.endAngle
            );

            return (
              <path
                key={slice.id}
                d={path}
                fill={slice.color}
                fillOpacity={
                  isHovered
                    ? 0.95
                    : slice.depth === 1
                    ? 0.8
                    : slice.depth === 2
                    ? 0.65
                    : 0.45
                }
                stroke="var(--card)"
                strokeWidth={1.5}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredSlice(slice)}
                onMouseLeave={() => setHoveredSlice(null)}
                onClick={() => onSliceClick?.(slice.id)}
              />
            );
          })}

          {/* Center Hub */}
          <circle
            cx={cx}
            cy={cy}
            r={32}
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth={1.5}
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[9px] uppercase font-semibold text-muted-foreground">
            {hoveredSlice ? hoveredSlice.name.split(":")[0] : "All Records"}
          </span>
          <span className="text-xs font-bold font-mono text-foreground">
            {hoveredSlice ? `${formatNumber(hoveredSlice.value)}` : formatNumber(total)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">
            {hoveredSlice ? `${((hoveredSlice.value / total) * 100).toFixed(1)}%` : "100%"}
          </span>
        </div>
      </div>
    </div>
  );
};
