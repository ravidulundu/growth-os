import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { AnalyticsSnapshot } from "../../../lib/api";
import type { StudioController } from "../use-studio-controller";

type AnalyticsViewProps = {
  controller: StudioController;
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

export function AnalyticsView({ controller }: AnalyticsViewProps) {
  const snapshots = [...(controller.analytics?.snapshots ?? [])].sort(byCapturedAtAsc);
  const maxImpressions = snapshots.reduce((max, row) => Math.max(max, row.impressions), 0);
  const maxEngagement = snapshots.reduce(
    (max, row) => Math.max(max, row.likes + row.replies + row.reposts + row.quotes),
    0
  );

  const firstHour = snapshots.find((row) => row.window_key === "t60") ?? snapshots[0] ?? null;
  const latest = snapshots[snapshots.length - 1] ?? null;

  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>First-hour momentum and trend view.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void controller.handleLoadAnalytics()}
            disabled={
              !controller.workspaceId || !controller.contentId || controller.activeAction !== null
            }
          >
            {controller.activeAction === "Load Analytics" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Load Analytics
          </Button>
        </div>

        {snapshots.length > 0 ? (
          <>
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
                  {latest ? latest.likes + latest.replies + latest.reposts + latest.quotes : 0}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Likes + Replies + Reposts + Quotes
                </p>
              </article>
            </div>

            <div className="grid gap-3">
              {snapshots.map((snapshot) => {
                const engagement =
                  snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.quotes;

                return (
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

                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                          <span>Impressions</span>
                          <span>{snapshot.impressions}</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--secondary)]">
                          <div
                            className="h-full rounded-full bg-[var(--primary)]"
                            style={{ width: metricBarWidth(snapshot.impressions, maxImpressions) }}
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
                            style={{ width: metricBarWidth(engagement, maxEngagement) }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-4">
                      <span>Likes: {snapshot.likes}</span>
                      <span>Replies: {snapshot.replies}</span>
                      <span>Reposts: {snapshot.reposts}</span>
                      <span>Quotes: {snapshot.quotes}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No analytics snapshots loaded.</p>
        )}
      </CardContent>
    </Card>
  );
}
