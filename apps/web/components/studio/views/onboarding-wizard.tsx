import { CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import type { OnboardingSteps } from "../../../lib/api";
import type { StudioController } from "../use-studio-controller";

type OnboardingWizardProps = {
  controller: StudioController;
};

type OnboardingStepItem = {
  key: keyof OnboardingSteps;
  title: string;
  description: string;
  actionLabel: string;
};

const ONBOARDING_STEPS: OnboardingStepItem[] = [
  {
    key: "workspaceValidated",
    title: "1) Workspace doğrula",
    description: "Workspace ID gir ve ayarları kaydet.",
    actionLabel: "Open Settings"
  },
  {
    key: "xConnected",
    title: "2) X hesabı bağla",
    description: "OAuth başlatıp hesabı bağla.",
    actionLabel: "Start X Connect"
  },
  {
    key: "timelineIngested",
    title: "3) Timeline ingest",
    description: "Son postları içeri al.",
    actionLabel: "Ingest Timeline"
  },
  {
    key: "styleExtracted",
    title: "4) Stil çıkar",
    description: "Profili çıkarıp style lock oluştur.",
    actionLabel: "Extract Style"
  },
  {
    key: "draftGenerated",
    title: "5) İlk taslağı üret",
    description: "İlk draft’ı üret ve düzenlemeye başla.",
    actionLabel: "Generate Draft"
  }
];

function runStepAction(controller: StudioController, stepKey: keyof OnboardingSteps) {
  if (stepKey === "workspaceValidated") {
    controller.setActiveView("settings");
    return;
  }
  if (stepKey === "xConnected") {
    void controller.handleStartConnect();
    return;
  }
  controller.setActiveView("generator");
  if (stepKey === "timelineIngested") {
    void controller.handleIngestTimeline();
    return;
  }
  if (stepKey === "styleExtracted") {
    void controller.handleExtractStyle();
    return;
  }
  void controller.handleGenerateDraft();
}

function StepItem({
  controller,
  step
}: {
  controller: StudioController;
  step: OnboardingStepItem;
}) {
  const done = controller.onboardingState.steps[step.key];

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{step.title}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{step.description}</p>
        </div>
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <CircleDashed className="h-5 w-5 text-[var(--muted-foreground)]" />
        )}
      </div>
      {!done ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => runStepAction(controller, step.key)}>
            {step.actionLabel}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function OnboardingWizard({ controller }: OnboardingWizardProps) {
  return (
    <Card className="motion-rise">
      <CardHeader>
        <CardTitle>Onboarding Wizard</CardTitle>
        <CardDescription>
          Resume destekli başlangıç akışı. Progress: %{controller.onboardingProgressPercent}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-3">
          {ONBOARDING_STEPS.map((step) => (
            <StepItem key={step.key} controller={controller} step={step} />
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => controller.handleUseDemoWorkspace()}>
            Use Demo Workspace
          </Button>
          <Button variant="ghost" onClick={() => controller.setActiveView("generator")}>
            Skip to Studio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
