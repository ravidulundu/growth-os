import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import type { ContentMode } from "../types";
import type { StudioController } from "../use-studio-controller";

type GeneratorViewProps = {
  controller: StudioController;
};

export function GeneratorView({ controller }: GeneratorViewProps) {
  return (
    <>
      <Card className="motion-rise">
        <CardHeader>
          <CardTitle>Style Inputs</CardTitle>
          <CardDescription>Ingest source posts and extract style profile.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="timeline-limit">Timeline limit</Label>
            <Input
              id="timeline-limit"
              type="number"
              min={1}
              max={20}
              value={controller.timelineLimit}
              onChange={(event) => controller.setTimelineLimit(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="source-limit">Source limit</Label>
            <Input
              id="source-limit"
              type="number"
              min={1}
              max={100}
              value={controller.sourceLimit}
              onChange={(event) => controller.setSourceLimit(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void controller.handleIngestTimeline()}
              disabled={
                !controller.workspaceId ||
                !controller.selectedAccountId ||
                controller.activeAction !== null
              }
            >
              Ingest Timeline
            </Button>
            <Button
              onClick={() => void controller.handleExtractStyle()}
              disabled={
                !controller.workspaceId ||
                !controller.selectedAccountId ||
                controller.activeAction !== null
              }
            >
              {controller.activeAction === "Extract Style" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Extract Style
            </Button>
            <Button
              variant="secondary"
              onClick={() => void controller.handleGetStyle()}
              disabled={
                !controller.workspaceId ||
                !controller.selectedAccountId ||
                controller.activeAction !== null
              }
            >
              {controller.activeAction === "Get Style" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Get Style
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content Generator</CardTitle>
          <CardDescription>Create and edit drafts before publishing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="content-mode">Content type</Label>
              <Select
                id="content-mode"
                value={controller.contentMode}
                onChange={(event) => controller.setContentMode(event.target.value as ContentMode)}
              >
                <option value="tweet">Tweet</option>
                <option value="thread">Thread</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                value={controller.topic}
                onChange={(event) => controller.setTopic(event.target.value)}
                placeholder="First hour retention hooks"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prompt-input">Prompt constraints</Label>
            <Textarea
              id="prompt-input"
              value={controller.promptInput}
              onChange={(event) => controller.setPromptInput(event.target.value)}
              placeholder="Tone, length and CTA constraints"
            />
          </div>

          <div>
            <Label htmlFor="draft-text">Draft text</Label>
            <Textarea
              id="draft-text"
              value={controller.draftText}
              onChange={(event) => controller.setDraftText(event.target.value)}
              placeholder="Generated draft appears here"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void controller.handleGenerateDraft()}
              disabled={
                !controller.workspaceId ||
                !controller.selectedAccountId ||
                !controller.topic.trim() ||
                controller.activeAction !== null
              }
            >
              {controller.activeAction === "Create Draft" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Generate Draft
            </Button>
            <Button
              variant="secondary"
              onClick={() => void controller.handleSaveVersion()}
              disabled={
                !controller.workspaceId ||
                !controller.contentId ||
                !controller.draftText.trim() ||
                controller.activeAction !== null
              }
            >
              {controller.activeAction === "Create Version" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Save Version
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
