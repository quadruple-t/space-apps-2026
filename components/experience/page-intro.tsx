import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Opening block shared by the experience and science routes:
 * title, lede, honest build status, and an optional visual.
 */
export function PageIntro({
  index,
  title,
  lede,
  status = "In development",
  beforeTitle,
  children,
  visual,
}: {
  index?: string;
  title: string;
  lede: string;
  status?: string | null;
  beforeTitle?: ReactNode;
  children?: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <section className="relative border-b border-line pb-16 pt-32 sm:pb-20 sm:pt-40">
      <PageContainer>
        {beforeTitle && <div className="mb-8">{beforeTitle}</div>}
        <div className="flex flex-wrap items-center gap-3">
          {index && <span className="type-data text-xs text-bone/55">{index}</span>}
          {status && <StatusBadge>{status}</StatusBadge>}
        </div>
        <h1 className="type-display mt-6 max-w-5xl text-balance text-[clamp(2.6rem,7vw,6rem)] text-bone">{title}</h1>
        <p className="mt-6 max-w-2xl text-pretty text-xl text-bone/85 sm:text-2xl">{lede}</p>
        {children && <div className="mt-6 max-w-2xl text-pretty leading-relaxed text-muted-foreground sm:text-lg">{children}</div>}
        {visual && <div className="mt-14">{visual}</div>}
      </PageContainer>
    </section>
  );
}

/** Plain-language notice that a feature is not live yet. */
export function DevelopmentNotice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex gap-4 rounded-lg border border-sun/25 bg-sun/[0.04] p-5 text-sm leading-relaxed text-bone/85">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full border border-sun" />
      <div>{children}</div>
    </div>
  );
}
