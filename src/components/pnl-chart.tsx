"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { PositionPnLPoint, TimeSeriesPoint } from "@/lib/queries";

export type ChartMode = "cumulative" | "daily";
export type ChartSource = "all" | "perp" | "spot" | "funding" | "fees";

interface PnLChartProps {
  positionData: PositionPnLPoint[];
  fundingData: TimeSeriesPoint[];
  feesData: TimeSeriesPoint[];
  mode: ChartMode;
  source: ChartSource;
}

interface ChartPoint {
  label: string;
  pnl: number;
  ma?: number | null;
}

const MA_WINDOW = 7;

function bucketByDay(items: { timestamp: number; amount: number }[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const d = new Date(item.timestamp);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + item.amount);
  }
  const sorted = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => {
      const d = new Date(date + "T00:00:00Z");
      return {
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        pnl: Math.round(pnl * 100) / 100,
      };
    });

  // Compute 7-day moving average
  return sorted.map((point, i): ChartPoint => {
    if (i < MA_WINDOW - 1) return { ...point, ma: null };
    const window = sorted.slice(i - MA_WINDOW + 1, i + 1);
    const avg = window.reduce((sum, p) => sum + p.pnl, 0) / MA_WINDOW;
    return { ...point, ma: Math.round(avg * 100) / 100 };
  });
}

function toCumulative(items: { timestamp: number; amount: number }[]): ChartPoint[] {
  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp);
  let cumulative = 0;
  const dayMap = new Map<string, number>();

  for (const item of sorted) {
    cumulative += item.amount;
    const d = new Date(item.timestamp);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayMap.set(key, Math.round(cumulative * 100) / 100);
  }

  return Array.from(dayMap.entries()).map(([label, pnl]) => ({ label, pnl }));
}

export function PnLChart({ positionData, fundingData, feesData, mode, source }: PnLChartProps) {
  const chartData = useMemo((): ChartPoint[] => {
    if (source === "funding") {
      const items = fundingData.map((f) => ({ timestamp: f.timestamp, amount: f.amount }));
      return mode === "cumulative" ? toCumulative(items) : bucketByDay(items);
    }

    if (source === "fees") {
      const items = feesData.map((f) => ({ timestamp: f.timestamp, amount: -f.amount }));
      return mode === "cumulative" ? toCumulative(items) : bucketByDay(items);
    }

    const filtered = source === "all"
      ? positionData
      : positionData.filter((p) => p.market_type === source);

    const items = filtered
      .filter((p) => p.realized_pnl !== 0)
      .map((p) => ({ timestamp: p.end_time, amount: p.realized_pnl }));

    return mode === "cumulative" ? toCumulative(items) : bucketByDay(items);
  }, [positionData, fundingData, feesData, mode, source]);

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Not enough data for chart
      </div>
    );
  }

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: "var(--popover)",
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    color: "var(--popover-foreground)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
  };

  const sourceLabel = {
    all: "PnL",
    perp: "Perp PnL",
    spot: "Spot PnL",
    funding: "Funding",
    fees: "Fee Savings",
  }[source];

  const formatDollar = (v: number) =>
    `$${v >= 0 ? "" : "-"}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const formatTooltipValue = (value: unknown, name: unknown) => {
    const v = Number(value);
    const label = name === "ma" ? `${MA_WINDOW}d avg` :
      mode === "cumulative" ? `Cumulative ${sourceLabel}` : `Daily ${sourceLabel}`;
    return [
      `$${v >= 0 ? "+" : ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      label,
    ];
  };

  if (mode === "cumulative") {
    const max = Math.max(...chartData.map((d) => d.pnl));
    const min = Math.min(...chartData.map((d) => d.pnl));
    const allPositive = min >= 0;
    const allNegative = max <= 0;
    const gradientOffset = allPositive ? 1 : allNegative ? 0 : max / (max - min);

    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={0.05} />
              <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#22c55e" stopOpacity={1} />
              <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={1} />
              <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={1} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatDollar} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--popover-foreground)" }} wrapperStyle={{ zIndex: 10 }} formatter={formatTooltipValue} labelFormatter={(l) => String(l)} />
          <ReferenceLine y={0} className="stroke-border" strokeDasharray="3 3" />
          <Area type="monotone" dataKey="pnl" stroke="url(#splitStroke)" fill="url(#splitColor)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Daily bar chart with 7-day moving average line
  const hasMA = chartData.some((d) => d.ma !== null && d.ma !== undefined);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={formatDollar} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={{ color: "var(--popover-foreground)" }}
          wrapperStyle={{ zIndex: 10 }}
          formatter={formatTooltipValue}
          labelFormatter={(l) => String(l)}
        />
        <ReferenceLine y={0} className="stroke-border" />
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />
          ))}
        </Bar>
        {hasMA && (
          <Line
            type="monotone"
            dataKey="ma"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
