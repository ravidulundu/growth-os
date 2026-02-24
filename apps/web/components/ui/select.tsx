import * as React from "react";
import { cn } from "../../lib/cn";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-[calc(var(--radius)-0.1rem)] border border-[var(--input)] bg-white/70 px-3 py-2 text-sm text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] outline-none transition-[border-color,box-shadow,background-color] duration-200 focus-visible:border-[var(--ring)] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
