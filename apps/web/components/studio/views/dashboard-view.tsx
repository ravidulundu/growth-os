import { CheckCircle2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";
import { OnboardingWizard } from "./onboarding-wizard";

type DashboardViewProps = {
  controller: StudioController;
};

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

function buildChecklist(controller: StudioController): ChecklistItem[] {
  return [
    { id: "magic-link", label: "1. Request and open magic link", done: Boolean(controller.userId) },
    { id: "connect", label: "2. Connect X account", done: Boolean(controller.selectedAccountId) },
    { id: "draft", label: "3. Generate content draft", done: Boolean(controller.contentId) },
    {
      id: "publish",
      label: "4. Publish and load analytics",
      done: Boolean(controller.analytics?.snapshots.length)
    }
  ];
}

function TimeToFirstValueCard({ controller }: { controller: StudioController }) {
  const checklist = buildChecklist(controller);

  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Time to First Value</CardTitle>
        <CardDescription>
          Follow this exact path to first publish + first analytics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 text-sm text-[var(--muted-foreground)]">
          {checklist.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            >
              {item.label}
              {item.done ? <CheckCircle2 className="ml-2 inline h-4 w-4 text-emerald-600" /> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function FastActionsCard({ controller }: { controller: StudioController }) {
  const busy = controller.activeAction !== null;
  const canStartConnect = Boolean(controller.workspaceId) && !busy;
  const canCompleteConnect =
    Boolean(controller.workspaceId) &&
    Boolean(controller.oauthCode) &&
    Boolean(controller.connectStartResult?.state) &&
    !busy;
  const canGenerateDraft =
    Boolean(controller.workspaceId) &&
    Boolean(controller.selectedAccountId) &&
    controller.topic.trim().length > 0 &&
    !busy;
  const canPublishNow =
    Boolean(controller.workspaceId) &&
    Boolean(controller.selectedAccountId) &&
    Boolean(controller.contentId) &&
    !busy;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fast Actions</CardTitle>
        <CardDescription>Use these actions to move through the flow faster.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => void controller.handleStartConnect()} disabled={!canStartConnect}>
          Start X Connect
        </Button>
        <Button
          variant="secondary"
          onClick={() => void controller.handleCompleteConnect()}
          disabled={!canCompleteConnect}
        >
          Complete Connect
        </Button>
        <Button
          variant="outline"
          onClick={() => void controller.handleGenerateDraft()}
          disabled={!canGenerateDraft}
        >
          Generate Draft
        </Button>
        <Button
          variant="outline"
          onClick={() => void controller.handlePublishNow()}
          disabled={!canPublishNow}
        >
          Publish Now
        </Button>
      </CardContent>
    </Card>
  );
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function KpiSnapshotCard({ controller }: { controller: StudioController }) {
  const disabled = !controller.workspaceId || controller.activeAction !== null;
  const kpi = controller.kpiSnapshot;
  const valueCaption =
    !kpi || kpi.time_to_first_value === null
      ? "Not enough data yet"
      : `${kpi.time_to_first_value} min`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Snapshot</CardTitle>
        <CardDescription>
          7-day conversion and risk metrics for workspace operations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="secondary"
          onClick={() => void controller.handleLoadKpi("7d")}
          disabled={disabled}
        >
          Load KPI Snapshot
        </Button>
        {kpi ? (
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
            <p>
              Draft to publish rate: <strong>{toPercent(kpi.draft_to_publish_rate)}</strong>
            </p>
            <p>
              First-hour success rate: <strong>{toPercent(kpi.first_hour_success_rate)}</strong>
            </p>
            <p>
              Policy risk rate: <strong>{toPercent(kpi.policy_risk_rate)}</strong>
            </p>
            <p>
              Time to first value: <strong>{valueCaption}</strong>
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No KPI snapshot loaded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardView({ controller }: DashboardViewProps) {
  return (
    <>
      <OnboardingWizard controller={controller} />
      <KpiSnapshotCard controller={controller} />
      <TimeToFirstValueCard controller={controller} />
      <FastActionsCard controller={controller} />
    </>
  );
}
