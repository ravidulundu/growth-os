import { useState, type Dispatch, type SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import type { StudioController } from "../use-studio-controller";

type LibraryViewProps = {
  controller: StudioController;
};

type LibraryTab = "versions" | "series";

function LibraryTabs({
  activeTab,
  setActiveTab
}: {
  activeTab: LibraryTab;
  setActiveTab: Dispatch<SetStateAction<LibraryTab>>;
}) {
  return (
    <div className="mb-4 flex gap-2">
      <Button
        variant={activeTab === "versions" ? "default" : "outline"}
        onClick={() => setActiveTab("versions")}
      >
        Versions
      </Button>
      <Button
        variant={activeTab === "series" ? "default" : "outline"}
        onClick={() => setActiveTab("series")}
      >
        Series
      </Button>
    </div>
  );
}

function VersionsPanel({ controller }: { controller: StudioController }) {
  return (
    <>
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
    </>
  );
}

function SeriesForm({ controller }: { controller: StudioController }) {
  return (
    <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div>
        <Label htmlFor="series-name">Series name</Label>
        <Input
          id="series-name"
          value={controller.seriesName}
          onChange={(event) => controller.setSeriesName(event.target.value)}
          placeholder="Evergreen Series"
        />
      </div>
      <div>
        <Label htmlFor="series-cadence">Cadence</Label>
        <Select
          id="series-cadence"
          value={controller.seriesCadence}
          onChange={(event) =>
            controller.setSeriesCadence(event.target.value as typeof controller.seriesCadence)
          }
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input
          type="checkbox"
          checked={controller.seriesActive}
          onChange={(event) => controller.setSeriesActive(event.target.checked)}
        />
        Series active
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input
          type="checkbox"
          checked={controller.seriesEvergreen}
          onChange={(event) => controller.setSeriesEvergreen(event.target.checked)}
        />
        Evergreen queue after publish
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void controller.handleCreateSeriesFromCurrentContent()}
          disabled={
            !controller.workspaceId ||
            !controller.selectedAccountId ||
            !controller.contentId ||
            controller.activeAction !== null
          }
        >
          {controller.activeAction === "Create Series" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Create from Current Content
        </Button>
        <Button
          variant="outline"
          onClick={() => void controller.handleLoadSeries()}
          disabled={
            !controller.workspaceId ||
            !controller.selectedAccountId ||
            controller.activeAction !== null
          }
        >
          Refresh Series
        </Button>
      </div>
    </div>
  );
}

function SeriesList({ controller }: { controller: StudioController }) {
  if (controller.seriesList.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No series loaded yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {controller.seriesList.map((series) => (
        <article
          key={series.id}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
        >
          <p className="text-sm font-semibold text-[var(--foreground)]">{series.name}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {series.cadence} • {series.isActive ? "active" : "inactive"} •{" "}
            {series.enqueueNextOnPublish ? "evergreen on" : "evergreen off"}
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Next:{" "}
            {series.nextItem
              ? `${series.nextItem.position}. ${series.nextItem.contentTopic ?? series.nextItem.contentId}`
              : "none"}
          </p>
        </article>
      ))}
    </div>
  );
}

function SeriesPanel({ controller }: { controller: StudioController }) {
  return (
    <div className="grid gap-3">
      <SeriesForm controller={controller} />
      <SeriesList controller={controller} />
    </div>
  );
}

export function LibraryView({ controller }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("versions");

  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Draft Library</CardTitle>
        <CardDescription>Version history and evergreen content series.</CardDescription>
      </CardHeader>
      <CardContent>
        <LibraryTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        {activeTab === "versions" ? (
          <VersionsPanel controller={controller} />
        ) : (
          <SeriesPanel controller={controller} />
        )}
      </CardContent>
    </Card>
  );
}
