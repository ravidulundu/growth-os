import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";

type AnalyticsViewProps = {
  controller: StudioController;
};

export function AnalyticsView({ controller }: AnalyticsViewProps) {
  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>Read first-hour snapshot metrics.</CardDescription>
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {controller.analytics?.snapshots.length ? (
            controller.analytics.snapshots.map((snapshot) => (
              <article
                key={`${snapshot.window_key}-${snapshot.captured_at}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                  {snapshot.window_key}
                </p>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  Impressions: {snapshot.impressions}
                </p>
                <p className="text-sm text-[var(--foreground)]">Likes: {snapshot.likes}</p>
                <p className="text-sm text-[var(--foreground)]">Replies: {snapshot.replies}</p>
                <p className="text-sm text-[var(--foreground)]">Reposts: {snapshot.reposts}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No analytics snapshots loaded.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
