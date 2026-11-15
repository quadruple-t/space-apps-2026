import type { SourceRecord } from "@/lib/assistant/tool-results";

/** Collapsible "Sources" line: one row per data lookup behind the answer (site, horizon source, data range). */
export function Sources({ records: all }: { records: SourceRecord[] }) {
  // Invalid-argument attempts the model corrected are not data lookups, so they are not sources.
  const records = all.filter((r) => !r.internal && !r.ui);
  if (records.length === 0) return null;
  return <details className="mt-2 text-[0.65rem] text-muted-foreground">
    <summary className="type-data cursor-pointer rounded uppercase tracking-[0.1em] hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      Sources ({records.length})
    </summary>
    <ul className="mt-1.5 space-y-1.5 border-l border-line pl-2.5">
      {records.map((r) => <li key={r.id} className="leading-snug">
        <span className="text-bone/90">{r.label}</span>
        {r.ok ? <>
          {r.site && <> · {r.site}</>}
          {r.horizonLabel && <> · <span className="text-retro-blue">{r.horizonLabel}</span></>}
          {r.dataRange && <> · {r.dataRange}</>}
          {!r.site && !r.dataRange && !r.horizonLabel && <> · Lunaris360 catalog</>}
        </> : <> · <span className="text-retro-red">Unavailable: {r.error}</span></>}
      </li>)}
    </ul>
  </details>;
}
