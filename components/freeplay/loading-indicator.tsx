import { LoaderCircle } from "lucide-react";

export function LoadingIndicator({ label, className = "" }: { label: string; className?: string }) {
  return <span role="status" aria-live="polite" className={`type-data inline-flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground ${className}`}>
    <LoaderCircle size={14} className="shrink-0 animate-spin" aria-hidden />Loading {label}…
  </span>;
}
