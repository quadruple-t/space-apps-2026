import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section title block. `marker` is a short positional label (e.g. a section
 * coordinate) rendered as instrument text beside a rule — optional.
 */
export function SectionHeading({
  id,
  marker,
  title,
  children,
  className,
  as: Tag = "h2",
}: {
  id?: string;
  marker?: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <header className={cn("max-w-4xl", className)}>
      {marker && (
        <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="type-data">{marker}</span>
          <span className="h-px w-12 bg-line" aria-hidden />
        </div>
      )}
      <Tag id={id} className="type-heading text-balance text-[clamp(2rem,5.2vw,4.25rem)] text-bone">
        {title}
      </Tag>
      {children && (
        <div className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {children}
        </div>
      )}
    </header>
  );
}
