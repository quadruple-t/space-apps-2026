import { cn } from "@/lib/utils";
import Image from "next/image";

/**
 * Lunaris360 mark: a lunar disc cut by a ridgeline, with the Sun resting on
 * the horizon — the moment of grazing light the product is about.
 */
export function LogoMark({ className }: { className?: string }) {
  return <Image src="/lunaris360-logo.png" alt="" aria-hidden width={72} height={72} className={cn("size-8 object-contain", className)} />;
}

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-bone", className)}>
      <LogoMark />
      {showWordmark && <span className="sr-only">Lunaris360</span>}
    </span>
  );
}
