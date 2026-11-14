import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Honest build-status marker for features that are not live yet. */
export function StatusBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "type-data inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-[0.68rem] text-bone/65",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full border border-sun/80" />
      {children}
    </span>
  );
}
