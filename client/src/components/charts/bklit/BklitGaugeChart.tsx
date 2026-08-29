import React from "react";

interface BklitGaugeChartProps {
  value: number; // 0 to 100
  title: string;
  subtitle?: string;
  target?: number;
  size?: number;
  unit?: string;
  thresholds?: {
    low: number;
    medium: number;
    high: number;
  };
}

export const BklitGaugeChart: React.FC<BklitGaugeChartProps> = ({
  value,
  title,
  subtitle,
  target = 100,
  size = 180,
  unit = "%",
  thresholds = { low: 70, medium: 90, high: 98 },
}) => {
  const clampedVal = Math.max(0, Math.min(100, value));

  // Arc calculation for semi-circle (180 degrees from 180 to 0)
  const radius = 70;
  const strokeWidth = 10;
  const cx = size / 2;
  const cy = size * 0.58;

  // Polar to Cartesian conversion
  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 180) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, r, endAngle);
    const end = polarToCartesian(x, y, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return ["M", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y].join(" ");
  };

  // 180 degrees total span
  const currentAngle = (clampedVal / 100) * 180;
  const targetAngle = (Math.max(0, Math.min(100, target)) / 100) * 180;

  // Dynamic status color
  const statusColor =
    clampedVal >= thresholds.high
      ? "var(--chart-2)"
      : clampedVal >= thresholds.medium
      ? "var(--chart-4)"
      : "var(--destructive)";

  const needlePos = polarToCartesian(cx, cy, radius - 6, currentAngle);
  const targetPos = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 3, targetAngle);

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-border bg-card shadow-xs select-none">
      <div className="relative" style={{ width: size, height: size * 0.72 }}>
        <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`}>
          {/* Background Arc Track */}
          <path
            d={describeArc(cx, cy, radius, 0, 180)}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.35}
          />

          {/* Value Progress Arc */}
          {clampedVal > 0 && (
            <path
              d={describeArc(cx, cy, radius, 0, currentAngle)}
              fill="none"
              stroke={statusColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          )}

          {/* Target marker pin */}
          {target && (
            <circle
              cx={targetPos.x}
              cy={targetPos.y}
              r={2.5}
              fill="var(--foreground)"
              stroke="var(--card)"
              strokeWidth={1}
            />
          )}

          {/* Needle center hub */}
          <circle cx={cx} cy={cy} r={5} fill="var(--foreground)" />

          {/* Needle line */}
          <line
            x1={cx}
            y1={cy}
            x2={needlePos.x}
            y2={needlePos.y}
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />

          {/* Scale labels */}
          <text
            x={cx - radius - 2}
            y={cy + 16}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={9.5}
            fontFamily="monospace"
          >
            0
          </text>
          <text
            x={cx}
            y={cy - radius + strokeWidth + 6}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={9.5}
            fontFamily="monospace"
          >
            50
          </text>
          <text
            x={cx + radius + 2}
            y={cy + 16}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={9.5}
            fontFamily="monospace"
          >
            100
          </text>
        </svg>

        {/* Center Digital readout */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center">
          <div className="text-xl font-bold font-mono text-foreground tracking-tight">
            {clampedVal.toFixed(1)}
            <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>
          </div>
        </div>
      </div>

      {/* Title & Subtitle */}
      <div className="text-center mt-1">
        <span className="text-xs font-semibold text-foreground block">{title}</span>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground block">{subtitle}</span>
        )}
      </div>
    </div>
  );
};
