import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { StudioController } from "./use-studio-controller";
import { toPrettyJson } from "./utils";

type StudioRightRailProps = {
  controller: StudioController;
};

export function StudioRightRail({ controller }: StudioRightRailProps) {
  return (
    <div className="space-y-6">
      <Card className="h-fit motion-rise">
        <CardHeader>
          <CardTitle>Activity feed</CardTitle>
          <CardDescription>Latest execution events</CardDescription>
        </CardHeader>
        <CardContent>
          {controller.activity.length > 0 ? (
            <ul className="grid gap-2 text-xs text-[var(--muted-foreground)]">
              {controller.activity.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No actions yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Inspector
          </CardTitle>
          <CardDescription>Raw payloads for debugging</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Summary
            </summary>
            <JsonPanel
              value={{
                apiBaseUrl: controller.apiBaseUrl,
                userId: controller.userId,
                workspaceId: controller.workspaceId,
                accountId: controller.selectedAccountId,
                contentId: controller.contentId,
                activeAction: controller.activeAction,
                hasUnsavedDraft: controller.hasUnsavedDraft
              }}
            />
          </details>

          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Auth and connect
            </summary>
            <JsonPanel
              value={{
                magicRequestResult: controller.magicRequestResult,
                connectStartResult: controller.connectStartResult,
                accounts: controller.accounts
              }}
            />
          </details>

          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Style and draft
            </summary>
            <JsonPanel
              value={{
                styleExtractResult: controller.styleExtractResult,
                styleProfileResult: controller.styleProfileResult,
                draftResult: controller.draftResult,
                versions: controller.versions
              }}
            />
          </details>

          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Publish and analytics
            </summary>
            <JsonPanel
              value={{
                publishResult: controller.publishResult,
                jobs: controller.jobs,
                analytics: controller.analytics
              }}
            />
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted-foreground)]">
      {toPrettyJson(value)}
    </pre>
  );
}
