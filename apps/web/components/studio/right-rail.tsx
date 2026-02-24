import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { StudioController } from "./use-studio-controller";
import { toPrettyJson } from "./utils";

type StudioRightRailProps = {
  controller: StudioController;
};

type InspectorSectionData = {
  title: string;
  value: unknown;
};

export function StudioRightRail({ controller }: StudioRightRailProps) {
  return (
    <div className="space-y-6">
      <ActivityFeedCard activity={controller.activity} />
      <InspectorCard controller={controller} />
    </div>
  );
}

function ActivityFeedCard({ activity }: { activity: StudioController["activity"] }) {
  return (
    <Card className="h-fit motion-rise xl:sticky xl:top-6">
      <CardHeader>
        <span className="section-kicker w-fit">Telemetry</span>
        <CardTitle>Activity feed</CardTitle>
        <CardDescription>Latest command and API execution events.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActivityFeedList activity={activity} />
      </CardContent>
    </Card>
  );
}

function ActivityFeedList({ activity }: { activity: StudioController["activity"] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No actions yet.</p>;
  }

  return (
    <ul className="grid max-h-[340px] gap-2 overflow-auto pr-1 text-xs text-[var(--muted-foreground)]">
      {activity.map((entry) => (
        <li
          key={entry.id}
          className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2"
        >
          {entry.text}
        </li>
      ))}
    </ul>
  );
}

function InspectorCard({ controller }: { controller: StudioController }) {
  const sections = buildInspectorSections(controller);
  return (
    <Card className="h-fit">
      <CardHeader>
        <span className="section-kicker w-fit">Debug Lens</span>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Inspector
        </CardTitle>
        <CardDescription>Raw payloads for debugging</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.map((section) => (
          <InspectorSection key={section.title} title={section.title} value={section.value} />
        ))}
      </CardContent>
    </Card>
  );
}

function buildInspectorSections(controller: StudioController): InspectorSectionData[] {
  return [
    {
      title: "Summary",
      value: {
        apiBaseUrl: controller.apiBaseUrl,
        userId: controller.userId,
        workspaceId: controller.workspaceId,
        accountId: controller.selectedAccountId,
        contentId: controller.contentId,
        activeAction: controller.activeAction,
        hasUnsavedDraft: controller.hasUnsavedDraft
      }
    },
    {
      title: "Auth and connect",
      value: {
        magicRequestResult: controller.magicRequestResult,
        connectStartResult: controller.connectStartResult,
        accounts: controller.accounts
      }
    },
    {
      title: "Style and draft",
      value: {
        styleExtractResult: controller.styleExtractResult,
        styleProfileResult: controller.styleProfileResult,
        draftResult: controller.draftResult,
        versions: controller.versions
      }
    },
    {
      title: "Publish and analytics",
      value: {
        publishResult: controller.publishResult,
        jobs: controller.jobs,
        analytics: controller.analytics
      }
    }
  ];
}

function InspectorSection({ title, value }: InspectorSectionData) {
  return (
    <details className="rounded-xl border border-[var(--border)] bg-white/50 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.13em] text-[var(--muted-foreground)]">
        {title}
      </summary>
      <JsonPanel value={value} />
    </details>
  );
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-white/80 p-3 text-xs text-[var(--muted-foreground)]">
      {toPrettyJson(value)}
    </pre>
  );
}
