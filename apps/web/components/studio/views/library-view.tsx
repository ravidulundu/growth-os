import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { StudioController } from "../use-studio-controller";

type LibraryViewProps = {
  controller: StudioController;
};

export function LibraryView({ controller }: LibraryViewProps) {
  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Draft Library</CardTitle>
        <CardDescription>Version history for the current content.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void controller.handleLoadVersions()}
            disabled={
              !controller.workspaceId || !controller.contentId || controller.activeAction !== null
            }
          >
            {controller.activeAction === "Load Versions" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Load Versions
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handleSaveVersion()}
            disabled={
              !controller.workspaceId ||
              !controller.contentId ||
              !controller.draftText.trim() ||
              controller.activeAction !== null
            }
          >
            Save Current Draft
          </Button>
        </div>

        <div className="grid gap-3">
          {controller.versions.length > 0 ? (
            controller.versions.map((version) => (
              <article
                key={`${version.version_no}-${version.created_at}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                  Version {version.version_no}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground)]">
                  {version.text_body}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No version data loaded yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
