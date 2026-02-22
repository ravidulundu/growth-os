import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]",
        success: "border-emerald-300/70 bg-emerald-100 text-emerald-700",
        warning: "border-amber-300/70 bg-amber-100 text-amber-700",
        neutral: "border-slate-300/70 bg-slate-100 text-slate-700"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
