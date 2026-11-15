import Image from "next/image";
import { cn } from "@/lib/utils";
import logoMarkImage from "./logo-mark.png";

/** Lunaris360 mark: the lunar disc alone, for contexts that supply their own wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return <Image src={logoMarkImage} alt="" aria-hidden className={cn("size-8 object-contain", className)} />;
}

export function Logo({ className, showWordmark = true, compact = false }: { className?: string; showWordmark?: boolean; compact?: boolean }) {
  return (
    <span role="img" aria-label={showWordmark ? "Lunaris360" : "Lunaris360 mark"} className={cn("inline-flex items-center gap-2.5 text-bone", className)}>
      <span className={cn("grid shrink-0 place-items-center", compact ? "size-12" : "size-16")} aria-hidden>
        <Image src={logoMarkImage} alt="" priority className="block size-full object-contain" />
      </span>
      {showWordmark && <span className={cn("font-heading font-bold tracking-[0.14em] [font-variation-settings:'wdth'_125]", compact ? "text-[0.95rem]" : "text-xl")} aria-hidden>
        LUN<span className="text-retro-red">A</span>RIS<span className="ml-1 text-retro-blue">360</span>
      </span>}
    </span>
  );
}
