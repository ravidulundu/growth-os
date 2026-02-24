"use client";

import type { ReactNode } from "react";
import type { AnalyticsSnapshot } from "../../../lib/api";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type EngagementOverTimeChartProps = {
  snapshots: AnalyticsSnapshot[];
};

type EngagementBreakdownChartProps = {
  snapshot: AnalyticsSnapshot | null;
};

type MetricComparisonBarProps = {
  snapshot: AnalyticsSnapshot;
  maxValue: number;
};

const chartColors = {
  impressions: "#2563eb",
  likes: "#16a34a",
  replies: "#f97316",
  reposts: "#a855f7",
  quotes: "#f59e0b",
  engagement: "#0f766e"
} as const;

const axisTick = {
  fill: "var(--muted-foreground)",
  fontSize: 12
} as const;

const windowOrder: Record<string, number> = {
  t15: 15,
  t60: 60,
  t24: 1440
};

function shortLabel(windowKey: string) {
  if (windowKey === "t15") {
    return "15m";
  }
  if (windowKey === "t60") {
    return "60m";
  }
  if (windowKey === "t24") {
    return "24h";
  }
  return windowKey;
}

function compareWindow(left: AnalyticsSnapshot, right: AnalyticsSnapshot) {
  const leftOrder = windowOrder[left.window_key] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = windowOrder[right.window_key] ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime();
}

function engagementValue(snapshot: AnalyticsSnapshot) {
  return snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.quotes;
}

function chartCard(title: string, description: string, content: ReactNode) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
        {title}
      </p>
      <p className="mb-3 mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
      {content}
    </article>
  );
}

export function EngagementOverTimeChart({ snapshots }: EngagementOverTimeChartProps) {
  if (snapshots.length === 0) {
    return chartCard(
      "Engagement over time",
      "No snapshots loaded yet.",
      <div className="h-72 rounded-lg bg-[var(--secondary)]/40" />
    );
  }

  const data = [...snapshots].sort(compareWindow).map((snapshot) => ({
    label: shortLabel(snapshot.window_key),
    impressions: snapshot.impressions,
    likes: snapshot.likes,
    replies: snapshot.replies,
    reposts: snapshot.reposts,
    quotes: snapshot.quotes
  }));

  return chartCard(
    "Engagement over time",
    "Window trend for impressions and interactions.",
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="impressions-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.impressions} stopOpacity={0.35} />
              <stop offset="95%" stopColor={chartColors.impressions} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={axisTick} />
          <YAxis tick={axisTick} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="impressions"
            stroke={chartColors.impressions}
            fillOpacity={1}
            fill="url(#impressions-fill)"
          />
          <Bar dataKey="likes" fill={chartColors.likes} barSize={10} />
          <Bar dataKey="replies" fill={chartColors.replies} barSize={10} />
          <Bar dataKey="reposts" fill={chartColors.reposts} barSize={10} />
          <Bar dataKey="quotes" fill={chartColors.quotes} barSize={10} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EngagementBreakdownChart({ snapshot }: EngagementBreakdownChartProps) {
  if (!snapshot) {
    return chartCard(
      "Latest engagement mix",
      "Load analytics to see interaction distribution.",
      <div className="h-72 rounded-lg bg-[var(--secondary)]/40" />
    );
  }

  const data = [
    { name: "Likes", value: snapshot.likes, color: chartColors.likes },
    { name: "Replies", value: snapshot.replies, color: chartColors.replies },
    { name: "Reposts", value: snapshot.reposts, color: chartColors.reposts },
    { name: "Quotes", value: snapshot.quotes, color: chartColors.quotes }
  ].filter((item) => item.value > 0);

  if (data.length === 0) {
    return chartCard(
      "Latest engagement mix",
      "Latest snapshot has no engagement yet.",
      <div className="h-72 rounded-lg bg-[var(--secondary)]/40" />
    );
  }

  return chartCard(
    "Latest engagement mix",
    "Share of likes, replies, reposts and quotes.",
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            label
          >
            {data.map((item) => (
              <Cell key={item.name} fill={item.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricComparisonBar({ snapshot, maxValue }: MetricComparisonBarProps) {
  const data = [
    { label: "Impressions", value: snapshot.impressions, color: chartColors.impressions },
    { label: "Engagement", value: engagementValue(snapshot), color: chartColors.engagement }
  ];
  const domainMax = Math.max(1, maxValue);

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis type="category" dataKey="label" width={96} tick={axisTick} />
          <Tooltip />
          <Bar dataKey="value" radius={[999, 999, 999, 999]}>
            {data.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
