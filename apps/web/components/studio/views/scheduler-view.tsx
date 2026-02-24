import { Loader2 } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";
import type { JobRow } from "../../../lib/api";

type SchedulerViewProps = {
  controller: StudioController;
};

function SchedulerActions({ controller }: SchedulerViewProps) {
  const isBusy = controller.activeAction !== null;
  const canPublishNow =
    Boolean(controller.workspaceId) &&
    Boolean(controller.selectedAccountId) &&
    Boolean(controller.contentId) &&
    !isBusy;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Button onClick={() => void controller.handlePublishNow()} disabled={!canPublishNow}>
        {controller.activeAction === "Publish Now" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        Publish Now
      </Button>
      <Button
        variant="outline"
        onClick={() => void controller.handleLoadJobs()}
        disabled={!controller.workspaceId || isBusy}
      >
        Refresh Jobs
      </Button>
      <Button
        variant="outline"
        onClick={() => void controller.handleLoadSeries()}
        disabled={!controller.workspaceId || !controller.selectedAccountId || isBusy}
      >
        Refresh Series
      </Button>
    </div>
  );
}

function EvergreenSummary({ controller }: SchedulerViewProps) {
  const activeSeries = controller.seriesList.filter(
    (series) => series.isActive && series.enqueueNextOnPublish
  );

  return (
    <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          Evergreen active
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">
          {activeSeries.length} active evergreen series
        </span>
      </div>
      {activeSeries.length > 0 ? (
        <ul className="grid gap-2 text-xs text-[var(--foreground)]">
          {activeSeries.map((series) => (
            <li
              key={series.id}
              className="rounded border border-[var(--border)] bg-[var(--background)] p-2"
            >
              <p className="font-medium">{series.name}</p>
              <p className="text-[var(--muted-foreground)]">
                Next content:{" "}
                {series.nextItem
                  ? `${series.nextItem.position}. ${series.nextItem.contentTopic ?? series.nextItem.contentId}`
                  : "none"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          No active evergreen queue loaded for this workspace/account.
        </p>
      )}
    </div>
  );
}

function ManualActionCell({ controller, job }: { controller: StudioController; job: JobRow }) {
  if (!job.requires_manual_action) {
    return <span className="text-[var(--muted-foreground)]">—</span>;
  }

  const manualText = job.content_text ?? "";
  const canCopy = manualText.trim().length > 0;
  const canCompose = Boolean(job.manual_action_compose_url);

  const copyManualText = async () => {
    const fallback = await controller.resolveManualFallback(job);
    const trimmedText = fallback.plainText.trim();
    if (!trimmedText) {
      throw new Error("Manual content text is unavailable.");
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      throw new Error("Clipboard API is unavailable in this environment.");
    }
    await navigator.clipboard.writeText(trimmedText);
  };

  const handleCompose = async () => {
    const fallback = await controller.resolveManualFallback(job);
    if (!fallback.composeUrl) {
      throw new Error("Compose link is unavailable.");
    }
    if (typeof window === "undefined") {
      throw new Error("Unable to open compose window.");
    }
    window.open(fallback.composeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Manual action required</Badge>
        {job.last_error_code ? (
          <span className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-[0.2em]">
            {job.last_error_code}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void controller.runAction("Copy manual text", copyManualText)}
          disabled={!canCopy}
        >
          Copy text
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void controller.runAction("Open manual compose", handleCompose)}
          disabled={!canCompose}
        >
          Open compose
        </Button>
      </div>
    </div>
  );
}

function JobsTable({ controller }: SchedulerViewProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Attempts</th>
            <th className="px-3 py-2">Run At</th>
            <th className="px-3 py-2">Last Error</th>
            <th className="px-3 py-2">Manual action</th>
          </tr>
        </thead>
        <tbody>
          {controller.jobs.length > 0 ? (
            controller.jobs.map((job) => (
              <tr key={job.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-[var(--foreground)]">{job.state}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">
                  {job.content_title ?? job.content_id}
                </td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{job.attempt_count}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{job.run_at}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">
                  {job.last_error_code ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <ManualActionCell controller={controller} job={job} />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-4 text-[var(--muted-foreground)]" colSpan={6}>
                No jobs loaded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SchedulerView({ controller }: SchedulerViewProps) {
  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Scheduler and Publish</CardTitle>
        <CardDescription>Trigger publish and inspect queue health.</CardDescription>
      </CardHeader>
      <CardContent>
        <SchedulerActions controller={controller} />
        <EvergreenSummary controller={controller} />
        <JobsTable controller={controller} />
      </CardContent>
    </Card>
  );
}
