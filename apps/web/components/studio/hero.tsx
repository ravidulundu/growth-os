import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { StudioController } from "./use-studio-controller";

type StudioHeroProps = {
  controller: StudioController;
};

export function StudioHero({ controller }: StudioHeroProps) {
  const { activeAction, health, notice, stats, workspaceId } = controller;

  return (
    <section className="motion-rise rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Growth OS</Badge>
        <Badge variant="default">MVP Product Frontend</Badge>
        <Badge variant={health?.status === "ok" ? "success" : "warning"}>
          API {health?.status === "ok" ? "Healthy" : "Unchecked"}
        </Badge>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            Creator Operations Frontend
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
            Product-grade workflow for connect, generate, schedule, publish and first-hour
            analytics. All actions hit the live backend endpoints.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void controller.handleHealthCheck()}>
            {activeAction === "Health Check" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh Health
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handleLoadAccounts()}
            disabled={!workspaceId || activeAction !== null}
          >
            {activeAction === "Load Accounts" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load Accounts
          </Button>
          <Button
            variant="outline"
            onClick={() => void controller.handleLoadJobs()}
            disabled={!workspaceId || activeAction !== null}
          >
            {activeAction === "Load Jobs" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load Jobs
          </Button>
        </div>
      </div>

      {notice ? (
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
      ) : null}

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
              <Badge
                className="mt-3"
                variant={
                  item.tone === "success"
                    ? "success"
                    : item.tone === "warning"
                      ? "warning"
                      : "neutral"
                }
              >
                {item.tone === "success"
                  ? "Ready"
                  : item.tone === "warning"
                    ? "Action needed"
                    : "In progress"}
              </Badge>
            </article>
          );
        })}
      </div>
    </section>
  );
}
