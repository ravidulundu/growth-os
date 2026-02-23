import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";

type SchedulerViewProps = {
  controller: StudioController;
};

export function SchedulerView({ controller }: SchedulerViewProps) {
  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Scheduler and Publish</CardTitle>
        <CardDescription>Trigger publish and inspect queue health.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void controller.handlePublishNow()}
            disabled={
              !controller.workspaceId ||
              !controller.selectedAccountId ||
              !controller.contentId ||
              controller.activeAction !== null
            }
          >
            {controller.activeAction === "Publish Now" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Publish Now
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handleLoadJobs()}
            disabled={!controller.workspaceId || controller.activeAction !== null}
          >
            Refresh Jobs
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Run At</th>
                <th className="px-3 py-2">Last Error</th>
              </tr>
            </thead>
            <tbody>
              {controller.jobs.length > 0 ? (
                controller.jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-[var(--foreground)]">{job.state}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">
                      {job.attempt_count}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{job.run_at}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">
                      {job.last_error_code ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-[var(--muted-foreground)]" colSpan={4}>
                    No jobs loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
