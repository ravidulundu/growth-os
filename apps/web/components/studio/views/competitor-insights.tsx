import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { StudioController } from "../use-studio-controller";

type CompetitorInsightsProps = {
  controller: StudioController;
  handleInput: string;
  onHandleInput: (value: string) => void;
};

function summaryPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function CompetitorSummaryCards({ controller }: { controller: StudioController }) {
  const overview = controller.competitorOverview;
  if (!overview) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No competitor overview loaded yet. Add a handle to ingest read-only insights.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Accounts
        </p>
        <p className="mt-1 text-xl font-semibold">{overview.summary.competitorCount}</p>
      </article>
      <article className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Posts</p>
        <p className="mt-1 text-xl font-semibold">{overview.summary.totalPosts}</p>
      </article>
      <article className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Metrics coverage
        </p>
        <p className="mt-1 text-xl font-semibold">
          {summaryPercentage(overview.summary.metricsCoverage)}
        </p>
      </article>
    </div>
  );
}

function TopHooks({ controller }: { controller: StudioController }) {
  const hooks = controller.competitorOverview?.topHookTypes ?? [];
  if (hooks.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Top hook types
      </p>
      <div className="flex flex-wrap gap-2">
        {hooks.map((item) => (
          <span
            key={`${item.type}-${item.count}`}
            className="rounded-full border border-[var(--border)] px-2 py-1 text-xs"
          >
            {item.type}: {item.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function BestPosts({ controller }: { controller: StudioController }) {
  const posts = controller.competitorOverview?.bestPerformingPosts ?? [];
  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Best performing examples
      </p>
      <ul className="space-y-2 text-xs">
        {posts.map((post) => (
          <li key={`${post.competitorHandle}-${post.xPostId}`} className="rounded border p-2">
            <p className="font-medium">@{post.competitorHandle}</p>
            <p className="text-[var(--muted-foreground)]">{post.textBody}</p>
            <p className="mt-1 text-[var(--muted-foreground)]">
              ER {(post.engagementRate * 100).toFixed(2)}% · Impressions {post.impressions} ·{" "}
              {post.hookType}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompetitorInsights({
  controller,
  handleInput,
  onHandleInput
}: CompetitorInsightsProps) {
  const isBusy = controller.activeAction !== null;

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/25 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <p className="mb-1 text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Competitor handle
          </p>
          <Input
            placeholder="@handle"
            value={handleInput}
            onChange={(event) => onHandleInput(event.target.value)}
          />
        </div>
        <Button
          onClick={() => void controller.handleAddCompetitor(handleInput)}
          disabled={!controller.workspaceId || !handleInput.trim() || isBusy}
        >
          {controller.activeAction === "Add Competitor" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Add competitor
        </Button>
        <Button
          variant="outline"
          onClick={() => void controller.handleLoadCompetitorOverview()}
          disabled={!controller.workspaceId || isBusy}
        >
          {controller.activeAction === "Load Competitor Overview" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Refresh overview
        </Button>
      </div>
      {controller.lastCompetitorAdd ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Added @{controller.lastCompetitorAdd.handle} · ingested{" "}
          {controller.lastCompetitorAdd.ingestedCount} posts
        </p>
      ) : null}
      <CompetitorSummaryCards controller={controller} />
      <TopHooks controller={controller} />
      <BestPosts controller={controller} />
    </section>
  );
}
