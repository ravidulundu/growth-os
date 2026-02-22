import type { StudioController } from "./use-studio-controller";
import { AnalyticsView } from "./views/analytics-view";
import { DashboardView } from "./views/dashboard-view";
import { GeneratorView } from "./views/generator-view";
import { LibraryView } from "./views/library-view";
import { SchedulerView } from "./views/scheduler-view";
import { SettingsView } from "./views/settings-view";

type StudioViewContentProps = {
  controller: StudioController;
};

export function StudioViewContent({ controller }: StudioViewContentProps) {
  if (controller.activeView === "dashboard") {
    return <DashboardView controller={controller} />;
  }

  if (controller.activeView === "generator") {
    return <GeneratorView controller={controller} />;
  }

  if (controller.activeView === "library") {
    return <LibraryView controller={controller} />;
  }

  if (controller.activeView === "scheduler") {
    return <SchedulerView controller={controller} />;
  }

  if (controller.activeView === "analytics") {
    return <AnalyticsView controller={controller} />;
  }

  return <SettingsView controller={controller} />;
}
