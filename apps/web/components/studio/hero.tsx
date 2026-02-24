import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { StudioController } from "./use-studio-controller";

type StudioHeroProps = {
  controller: StudioController;
};

type HeroNoticeValue = StudioController["notice"];
type HeroStats = StudioController["stats"];

export function StudioHero({ controller }: StudioHeroProps) {
  const { activeAction, health, notice, stats, workspaceId } = controller;

  return (
    <section className="motion-rise rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
      <HeroBadges isHealthy={health?.status === "ok"} />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <HeroHeading />
        <HeroActions
          activeAction={activeAction}
          workspaceId={workspaceId}
          onHealthCheck={() => void controller.handleHealthCheck()}
          onLoadAccounts={() => void controller.handleLoadAccounts()}
          onLoadJobs={() => void controller.handleLoadJobs()}
        />
      </div>
      <HeroNotice notice={notice} />
      <HeroStats stats={stats} />
    </section>
  );
}

function HeroBadges({ isHealthy }: { isHealthy: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">Growth OS</Badge>
      <Badge variant="default">MVP Product Frontend</Badge>
      <Badge variant={isHealthy ? "success" : "warning"}>
        API {isHealthy ? "Healthy" : "Unchecked"}
      </Badge>
    </div>
  );
}

function HeroHeading() {
  return (
    <div className="max-w-3xl">
      <h1
        className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl"
        data-testid="studio-hero-title"
      >
        Creator Operations Frontend
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
        Product-grade workflow for connect, generate, schedule, publish and first-hour analytics.
        All actions hit the live backend endpoints.
      </p>
    </div>
  );
}

type HeroActionsProps = {
  activeAction: StudioController["activeAction"];
  workspaceId: StudioController["workspaceId"];
  onHealthCheck: () => void;
  onLoadAccounts: () => void;
  onLoadJobs: () => void;
};

function HeroActions({
  activeAction,
  workspaceId,
  onHealthCheck,
  onLoadAccounts,
  onLoadJobs
}: HeroActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <HeroActionButton
        label="Refresh Health"
        actionLabel="Health Check"
        activeAction={activeAction}
        onClick={onHealthCheck}
      />
      <HeroActionButton
        label="Load Accounts"
        actionLabel="Load Accounts"
        activeAction={activeAction}
        disabled={!workspaceId || activeAction !== null}
        onClick={onLoadAccounts}
      />
      <HeroActionButton
        label="Load Jobs"
        actionLabel="Load Jobs"
        activeAction={activeAction}
        disabled={!workspaceId || activeAction !== null}
        onClick={onLoadJobs}
      />
    </div>
  );
}

type HeroActionButtonProps = {
  label: string;
  actionLabel: string;
  activeAction: StudioController["activeAction"];
  disabled?: boolean;
  onClick: () => void;
};

function HeroActionButton({
  label,
  actionLabel,
  activeAction,
  disabled,
  onClick
}: HeroActionButtonProps) {
  return (
    <Button variant="outline" disabled={disabled} onClick={onClick}>
      {activeAction === actionLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

function HeroNotice({ notice }: { notice: HeroNoticeValue }) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-5 rounded-lg border px-3 py-2 text-sm",
        notice.tone === "error"
          ? "border-red-300 bg-red-100 text-red-700"
          : "border-emerald-300 bg-emerald-100 text-emerald-700"
      )}
      aria-live="polite"
    >
      {notice.text}
    </div>
  );
}

function resolveStatusLabel(tone: HeroStats[number]["tone"]) {
  if (tone === "success") {
    return "Ready";
  }
  if (tone === "warning") {
    return "Action needed";
  }
  return "In progress";
}

function resolveStatusVariant(
  tone: HeroStats[number]["tone"]
): "success" | "warning" | "neutral" | "default" {
  if (tone === "success") {
    return "success";
  }
  if (tone === "warning") {
    return "warning";
  }
  return "neutral";
}

function HeroStats({ stats }: { stats: HeroStats }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((item) => {
        const Icon = item.icon;

        return (
          <article
            key={item.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                {item.label}
              </p>
              <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{item.value}</p>
            <Badge className="mt-3" variant={resolveStatusVariant(item.tone)}>
              {resolveStatusLabel(item.tone)}
            </Badge>
          </article>
        );
      })}
    </div>
  );
}
