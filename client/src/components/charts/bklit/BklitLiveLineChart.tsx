import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Play, Pause, RefreshCw } from "lucide-react";

export interface LiveTelemetryTick {
  time: string;
  throughput: number; // records per sec
  latencyMs: number; // execution latency
}

interface BklitLiveLineChartProps {
  height?: number;
  maxPoints?: number;
  initialThroughput?: number;
}

export const BklitLiveLineChart: React.FC<BklitLiveLineChartProps> = ({
  height = 240,
  maxPoints = 20,
  initialThroughput = 450,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [data, setData] = useState<LiveTelemetryTick[]>(() => {
    const initial: LiveTelemetryTick[] = [];
    const now = Date.now();
    for (let i = maxPoints; i >= 0; i--) {
      const t = new Date(now - i * 1000);
      initial.push({
        time: t.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" }),
        throughput: Math.round(initialThroughput + (Math.random() * 80 - 40)),
        latencyMs: Number((1.2 + Math.random() * 0.8).toFixed(2)),
      });
    }
    return initial;
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setData((prev) => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
        const last = prev[prev.length - 1] || { throughput: initialThroughput, latencyMs: 1.5 };
        const newThroughput = Math.max(200, Math.min(800, Math.round(last.throughput + (Math.random() * 90 - 45))));
        const newLatency = Math.max(0.5, Math.min(4.0, Number((last.latencyMs + (Math.random() * 0.4 - 0.2)).toFixed(2))));

        const updated = [...prev.slice(1), { time: timeStr, throughput: newThroughput, latencyMs: newLatency }];
        return updated;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, initialThroughput]);

  const currentThroughput = data[data.length - 1]?.throughput ?? initialThroughput;
  const currentLatency = data[data.length - 1]?.latencyMs ?? 1.5;

  return (
    <div className="w-full select-none space-y-2">
      {/* Header controls */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            <span>Real-Time Cascade Throughput</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {currentThroughput} tx/s · {currentLatency}ms
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 mr-1" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 mr-1 fill-current" />
                <span>Stream</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="time"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[200, 800]}
              tickFormatter={(v) => `${v}/s`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[0, 5]}
              tickFormatter={(v) => `${v}ms`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as LiveTelemetryTick;
                  return (
                    <div className="rounded border border-border bg-card p-2 shadow-sm text-xs space-y-1">
                      <div className="font-semibold text-foreground border-b border-border/40 pb-0.5">
                        {label} Telemetry
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="text-muted-foreground">Throughput:</span>
                        <span className="font-mono font-bold text-chart-1">{d.throughput} recs/s</span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-[11px]">
                        <span className="text-muted-foreground">Match Latency:</span>
                        <span className="font-mono font-bold text-chart-2">{d.latencyMs} ms</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="throughput"
              name="Throughput"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="latencyMs"
              name="Latency (ms)"
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
