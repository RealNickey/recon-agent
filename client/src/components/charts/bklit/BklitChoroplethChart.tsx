import React, { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface GeoCorridorNode {
  id: string;
  code: string;
  country: string;
  region: string;
  x: number; // 0 to 100%
  y: number; // 0 to 100%
  reconciledVolume: number;
  unreconciledVolume: number;
  reconciledCount: number;
  currency: string;
  rate: number;
}

interface BklitChoroplethChartProps {
  corridors?: GeoCorridorNode[];
  height?: number;
  onSelectCorridor?: (code: string) => void;
}

export const BklitChoroplethChart: React.FC<BklitChoroplethChartProps> = ({
  corridors,
  height = 320,
  onSelectCorridor,
}) => {
  const [hoveredNode, setHoveredNode] = useState<GeoCorridorNode | null>(null);

  const nodes: GeoCorridorNode[] = corridors || [
    {
      id: "hub_inr",
      code: "INR",
      country: "India",
      region: "South Asia Hub",
      x: 68,
      y: 52,
      reconciledVolume: 2450000,
      unreconciledVolume: 0,
      reconciledCount: 1420,
      currency: "INR",
      rate: 100,
    },
    {
      id: "hub_usd",
      code: "USD",
      country: "United States",
      region: "North America Hub",
      x: 24,
      y: 38,
      reconciledVolume: 156400,
      unreconciledVolume: 28490,
      reconciledCount: 680,
      currency: "USD",
      rate: 84.6,
    },
    {
      id: "hub_eur",
      code: "EUR",
      country: "European Union",
      region: "SEPA Clearing Hub",
      x: 52,
      y: 34,
      reconciledVolume: 84200,
      unreconciledVolume: 0,
      reconciledCount: 310,
      currency: "EUR",
      rate: 100,
    },
    {
      id: "hub_gbp",
      code: "GBP",
      country: "United Kingdom",
      region: "CHAPS & Faster Payments",
      x: 48,
      y: 30,
      reconciledVolume: 52100,
      unreconciledVolume: 1200,
      reconciledCount: 190,
      currency: "GBP",
      rate: 97.7,
    },
    {
      id: "hub_sgd",
      code: "SGD",
      country: "Singapore",
      region: "APAC Treasury Hub",
      x: 76,
      y: 60,
      reconciledVolume: 38900,
      unreconciledVolume: 0,
      reconciledCount: 145,
      currency: "SGD",
      rate: 100,
    },
    {
      id: "hub_aed",
      code: "AED",
      country: "UAE",
      region: "Middle East Corridor",
      x: 60,
      y: 46,
      reconciledVolume: 67500,
      unreconciledVolume: 0,
      reconciledCount: 220,
      currency: "AED",
      rate: 100,
    },
  ];

  // Flow vectors connecting hubs to India/Primary Hub
  const primaryHub = nodes.find((n) => n.code === "INR") || nodes[0];

  return (
    <div className="w-full select-none space-y-2">
      <div className="flex items-center justify-between pb-2 text-xs border-b border-border/40 mb-1">
        <span className="font-semibold text-foreground">Global Cross-Border Settlement Corridors</span>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <span>Active Hubs: <strong className="text-foreground">{nodes.length}</strong></span>
          <span>Primary Settlement Rail: <strong className="text-foreground">INR Nodal</strong></span>
        </div>
      </div>

      <div
        className="w-full relative rounded-lg border border-border bg-card/60 overflow-hidden flex items-center justify-center"
        style={{ height }}
      >
        <svg viewBox="0 0 1000 500" className="w-full h-full">
          {/* Subtle World Map Outline Grid */}
          <g className="grid-lines" opacity={0.15}>
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
              <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={500} stroke="var(--muted-foreground)" strokeDasharray="3 6" />
            ))}
            {[100, 200, 300, 400].map((y) => (
              <line key={`y-${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="var(--muted-foreground)" strokeDasharray="3 6" />
            ))}
          </g>

          {/* Continents abstracted silhouettes */}
          <g opacity={0.12} fill="var(--muted-foreground)">
            {/* North America */}
            <path d="M 120 120 Q 220 90 280 180 Q 240 280 190 260 Q 110 200 120 120 Z" />
            {/* South America */}
            <path d="M 260 290 Q 320 330 300 440 Q 230 420 250 320 Z" />
            {/* Europe */}
            <path d="M 460 120 Q 560 110 540 200 Q 480 220 460 150 Z" />
            {/* Africa */}
            <path d="M 470 230 Q 580 240 540 390 Q 460 360 470 240 Z" />
            {/* Asia */}
            <path d="M 580 100 Q 820 110 820 260 Q 690 320 600 240 Z" />
            {/* Australia */}
            <path d="M 780 340 Q 880 340 850 430 Q 770 420 780 340 Z" />
          </g>

          {/* Flow Vectors connecting each hub to Primary Hub */}
          {nodes.map((node) => {
            if (node.code === primaryHub.code) return null;
            const x1 = (node.x / 100) * 1000;
            const y1 = (node.y / 100) * 500;
            const x2 = (primaryHub.x / 100) * 1000;
            const y2 = (primaryHub.y / 100) * 500;

            const cx = (x1 + x2) / 2;
            const cy = Math.min(y1, y2) - 40;

            const isHovered = hoveredNode?.code === node.code;

            return (
              <g key={`vector-${node.code}`}>
                <path
                  d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                  fill="none"
                  stroke={isHovered ? "var(--chart-1)" : "var(--chart-2)"}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray={isHovered ? "none" : "4 4"}
                  opacity={isHovered ? 0.9 : 0.4}
                  className="transition-all"
                />
              </g>
            );
          })}

          {/* Currency Hub Nodes */}
          {nodes.map((node) => {
            const x = (node.x / 100) * 1000;
            const y = (node.y / 100) * 500;
            const isPrimary = node.code === primaryHub.code;
            const isHovered = hoveredNode?.code === node.code;

            return (
              <g
                key={node.code}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelectCorridor?.(node.code)}
              >
                {/* Pulse Ring */}
                {isPrimary && (
                  <circle
                    cx={x}
                    cy={y}
                    r={18}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    opacity={0.5}
                    className="animate-ping"
                  />
                )}

                {/* Node Outer Ring */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPrimary ? 12 : isHovered ? 10 : 8}
                  fill="var(--card)"
                  stroke={isPrimary ? "var(--chart-1)" : "var(--chart-2)"}
                  strokeWidth={2}
                  className="transition-all"
                />

                {/* Center dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isPrimary ? 6 : isHovered ? 5 : 4}
                  fill={isPrimary ? "var(--chart-1)" : "var(--chart-2)"}
                />

                {/* Code Tag */}
                <text
                  x={x}
                  y={y - 15}
                  textAnchor="middle"
                  fill="var(--foreground)"
                  fontSize={12}
                  fontWeight={600}
                  fontFamily="monospace"
                >
                  {node.code}
                </text>
                <text
                  x={x}
                  y={y + 20}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize={10}
                  fontFamily="sans-serif"
                >
                  {node.country}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredNode && (
          <div className="absolute top-3 left-3 bg-card/95 backdrop-blur-md border border-border p-3 rounded-md shadow-md text-xs space-y-1 z-10 pointer-events-none min-w-[200px]">
            <div className="font-semibold text-foreground flex justify-between items-center border-b border-border/40 pb-1">
              <span>{hoveredNode.country} ({hoveredNode.code})</span>
              <span className="font-mono text-[10px] text-chart-2 font-bold">{hoveredNode.rate}% Match</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{hoveredNode.region}</div>
            <div className="flex justify-between items-center text-[11px] pt-1">
              <span className="text-muted-foreground">Reconciled:</span>
              <span className="font-mono font-bold text-foreground">
                {formatCurrency(hoveredNode.reconciledVolume, hoveredNode.currency)}
              </span>
            </div>
            {hoveredNode.unreconciledVolume > 0 && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-destructive">Unreconciled:</span>
                <span className="font-mono text-destructive">
                  {formatCurrency(hoveredNode.unreconciledVolume, hoveredNode.currency)}
                </span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/40">
              {formatNumber(hoveredNode.reconciledCount)} Transactions
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
