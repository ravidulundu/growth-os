"use client";

import { StudioHero } from "./studio/hero";
import { StudioNavigation } from "./studio/navigation";
import { StudioRightRail } from "./studio/right-rail";
import { useStudioController } from "./studio/use-studio-controller";
import { StudioViewContent } from "./studio/view-content";

export function StudioApp() {
  const controller = useStudioController();

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-[1540px] px-4 pb-14 pt-6 sm:px-6 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-72 bg-gradient-to-r from-[var(--primary)]/12 via-transparent to-[var(--secondary)]/18 blur-3xl" />
      <StudioHero controller={controller} />

      <section className="mt-7 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_350px]">
        <StudioNavigation controller={controller} />
        <div className="space-y-6">
          <StudioViewContent controller={controller} />
        </div>
        <StudioRightRail controller={controller} />
      </section>
    </main>
  );
}
