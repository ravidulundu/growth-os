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

type GeneratorFlags = {
  canIngestTimeline: boolean;
  canExtractStyle: boolean;
  canGetStyle: boolean;
  canGenerateDraft: boolean;
  canSaveVersion: boolean;
  canRepurpose: boolean;
};

function deriveGeneratorFlags(controller: StudioController): GeneratorFlags {
  const hasWorkspace = Boolean(controller.workspaceId);
  const hasAccount = Boolean(controller.selectedAccountId);
  const hasTopic = controller.topic.trim().length > 0;
  const hasDraft = controller.draftText.trim().length > 0;
  const hasContent = Boolean(controller.contentId);
  const busy = controller.activeAction !== null;

  return {
    canIngestTimeline: hasWorkspace && hasAccount && !busy,
    canExtractStyle: hasWorkspace && hasAccount && !busy,
    canGetStyle: hasWorkspace && hasAccount && !busy,
    canGenerateDraft: hasWorkspace && hasAccount && hasTopic && !busy,
    canSaveVersion: hasWorkspace && hasContent && hasDraft && !busy,
    canRepurpose: hasWorkspace && hasContent && !busy
  };
}

function ActionSpinner({
  activeAction,
  expected
}: {
  activeAction: string | null;
  expected: string;
}) {
  return activeAction === expected ? <Loader2 className="h-4 w-4 animate-spin" /> : null;
}

type StyleInputsCardProps = {
  controller: StudioController;
  flags: GeneratorFlags;
};

function StyleInputsCard({ controller, flags }: StyleInputsCardProps) {
  return (
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
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            variant="outline"
            onClick={() => void controller.handleIngestTimeline()}
            disabled={!flags.canIngestTimeline}
          >
            Ingest Timeline
          </Button>
          <Button
            onClick={() => void controller.handleExtractStyle()}
            disabled={!flags.canExtractStyle}
          >
            <ActionSpinner activeAction={controller.activeAction} expected="Extract Style" />
            Extract Style
          </Button>
          <Button
            variant="secondary"
            onClick={() => void controller.handleGetStyle()}
            disabled={!flags.canGetStyle}
          >
            <ActionSpinner activeAction={controller.activeAction} expected="Get Style" />
            Get Style
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ContentGeneratorCardProps = {
  controller: StudioController;
  flags: GeneratorFlags;
};

function ContentGeneratorCard({ controller, flags }: ContentGeneratorCardProps) {
  return (
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
              <option value="reply">Reply</option>
              <option value="quote">Quote</option>
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
          <div className="sm:col-span-2">
            <Label htmlFor="template-name">Template name (optional)</Label>
            <Input
              id="template-name"
              value={controller.templateName}
              onChange={(event) => controller.setTemplateName(event.target.value)}
              placeholder="default-tweet"
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
            disabled={!flags.canGenerateDraft}
          >
            <ActionSpinner activeAction={controller.activeAction} expected="Create Draft" />
            Generate Draft
          </Button>
          <Button
            variant="secondary"
            onClick={() => void controller.handleSaveVersion()}
            disabled={!flags.canSaveVersion}
          >
            <ActionSpinner activeAction={controller.activeAction} expected="Create Version" />
            Save Version
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RepurposeCard({ controller, flags }: ContentGeneratorCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repurpose</CardTitle>
        <CardDescription>
          Generate a new format from the current draft or published post.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="repurpose-target-type">Target type</Label>
            <Select
              id="repurpose-target-type"
              value={controller.repurposeTargetType}
              onChange={(event) =>
                controller.setRepurposeTargetType(event.target.value as ContentMode)
              }
            >
              <option value="tweet">Tweet</option>
              <option value="thread">Thread</option>
              <option value="reply">Reply</option>
              <option value="quote">Quote</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => void controller.handleRepurposeCurrentContent()}
              disabled={!flags.canRepurpose}
            >
              <ActionSpinner activeAction={controller.activeAction} expected="Repurpose Draft" />
              Repurpose This Draft/Post
            </Button>
          </div>
        </div>
        {controller.repurposeResult ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-xs">
            <p className="font-medium text-[var(--foreground)]">
              Repurpose run {controller.repurposeResult.repurposeRunId} completed.
            </p>
            <p className="text-[var(--muted-foreground)]">
              New content ID: {controller.repurposeResult.contentId}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GeneratorView({ controller }: GeneratorViewProps) {
  const flags = deriveGeneratorFlags(controller);

  return (
    <>
      <StyleInputsCard controller={controller} flags={flags} />
      <ContentGeneratorCard controller={controller} flags={flags} />
      <RepurposeCard controller={controller} flags={flags} />
    </>
  );
}
