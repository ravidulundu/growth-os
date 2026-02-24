import type * as React from "react";
import { cn } from "../../lib/cn";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}
