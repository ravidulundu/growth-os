import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { AnalyticsSnapshot } from "../../../lib/api";
import type { StudioController } from "../use-studio-controller";
import { CompetitorInsights } from "./competitor-insights";

type AnalyticsViewProps = {
  controller: StudioController;
};

type SnapshotListMetrics = {
  maxImpressions: number;
  maxEngagement: number;
};

function byCapturedAtAsc(left: AnalyticsSnapshot, right: AnalyticsSnapshot) {
  return new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime();
}

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

function metricBarWidth(value: number, max: number) {
  if (max <= 0) {
    return "0%";
  }
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

function engagementTotal(snapshot: AnalyticsSnapshot) {
  return snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.quotes;
}

function deriveSnapshotMetrics(snapshots: AnalyticsSnapshot[]): SnapshotListMetrics {
  return snapshots.reduce<SnapshotListMetrics>(
    (result, snapshot) => ({
      maxImpressions: Math.max(result.maxImpressions, snapshot.impressions),
      maxEngagement: Math.max(result.maxEngagement, engagementTotal(snapshot))
    }),
    { maxImpressions: 0, maxEngagement: 0 }
  );
}

function AnalyticsActions({ controller }: { controller: StudioController }) {
  const disabled =
    !controller.workspaceId || !controller.contentId || controller.activeAction !== null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Button onClick={() => void controller.handleLoadAnalytics()} disabled={disabled}>
        {controller.activeAction === "Load Analytics" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Load Analytics
      </Button>
      <Button
        variant="secondary"
        onClick={() => void controller.handleLoadFirstHourAlert()}
        disabled={disabled}
      >
        {controller.activeAction === "Load First-Hour Alert" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Load First-Hour Alert
      </Button>
    </div>
  );
}

function FirstHourAlertCard({ controller }: { controller: StudioController }) {
  if (!controller.firstHourAlert) {
    return null;
  }

  return (
    <article className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
        First-Hour Alert
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">
        {controller.firstHourAlert.level.toUpperCase()}
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Engagement rate: {(controller.firstHourAlert.engagementRate * 100).toFixed(2)}%
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Impressions: {controller.firstHourAlert.impressions}
      </p>
      {controller.firstHourAlert.reasons.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Reasons: {controller.firstHourAlert.reasons.join(", ")}
        </p>
      ) : null}
    </article>
  );
}

function SnapshotSummaryCards({ snapshots }: { snapshots: AnalyticsSnapshot[] }) {
  const firstHour = snapshots.find((row) => row.window_key === "t60") ?? snapshots[0] ?? null;
  const latest = snapshots[snapshots.length - 1] ?? null;

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
          First-hour snapshot
        </p>
        <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {firstHour?.impressions ?? 0}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">Impressions (t60 baseline)</p>
      </article>

      <article className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
          Latest engagement
        </p>
        <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {latest ? engagementTotal(latest) : 0}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">Likes + Replies + Reposts + Quotes</p>
      </article>
    </div>
  );
}

type SnapshotMetricBarsProps = {
  snapshot: AnalyticsSnapshot;
  metrics: SnapshotListMetrics;
};

function SnapshotMetricBars({ snapshot, metrics }: SnapshotMetricBarsProps) {
  const engagement = engagementTotal(snapshot);

  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Impressions</span>
          <span>{snapshot.impressions}</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--secondary)]">
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: metricBarWidth(snapshot.impressions, metrics.maxImpressions) }}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Engagement</span>
          <span>{engagement}</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--secondary)]">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: metricBarWidth(engagement, metrics.maxEngagement) }}
          />
        </div>
      </div>
    </div>
  );
}

type SnapshotListProps = {
  snapshots: AnalyticsSnapshot[];
  metrics: SnapshotListMetrics;
};

function SnapshotList({ snapshots, metrics }: SnapshotListProps) {
  return (
    <div className="grid gap-3">
      {snapshots.map((snapshot) => (
        <article
          key={`${snapshot.window_key}-${snapshot.captured_at}`}
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
              {shortLabel(snapshot.window_key)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {new Date(snapshot.captured_at).toLocaleString()}
            </p>
          </div>

          <SnapshotMetricBars snapshot={snapshot} metrics={metrics} />

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-4">
            <span>Likes: {snapshot.likes}</span>
            <span>Replies: {snapshot.replies}</span>
            <span>Reposts: {snapshot.reposts}</span>
            <span>Quotes: {snapshot.quotes}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SnapshotContent({ snapshots }: { snapshots: AnalyticsSnapshot[] }) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No analytics snapshots loaded.</p>;
  }

  const metrics = deriveSnapshotMetrics(snapshots);
  return (
    <>
      <SnapshotSummaryCards snapshots={snapshots} />
      <SnapshotList snapshots={snapshots} metrics={metrics} />
    </>
  );
}

export function AnalyticsView({ controller }: AnalyticsViewProps) {
  const snapshots = [...(controller.analytics?.snapshots ?? [])].sort(byCapturedAtAsc);
  const [competitorHandle, setCompetitorHandle] = useState("");

  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>First-hour momentum and trend view.</CardDescription>
      </CardHeader>
      <CardContent>
        <AnalyticsActions controller={controller} />
        <FirstHourAlertCard controller={controller} />
        <SnapshotContent snapshots={snapshots} />
        <CompetitorInsights
          controller={controller}
          handleInput={competitorHandle}
          onHandleInput={setCompetitorHandle}
        />
      </CardContent>
    </Card>
  );
}
