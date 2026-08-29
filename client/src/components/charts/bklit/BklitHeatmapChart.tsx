import React, { useState } from "react";
import { formatNumber } from "@/lib/utils";

export interface HeatmapCell {
  xLabel: string;
  yLabel: string;
  value: number;
  intensity: number; // 0 to 1
  category?: string;
}

interface BklitHeatmapChartProps {
  data?: HeatmapCell[];
  xCategories?: string[];
  yCategories?: string[];
  title?: string;
  height?: number;
}

export const BklitHeatmapChart: React.FC<BklitHeatmapChartProps> = ({
  data,
  xCategories = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  yCategories = ["INR Ledger", "USD Stripe", "EUR SEPA", "Razorpay UPI", "Bank Direct"],
  title = "Settlement Activity Density Matrix",
  height = 260,
}) => {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  // Default synthetic settlement matrix
  const matrix: HeatmapCell[] = data || [
    { xLabel: "Mon", yLabel: "INR Ledger", value: 85, intensity: 0.85 },
    { xLabel: "Tue", yLabel: "INR Ledger", value: 92, intensity: 0.92 },
    { xLabel: "Wed", yLabel: "INR Ledger", value: 78, intensity: 0.78 },
    { xLabel: "Thu", yLabel: "INR Ledger", value: 110, intensity: 1.0 },
    { xLabel: "Fri", yLabel: "INR Ledger", value: 95, intensity: 0.95 },
    { xLabel: "Sat", yLabel: "INR Ledger", value: 24, intensity: 0.24 },

    { xLabel: "Mon", yLabel: "USD Stripe", value: 45, intensity: 0.45 },
    { xLabel: "Tue", yLabel: "USD Stripe", value: 58, intensity: 0.58 },
    { xLabel: "Wed", yLabel: "USD Stripe", value: 62, intensity: 0.62 },
    { xLabel: "Thu", yLabel: "USD Stripe", value: 70, intensity: 0.70 },
    { xLabel: "Fri", yLabel: "USD Stripe", value: 65, intensity: 0.65 },
    { xLabel: "Sat", yLabel: "USD Stripe", value: 15, intensity: 0.15 },

    { xLabel: "Mon", yLabel: "EUR SEPA", value: 28, intensity: 0.28 },
    { xLabel: "Tue", yLabel: "EUR SEPA", value: 34, intensity: 0.34 },
    { xLabel: "Wed", yLabel: "EUR SEPA", value: 40, intensity: 0.40 },
    { xLabel: "Thu", yLabel: "EUR SEPA", value: 38, intensity: 0.38 },
    { xLabel: "Fri", yLabel: "EUR SEPA", value: 42, intensity: 0.42 },
    { xLabel: "Sat", yLabel: "EUR SEPA", value: 8, intensity: 0.08 },

    { xLabel: "Mon", yLabel: "Razorpay UPI", value: 120, intensity: 1.0 },
    { xLabel: "Tue", yLabel: "Razorpay UPI", value: 115, intensity: 0.96 },
    { xLabel: "Wed", yLabel: "Razorpay UPI", value: 105, intensity: 0.88 },
    { xLabel: "Thu", yLabel: "Razorpay UPI", value: 130, intensity: 1.0 },
    { xLabel: "Fri", yLabel: "Razorpay UPI", value: 140, intensity: 1.0 },
    { xLabel: "Sat", yLabel: "Razorpay UPI", value: 80, intensity: 0.67 },

    { xLabel: "Mon", yLabel: "Bank Direct", value: 60, intensity: 0.60 },
    { xLabel: "Tue", yLabel: "Bank Direct", value: 55, intensity: 0.55 },
    { xLabel: "Wed", yLabel: "Bank Direct", value: 70, intensity: 0.70 },
    { xLabel: "Thu", yLabel: "Bank Direct", value: 85, intensity: 0.85 },
    { xLabel: "Fri", yLabel: "Bank Direct", value: 80, intensity: 0.80 },
    { xLabel: "Sat", yLabel: "Bank Direct", value: 12, intensity: 0.12 },
  ];

  return (
    <div className="w-full select-none space-y-2">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">{title}</span>
        {hoveredCell ? (
          <span className="font-mono text-[11px] text-foreground font-semibold">
            {hoveredCell.yLabel} on {hoveredCell.xLabel}: {formatNumber(hoveredCell.value)} events
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground font-mono">
            Settlement Frequency Heatmap
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[500px] space-y-1.5">
          {/* Header X axis */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-mono text-muted-foreground pb-1">
            <div className="text-left pl-1">Rail / Channel</div>
            {xCategories.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>

          {/* Grid rows */}
          {yCategories.map((y) => (
            <div key={y} className="grid grid-cols-7 gap-1.5 items-center">
              <div className="text-xs font-medium text-muted-foreground truncate pl-1">
                {y}
              </div>
              {xCategories.map((x) => {
                const cell = matrix.find((c) => c.xLabel === x && c.yLabel === y) || {
                  xLabel: x,
                  yLabel: y,
                  value: 0,
                  intensity: 0.05,
                };
                const isHovered =
                  hoveredCell?.xLabel === x && hoveredCell?.yLabel === y;

                return (
                  <div
                    key={`${x}-${y}`}
                    className={`h-9 rounded flex items-center justify-center font-mono text-[10px] cursor-pointer transition-all ${
                      isHovered
                        ? "ring-2 ring-foreground scale-105 z-10 font-bold"
                        : "hover:opacity-90"
                    }`}
                    style={{
                      backgroundColor: "var(--chart-1)",
                      opacity: Math.max(0.12, cell.intensity),
                      color: cell.intensity > 0.5 ? "var(--primary-foreground)" : "var(--foreground)",
                    }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {cell.value}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend strip */}
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-2 border-t border-border/40">
        <span>Low Intensity (≤ 20/day)</span>
        <div className="flex items-center gap-1">
          {[0.15, 0.35, 0.55, 0.75, 1.0].map((int, i) => (
            <span
              key={i}
              className="w-3.5 h-2.5 rounded-xs"
              style={{ backgroundColor: "var(--chart-1)", opacity: int }}
            />
          ))}
        </div>
        <span>High Intensity (≥ 120/day)</span>
      </div>
    </div>
  );
};
