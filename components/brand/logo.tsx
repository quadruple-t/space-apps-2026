import Image from "next/image";
import { cn } from "@/lib/utils";
import logoImage from "./logo.png";
import logoMarkImage from "./logo-mark.png";

export function Logo({ className, showWordmark = true, compact = false }: { className?: string; showWordmark?: boolean; compact?: boolean }) {
  if (compact) return (
    <span className={cn("inline-flex items-center gap-2.5 text-bone", className)}>
      <span className="grid size-12 shrink-0 place-items-center" aria-hidden>
        <Image src={logoMarkImage} alt="" priority className="block size-full object-contain" />
      </span>
      {showWordmark && <span className="font-heading text-[0.95rem] font-bold tracking-[0.14em] [font-variation-settings:'wdth'_125]">LUN<span className="text-retro-red">A</span>RIS360</span>}
    </span>
  );

  return <Image src={logoImage} alt="Lunaris360" priority className={cn("h-auto w-32", className)} />;
}
