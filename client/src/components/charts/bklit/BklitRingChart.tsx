import React, { useState } from "react";
import { formatNumber } from "@/lib/utils";

export interface RingItem {
  label: string;
  value: number;
  percentage: number;
  color: string;
  sublabel?: string;
}

export interface RingLayer {
  name: string;
  items: RingItem[];
}

interface BklitRingChartProps {
  layers?: RingLayer[];
  size?: number;
}

export const BklitRingChart: React.FC<BklitRingChartProps> = ({
  layers,
  size = 280,
}) => {
  const [hoveredItem, setHoveredItem] = useState<{ layer: string; item: RingItem } | null>(null);

  // Default concentric layers
  const defaultLayers: RingLayer[] = layers || [
    {
      name: "Tiers",
      items: [
        { label: "Tier 1: Hash-Join", value: 35, percentage: 35, color: "var(--chart-1)" },
        { label: "Tier 2: Fuzzy", value: 50, percentage: 50, color: "var(--chart-2)" },
        { label: "Tier 3: Agent AI", value: 15, percentage: 15, color: "var(--chart-4)" },
      ],
    },
    {
      name: "Sources",
      items: [
        { label: "Ledger", value: 48, percentage: 48, color: "var(--chart-1)" },
        { label: "Gateway", value: 32, percentage: 32, color: "var(--chart-2)" },
        { label: "Bank", value: 20, percentage: 20, color: "var(--chart-3)" },
      ],
    },
    {
      name: "Status",
      items: [
        { label: "Reconciled", value: 88, percentage: 88, color: "var(--chart-2)" },
        { label: "Suspense", value: 12, percentage: 12, color: "var(--destructive)" },
      ],
    },
  ];

  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = 14;
  const ringGap = 6;
  const baseRadius = 45;

  const describeArc = (
    centerX: number,
    centerY: number,
    r: number,
    startDeg: number,
    endDeg: number
  ) => {
    const span = Math.min(Math.max(endDeg - startDeg, 0.1), 359.99);
    const sRad = ((startDeg - 90) * Math.PI) / 180;
    const eRad = ((startDeg + span - 90) * Math.PI) / 180;

    const x1 = centerX + r * Math.cos(sRad);
    const y1 = centerY + r * Math.sin(sRad);
    const x2 = centerX + r * Math.cos(eRad);
    const y2 = centerY + r * Math.sin(eRad);

    const largeArcFlag = span > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      <div className="flex items-center justify-between w-full pb-2 text-xs border-b border-border/40 mb-2">
        <span className="font-semibold text-foreground">Concentric Ring Distributions</span>
        <span className="text-[11px] font-mono text-muted-foreground">Tiers · Sources · Status</span>
      </div>

      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {defaultLayers.map((layer, lIdx) => {
            const r = baseRadius + lIdx * (ringWidth + ringGap);
            let currentAngle = 0;

            return (
              <g key={layer.name}>
                {/* Background Ring track */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth={ringWidth}
                  opacity={0.25}
                />

                {/* Segments */}
                {layer.items.map((item, iIdx) => {
                  const span = (item.percentage / 100) * 360;
                  const start = currentAngle;
                  const end = currentAngle + span;
                  currentAngle += span;

                  const isHovered =
                    hoveredItem?.layer === layer.name && hoveredItem.item.label === item.label;

                  return (
                    <path
                      key={item.label}
                      d={describeArc(cx, cy, r, start, end - 1.5)}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={isHovered ? ringWidth + 3 : ringWidth}
                      strokeLinecap="round"
                      opacity={isHovered ? 1 : 0.85}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredItem({ layer: layer.name, item })}
                      onMouseLeave={() => setHoveredItem(null)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[9px] uppercase font-semibold text-muted-foreground">
            {hoveredItem ? hoveredItem.layer : "Overview"}
          </span>
          <span className="text-sm font-bold font-mono text-foreground">
            {hoveredItem ? `${hoveredItem.item.percentage}%` : "Multi-Ring"}
          </span>
          <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
            {hoveredItem ? hoveredItem.item.label.split(":")[0] : "3 Layers"}
          </span>
        </div>
      </div>
    </div>
  );
};
