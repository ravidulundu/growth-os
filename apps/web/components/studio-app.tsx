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
      className="mx-auto w-full max-w-[1520px] px-4 pb-14 pt-6 sm:px-6 lg:px-8"
    >
      <StudioHero controller={controller} />

      <section className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        <StudioNavigation controller={controller} />
        <div className="space-y-6">
          <StudioViewContent controller={controller} />
        </div>
        <StudioRightRail controller={controller} />
      </section>
    </main>
  );
}
