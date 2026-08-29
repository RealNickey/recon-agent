import React, { useState, useMemo } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { Outcome } from "@/types";

export interface SankeyNode {
  id: string;
  label: string;
  layer: number;
  value: number;
  color: string;
  category?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color?: string;
}

interface BklitSankeyChartProps {
  outcomes?: Outcome[];
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  currency?: string;
}

export const BklitSankeyChart: React.FC<BklitSankeyChartProps> = ({
  outcomes = [],
  height = 360,
  onNodeClick,
  currency = "INR",
}) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<SankeyLink | null>(null);

  // Compute multi-stage node and link flows from outcomes
  const { nodes, links, maxLayer } = useMemo(() => {
    const total = Math.max(outcomes.length, 1);
    const t1 = outcomes.filter((o) => o.status === "matched" && o.tier === 1).length;
    const t2 = outcomes.filter((o) => o.status === "matched" && o.tier === 2).length;
    const t3 = outcomes.filter((o) => o.status === "matched" && o.tier === 3).length;
    const exceptions = outcomes.filter((o) => o.status === "exception").length;

    // Approximated source counts based on outcomes
    const ledgerTotal = Math.round(total * 0.48);
    const processorTotal = Math.round(total * 0.32);
    const bankTotal = total - ledgerTotal - processorTotal;

    // Link flow calculations
    const l1_t1 = Math.round(t1 * 0.52);
    const p1_t1 = Math.round(t1 * 0.3);
    const b1_t1 = t1 - l1_t1 - p1_t1;

    const l1_t2 = Math.round(t2 * 0.45);
    const p1_t2 = Math.round(t2 * 0.35);
    const b1_t2 = t2 - l1_t2 - p1_t2;

    const l1_t3 = Math.round(t3 * 0.5);
    const p1_t3 = Math.round(t3 * 0.3);
    const b1_t3 = t3 - l1_t3 - p1_t3;

    const l1_exp = Math.round(exceptions * 0.4);
    const p1_exp = Math.round(exceptions * 0.3);
    const b1_exp = exceptions - l1_exp - p1_exp;

    const matchedTotal = t1 + t2 + t3;
    const feeDrift = Math.round(matchedTotal * 0.12);
    const settledReconciled = matchedTotal - feeDrift;
    const suspense = Math.round(exceptions * 0.7);
    const quarantine = exceptions - suspense;

    const calculatedNodes: SankeyNode[] = [
      // Layer 0: Data Sources
      { id: "src_ledger", label: "Internal Ledger", layer: 0, value: ledgerTotal, color: "var(--chart-1)", category: "Source" },
      { id: "src_proc", label: "Payment Gateways", layer: 0, value: processorTotal, color: "var(--chart-2)", category: "Source" },
      { id: "src_bank", label: "Bank Statements", layer: 0, value: bankTotal, color: "var(--chart-3)", category: "Source" },

      // Layer 1: Cascade Tiers
      { id: "tier_1", label: "T1: Hash-Join", layer: 1, value: t1, color: "var(--chart-1)", category: "Cascade Engine" },
      { id: "tier_2", label: "T2: Fuzzy Logic", layer: 1, value: t2, color: "var(--chart-2)", category: "Cascade Engine" },
      { id: "tier_3", label: "T3: Agentic AI", layer: 1, value: t3, color: "var(--chart-4)", category: "Cascade Engine" },
      { id: "tier_exp", label: "Residual Exceptions", layer: 1, value: exceptions, color: "var(--destructive)", category: "Cascade Engine" },

      // Layer 2: Settlement Outcomes
      { id: "out_settled", label: "Matched Settlements", layer: 2, value: settledReconciled, color: "var(--chart-2)", category: "Outcome" },
      { id: "out_fees", label: "MDR Deductions", layer: 2, value: feeDrift, color: "var(--chart-4)", category: "Outcome" },
      { id: "out_suspense", label: "Suspense Clearing", layer: 2, value: suspense, color: "var(--destructive)", category: "Outcome" },
      { id: "out_quar", label: "Quarantined / Unresolved", layer: 2, value: quarantine, color: "var(--muted-foreground)", category: "Outcome" },
    ];

    const calculatedLinks: SankeyLink[] = [
      // Layer 0 -> Layer 1
      { source: "src_ledger", target: "tier_1", value: l1_t1, color: "var(--chart-1)" },
      { source: "src_proc", target: "tier_1", value: p1_t1, color: "var(--chart-1)" },
      { source: "src_bank", target: "tier_1", value: b1_t1, color: "var(--chart-1)" },

      { source: "src_ledger", target: "tier_2", value: l1_t2, color: "var(--chart-2)" },
      { source: "src_proc", target: "tier_2", value: p1_t2, color: "var(--chart-2)" },
      { source: "src_bank", target: "tier_2", value: b1_t2, color: "var(--chart-2)" },

      { source: "src_ledger", target: "tier_3", value: l1_t3, color: "var(--chart-4)" },
      { source: "src_proc", target: "tier_3", value: p1_t3, color: "var(--chart-4)" },
      { source: "src_bank", target: "tier_3", value: b1_t3, color: "var(--chart-4)" },

      { source: "src_ledger", target: "tier_exp", value: l1_exp, color: "var(--destructive)" },
      { source: "src_proc", target: "tier_exp", value: p1_exp, color: "var(--destructive)" },
      { source: "src_bank", target: "tier_exp", value: b1_exp, color: "var(--destructive)" },

      // Layer 1 -> Layer 2
      { source: "tier_1", target: "out_settled", value: Math.round(t1 * 0.9), color: "var(--chart-1)" },
      { source: "tier_1", target: "out_fees", value: t1 - Math.round(t1 * 0.9), color: "var(--chart-4)" },

      { source: "tier_2", target: "out_settled", value: Math.round(t2 * 0.85), color: "var(--chart-2)" },
      { source: "tier_2", target: "out_fees", value: t2 - Math.round(t2 * 0.85), color: "var(--chart-4)" },

      { source: "tier_3", target: "out_settled", value: Math.round(t3 * 0.8), color: "var(--chart-4)" },
      { source: "tier_3", target: "out_fees", value: t3 - Math.round(t3 * 0.8), color: "var(--chart-4)" },

      { source: "tier_exp", target: "out_suspense", value: suspense, color: "var(--destructive)" },
      { source: "tier_exp", target: "out_quar", value: quarantine, color: "var(--muted-foreground)" },
    ].filter((l) => l.value > 0);

    return { nodes: calculatedNodes, links: calculatedLinks, maxLayer: 2 };
  }, [outcomes]);

  // Layout calculations
  const width = 960;
  const paddingX = 140;
  const paddingTop = 20;
  const paddingBottom = 32;
  const nodeWidth = 16;
  const usableWidth = width - paddingX * 2 - nodeWidth;
  const layerSpacing = usableWidth / maxLayer;

  // Group nodes by layer and calculate Y positions
  const layout = useMemo(() => {
    const layers: SankeyNode[][] = [[], [], []];
    nodes.forEach((n) => {
      if (layers[n.layer]) layers[n.layer].push(n);
    });

    const nodePositions: Record<string, { x: number; y: number; height: number }> = {};
    const usableHeight = height - paddingTop - paddingBottom;

    layers.forEach((layerNodes, layerIndex) => {
      const x = paddingX + layerIndex * layerSpacing;
      const totalLayerVal = layerNodes.reduce((sum, n) => sum + n.value, 0) || 1;
      const gap = 14;
      const totalGaps = (layerNodes.length - 1) * gap;
      const heightForBars = Math.max(usableHeight - totalGaps, 40);

      let currentY = paddingTop;
      layerNodes.forEach((node) => {
        const nodeH = Math.max(Math.round((node.value / totalLayerVal) * heightForBars), 16);
        nodePositions[node.id] = { x, y: currentY, height: nodeH };
        currentY += nodeH + gap;
      });
    });

    // Link offsets
    const sourceOffsets: Record<string, number> = {};
    const targetOffsets: Record<string, number> = {};

    const computedLinks = links.map((link) => {
      const srcPos = nodePositions[link.source];
      const tgtPos = nodePositions[link.target];
      if (!srcPos || !tgtPos) return null;

      const srcNode = nodes.find((n) => n.id === link.source);
      const tgtNode = nodes.find((n) => n.id === link.target);
      const srcTotal = srcNode?.value || 1;
      const tgtTotal = tgtNode?.value || 1;

      const linkHSource = Math.max((link.value / srcTotal) * srcPos.height, 2);
      const linkHTarget = Math.max((link.value / tgtTotal) * tgtPos.height, 2);

      const srcOffset = sourceOffsets[link.source] || 0;
      const tgtOffset = targetOffsets[link.target] || 0;

      sourceOffsets[link.source] = srcOffset + linkHSource;
      targetOffsets[link.target] = tgtOffset + linkHTarget;

      const x0 = srcPos.x + nodeWidth;
      const y0 = srcPos.y + srcOffset;
      const x1 = tgtPos.x;
      const y1 = tgtPos.y + tgtOffset;

      const curvature = 0.5;

      const path = `
        M ${x0} ${y0}
        C ${x0 + (x1 - x0) * curvature} ${y0}, ${x1 - (x1 - x0) * curvature} ${y1}, ${x1} ${y1}
        L ${x1} ${y1 + linkHTarget}
        C ${x1 - (x1 - x0) * curvature} ${y1 + linkHTarget}, ${x0 + (x1 - x0) * curvature} ${y0 + linkHSource}, ${x0} ${y0 + linkHSource}
        Z
      `;

      return {
        ...link,
        path,
        x0,
        y0,
        x1,
        y1,
        linkHSource,
        linkHTarget,
      };
    }).filter(Boolean);

    return { nodePositions, computedLinks };
  }, [nodes, links, height, layerSpacing, maxLayer]);

  const totalVolume = useMemo(() => nodes.filter((n) => n.layer === 0).reduce((s, n) => s + n.value, 0), [nodes]);

  const viewBoxHeight = height + 16;

  return (
    <div className="w-full relative select-none">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-3 text-xs border-b border-border/40 mb-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-foreground font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
            Sources ({nodes.filter((n) => n.layer === 0).length})
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono text-foreground font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
            Tiers ({nodes.filter((n) => n.layer === 1).length})
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono text-foreground font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--chart-4)" }} />
            Outcomes ({nodes.filter((n) => n.layer === 2).length})
          </span>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground">
          Total Reconciled Records: <strong className="text-foreground">{formatNumber(totalVolume)}</strong>
        </div>
      </div>

      {/* SVG Canvas with bottom safety clearance */}
      <div className="w-full overflow-x-auto pb-2">
        <svg
          viewBox={`0 0 ${width} ${viewBoxHeight}`}
          className="w-full h-auto min-w-[700px]"
        >
          {/* Link Ribbons */}
          <g className="links">
            {layout.computedLinks.map((link, idx) => {
              if (!link) return null;
              const isHighlighted =
                hoveredLink === link ||
                hoveredNode === link.source ||
                hoveredNode === link.target;
              const isDimmed =
                (hoveredNode || hoveredLink) && !isHighlighted;

              return (
                <path
                  key={`link-${idx}`}
                  d={link.path}
                  fill={link.color || "var(--chart-1)"}
                  fillOpacity={isHighlighted ? 0.65 : isDimmed ? 0.08 : 0.28}
                  stroke={isHighlighted ? link.color || "var(--chart-1)" : "transparent"}
                  strokeWidth={isHighlighted ? 1 : 0}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredLink(link)}
                  onMouseLeave={() => setHoveredLink(null)}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {nodes.map((node) => {
              const pos = layout.nodePositions[node.id];
              if (!pos) return null;
              const isHovered = hoveredNode === node.id;
              const isDimmed = hoveredNode && !isHovered && !layout.computedLinks.some((l) => (l?.source === node.id && l.target === hoveredNode) || (l?.target === node.id && l.source === hoveredNode));
              const isSource = node.layer === 0;
              const isOutcome = node.layer === maxLayer;

              return (
                <g
                  key={node.id}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => onNodeClick?.(node.id)}
                  opacity={isDimmed ? 0.35 : 1}
                >
                  {/* Node Rect */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={nodeWidth}
                    height={pos.height}
                    rx={3}
                    fill={node.color}
                    className="transition-all"
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />

                  {/* Node Label Text */}
                  <text
                    x={isSource ? pos.x - 10 : isOutcome ? pos.x + nodeWidth + 10 : pos.x + nodeWidth / 2}
                    y={pos.y + pos.height / 2 - 4}
                    textAnchor={isSource ? "end" : isOutcome ? "start" : "middle"}
                    fill="#0f172a"
                    className="dark:fill-slate-100 font-medium"
                    fontSize={11}
                    fontWeight={isHovered ? 600 : 500}
                    dominantBaseline="middle"
                  >
                    {node.label}
                  </text>
                  <text
                    x={isSource ? pos.x - 10 : isOutcome ? pos.x + nodeWidth + 10 : pos.x + nodeWidth / 2}
                    y={pos.y + pos.height / 2 + 10}
                    textAnchor={isSource ? "end" : isOutcome ? "start" : "middle"}
                    fill="#475569"
                    className="dark:fill-slate-400"
                    fontSize={9.5}
                    fontFamily="monospace"
                  >
                    {formatNumber(node.value)} recs ({((node.value / (totalVolume || 1)) * 100).toFixed(0)}%)
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Interactive Tooltip Card for Links */}
      {hoveredLink && (
        <div className="absolute top-2 right-2 bg-card/95 backdrop-blur-md border border-border p-2.5 rounded-md shadow-md text-xs space-y-1 pointer-events-none z-10 min-w-[200px]">
          <div className="font-semibold text-foreground flex items-center justify-between">
            <span>Flow Details</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted">
              {hoveredLink.value} Records
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            From: <strong className="text-foreground">{nodes.find((n) => n.id === hoveredLink.source)?.label}</strong>
          </div>
          <div className="text-[11px] text-muted-foreground">
            To: <strong className="text-foreground">{nodes.find((n) => n.id === hoveredLink.target)?.label}</strong>
          </div>
          <div className="pt-1 text-[10px] font-mono text-muted-foreground border-t border-border/40">
            Share: {((hoveredLink.value / (totalVolume || 1)) * 100).toFixed(1)}% of total volume
          </div>
        </div>
      )}
    </div>
  );
};
