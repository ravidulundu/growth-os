import { cn } from "../../lib/cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { StudioController } from "./use-studio-controller";

type StudioNavigationProps = {
  controller: StudioController;
};

export function StudioNavigation({ controller }: StudioNavigationProps) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Studio</CardTitle>
        <CardDescription>Product sections</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {controller.sections.map((section) => {
          const Icon = section.icon;
          const isActive = controller.activeView === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => controller.setActiveView(section.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                isActive
                  ? "border-[var(--ring)] bg-[var(--muted)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--muted)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
