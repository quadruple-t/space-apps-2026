"use client";

/**
 * "Save to expedition" for a comparison or ranking result. Works signed out too: the study is
 * kept in this browser's draft, with an optional prompt to sign in and keep it in an expedition.
 */
import { useState } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { useSignInDialog } from "@/components/auth/sign-in-dialog-store";
import { useExpeditions } from "@/lib/expeditions/expedition-store";
import type { StudyInput } from "@/lib/expeditions/types";

export function SaveToExpedition({ makeInput, compact = false }: { makeInput: () => StudyInput; compact?: boolean }) {
  const addStudy = useExpeditions((s) => s.addStudy);
  const activeName = useExpeditions((s) => s.activeName);
  const uid = useExpeditions((s) => s.uid);
  const openSignIn = useSignInDialog((s) => s.open);
  const [state, setState] = useState<{ kind: "idle" | "saving" } | { kind: "saved"; to: "expedition" | "draft" } | { kind: "error"; message: string }>({ kind: "idle" });

  const save = async () => {
    setState({ kind: "saving" });
    try {
      const { savedTo } = await addStudy(makeInput());
      setState({ kind: "saved", to: savedTo });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const size = compact ? "px-2 py-1 text-[0.56rem]" : "px-3 py-1.5 text-[0.62rem]";
  return <div className="flex flex-wrap items-center gap-2">
    {state.kind === "saved"
      ? <p role="status" className={`type-data inline-flex items-center gap-1.5 text-retro-blue ${compact ? "text-[0.58rem]" : "text-xs"}`}>
          <Check size={12} aria-hidden />
          {state.to === "expedition" ? `Saved to ${activeName ?? "your expedition"}` : "Saved in this browser"}
          {state.to === "draft" && !uid && <button type="button" onClick={() => openSignIn()} className="text-retro-purple underline-offset-2 hover:underline">Sign in to keep it in an expedition</button>}
        </p>
      : <button type="button" onClick={() => void save()} disabled={state.kind === "saving"}
          className={`type-data inline-flex items-center gap-1.5 rounded border border-retro-purple/50 bg-retro-purple/10 uppercase tracking-[0.08em] text-retro-purple hover:bg-retro-purple/20 disabled:opacity-50 ${size}`}>
          <BookmarkPlus size={compact ? 11 : 13} aria-hidden />{state.kind === "saving" ? "Saving…" : "Save to expedition"}
        </button>}
    {state.kind === "error" && <p role="alert" className="text-xs text-retro-red">{state.message}</p>}
  </div>;
}
