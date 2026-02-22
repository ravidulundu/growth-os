import { CheckCircle2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";

type DashboardViewProps = {
  controller: StudioController;
};

export function DashboardView({ controller }: DashboardViewProps) {
  return (
    <>
      <Card className="motion-rise">
        <CardHeader>
          <CardTitle>Time to First Value</CardTitle>
          <CardDescription>
            Follow this exact path to first publish + first analytics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 text-sm text-[var(--muted-foreground)]">
            <li className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              1. Request and open magic link
              {controller.userId ? (
                <CheckCircle2 className="ml-2 inline h-4 w-4 text-emerald-600" />
              ) : null}
            </li>
            <li className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              2. Connect X account
              {controller.selectedAccountId ? (
                <CheckCircle2 className="ml-2 inline h-4 w-4 text-emerald-600" />
              ) : null}
            </li>
            <li className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              3. Generate content draft
              {controller.contentId ? (
                <CheckCircle2 className="ml-2 inline h-4 w-4 text-emerald-600" />
              ) : null}
            </li>
            <li className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              4. Publish and load analytics
              {controller.analytics?.snapshots.length ? (
                <CheckCircle2 className="ml-2 inline h-4 w-4 text-emerald-600" />
              ) : null}
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fast Actions</CardTitle>
          <CardDescription>Use these actions to move through the flow faster.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={() => void controller.handleStartConnect()}
            disabled={!controller.workspaceId || controller.activeAction !== null}
          >
            Start X Connect
          </Button>
          <Button
            variant="secondary"
            onClick={() => void controller.handleCompleteConnect()}
            disabled={
              !controller.workspaceId ||
              !controller.oauthCode ||
              !controller.connectStartResult?.state ||
              controller.activeAction !== null
            }
          >
            Complete Connect
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handleGenerateDraft()}
            disabled={
              !controller.workspaceId ||
              !controller.selectedAccountId ||
              !controller.topic.trim() ||
              controller.activeAction !== null
            }
          >
            Generate Draft
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handlePublishNow()}
            disabled={
              !controller.workspaceId ||
              !controller.selectedAccountId ||
              !controller.contentId ||
              controller.activeAction !== null
            }
          >
            Publish Now
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
