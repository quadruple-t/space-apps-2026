import { cn } from "@/lib/utils";

/**
 * Shadowline mark: a lunar disc cut by a ridgeline, with the Sun resting on
 * the horizon — the moment of grazing light the product is about.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden focusable="false">
      <defs>
        <clipPath id="sl-disc">
          <circle cx="16" cy="16" r="13" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <g clipPath="url(#sl-disc)">
        <path d="M2 19.5 L8 16.2 L11.5 18 L16.5 13.8 L20 16.6 L24 15 L30 18.5 V32 H2 Z" fill="currentColor" />
      </g>
      <circle cx="9.2" cy="14.1" r="1.9" fill="var(--sun)" />
    </svg>
  );
}

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-bone", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="font-heading text-[0.95rem] font-bold tracking-[0.14em] [font-variation-settings:'wdth'_125]">
          SHADOWLINE
        </span>
      )}
    </span>
  );
}
