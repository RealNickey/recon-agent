import React, { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";

export interface CandlestickDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  variance?: number;
}

interface BklitCandlestickChartProps {
  data?: CandlestickDataPoint[];
  currency?: string;
  height?: number;
}

export const BklitCandlestickChart: React.FC<BklitCandlestickChartProps> = ({
  data,
  currency = "INR",
  height = 320,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Generate sensible synthetic settlement corridor candles if not passed
  const chartData: CandlestickDataPoint[] = useMemo(() => {
    if (data && data.length > 0) return data;
    return [
      { date: "Day 1", open: 240000, high: 255000, low: 238000, close: 252000, volume: 142000, variance: 0 },
      { date: "Day 2", open: 252000, high: 268000, low: 249000, close: 265000, volume: 185000, variance: 0 },
      { date: "Day 3", open: 265000, high: 272000, low: 258000, close: 260000, volume: 120000, variance: 0.02 },
      { date: "Day 4", open: 260000, high: 285000, low: 259000, close: 282000, volume: 210000, variance: 0 },
      { date: "Day 5", open: 282000, high: 298000, low: 279000, close: 295000, volume: 195000, variance: 0 },
      { date: "Day 6", open: 295000, high: 305000, low: 288000, close: 290000, volume: 160000, variance: 0 },
      { date: "Day 7", open: 290000, high: 315000, low: 289000, close: 312000, volume: 240000, variance: 0 },
    ];
  }, [data]);

  const paddingX = 40;
  const paddingY = 24;
  const bottomVolumeHeight = 60;
  const candleAreaHeight = height - paddingY * 2 - bottomVolumeHeight;
  const width = 680;

  const minVal = useMemo(() => Math.min(...chartData.map((d) => d.low)) * 0.98, [chartData]);
  const maxVal = useMemo(() => Math.max(...chartData.map((d) => d.high)) * 1.02, [chartData]);
  const maxVol = useMemo(() => Math.max(...chartData.map((d) => d.volume), 1), [chartData]);

  const getY = (val: number) => {
    return paddingY + candleAreaHeight - ((val - minVal) / (maxVal - minVal || 1)) * candleAreaHeight;
  };

  const candleSpacing = (width - paddingX * 2) / chartData.length;
  const candleWidth = Math.max(candleSpacing * 0.55, 8);

  const hoveredItem = hoveredIndex !== null ? chartData[hoveredIndex] : null;

  return (
    <div className="w-full relative select-none">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">Settlement Liquidity Spreads</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            Corridor: <strong className="text-foreground">{currency}</strong>
          </span>
        </div>
        {hoveredItem ? (
          <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            <span>O: <strong className="text-foreground">{formatCurrency(hoveredItem.open, currency)}</strong></span>
            <span>H: <strong className="text-foreground">{formatCurrency(hoveredItem.high, currency)}</strong></span>
            <span>L: <strong className="text-foreground">{formatCurrency(hoveredItem.low, currency)}</strong></span>
            <span>C: <strong className="text-foreground">{formatCurrency(hoveredItem.close, currency)}</strong></span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">Hover over candles for OHLC spread breakdown</span>
        )}
      </div>

      {/* SVG Container */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[560px]"
          style={{ maxHeight: height }}
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = paddingY + candleAreaHeight * (1 - pct);
            const val = minVal + (maxVal - minVal) * pct;
            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  opacity={0.4}
                />
                <text
                  x={paddingX - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize={9}
                  fontFamily="monospace"
                >
                  {formatCurrency(val, currency)}
                </text>
              </g>
            );
          })}

          {/* Volume separator */}
          <line
            x1={paddingX}
            y1={paddingY + candleAreaHeight + 10}
            x2={width - paddingX}
            y2={paddingY + candleAreaHeight + 10}
            stroke="var(--border)"
            opacity={0.6}
          />

          {/* Candlesticks & Volume Bars */}
          {chartData.map((d, idx) => {
            const isBullish = d.close >= d.open;
            const candleColor = isBullish ? "var(--chart-2)" : "var(--destructive)";
            const cx = paddingX + idx * candleSpacing + candleSpacing / 2;

            const yHigh = getY(d.high);
            const yLow = getY(d.low);
            const yOpen = getY(d.open);
            const yClose = getY(d.close);

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);

            // Volume bar
            const volY = paddingY + candleAreaHeight + 14;
            const volHeight = (d.volume / maxVol) * (bottomVolumeHeight - 20);

            const isHovered = hoveredIndex === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Background column highlight on hover */}
                {isHovered && (
                  <rect
                    x={cx - candleSpacing / 2}
                    y={paddingY}
                    width={candleSpacing}
                    height={height - paddingY * 2}
                    fill="var(--muted)"
                    opacity={0.25}
                  />
                )}

                {/* Upper and Lower Wicks */}
                <line
                  x1={cx}
                  y1={yHigh}
                  x2={cx}
                  y2={yLow}
                  stroke={candleColor}
                  strokeWidth={1.5}
                />

                {/* Candle Body */}
                <rect
                  x={cx - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  rx={1.5}
                  fill={candleColor}
                  stroke={candleColor}
                  strokeWidth={1}
                />

                {/* Volume Bar */}
                <rect
                  x={cx - candleWidth / 2}
                  y={volY + (bottomVolumeHeight - 20 - volHeight)}
                  width={candleWidth}
                  height={volHeight}
                  rx={1}
                  fill={candleColor}
                  opacity={0.35}
                />

                {/* X-Axis Date label */}
                <text
                  x={cx}
                  y={height - 4}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize={9.5}
                  fontFamily="monospace"
                >
                  {d.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
