"use client";

/** Inline loading/error line for panels that wait on the lunar data API. */
export function DataStatus({ loading, error, what }: { loading: boolean; error: string | null; what: string }) {
  if (error) return <p role="alert" className="p-3 text-xs text-destructive">Couldn&apos;t load {what}: {error}</p>;
  if (loading) return <p className="type-data animate-pulse p-3 text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">Loading {what}…</p>;
  return null;
}
