"use client";

import { useState } from "react";
import { ArrowUpRight, Bot, Check, Globe2, Layers3, Orbit, Sparkles, X } from "lucide-react";
import type { AssistantAction } from "@/integrations/assistant/types";
import { LAYERS } from "@/scenes/cesium/moon-layers";
import { useFreeplay } from "@/lib/freeplay-store";

const STARTER_ACTIONS: Array<{ label: string; Icon: typeof Layers3; action: AssistantAction }> = [
  { label: "Show slope", Icon: Layers3, action: { type: "set-layer", layerId: "slope", enabled: true } },
  { label: "Show candidate sites", Icon: Globe2, action: { type: "show-catalog", enabled: true } },
  { label: "Open Orbit + Graphs", Icon: Orbit, action: { type: "set-view", view: "orbit" } },
];

function runAction(action: AssistantAction) {
  const state = useFreeplay.getState();
  if (action.type === "set-layer") {
    state.setLayer(action.layerId, { on: action.enabled });
    state.setView("globe");
  } else if (action.type === "show-catalog") {
    state.setShowCatalog(action.enabled);
    state.setView("globe");
  } else {
    state.setView(action.view);
  }
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const site = useFreeplay((state) => state.site);
  const layers = useFreeplay((state) => state.layers);
  const [lastAction, setLastAction] = useState("");
  const activeLayers = Object.entries(layers).filter(([, layer]) => layer.on).map(([id]) => id);
  const activeLayerLabels = LAYERS.filter((layer) => activeLayers.includes(layer.id)).map((layer) => layer.label);
  const contextLine = site ? `${site.name} · ${site.latitudeDeg.toFixed(2)}°, ${site.longitudeDeg.toFixed(2)}°` : "No site selected";

  const chooseAction = (action: AssistantAction) => {
    runAction(action);
    const starter = STARTER_ACTIONS.find((item) => item.action.type === action.type && (action.type !== "set-layer" || item.action.type !== "set-layer" || item.action.layerId === action.layerId));
    setLastAction(starter ? `${starter.label} is ready.` : "Workspace updated.");
  };

  return <aside aria-label="Mission assistant" className="flex h-full min-h-0 flex-col overflow-hidden border border-line bg-void lg:w-[360px] lg:border-0 lg:border-l lg:border-line">
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-retro-purple/35 bg-retro-purple/10 text-retro-purple"><Bot size={19} /></span>
        <div className="min-w-0">
          <h2 className="type-heading text-sm text-bone">Mission assistant</h2>
          <p className="type-data mt-0.5 truncate text-[0.58rem] text-muted-foreground">{contextLine}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close mission assistant" className="grid size-9 shrink-0 place-items-center rounded border border-line text-muted-foreground hover:text-bone"><X size={16} /></button>
    </header>

    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <div className="flex items-center gap-2 text-xs text-retro-red"><span className="size-2 rounded-full bg-retro-red" />AI not connected</div>
      <section aria-label="Assistant connection status" className="border-l-2 border-retro-purple/60 pl-3">
        <p className="text-sm leading-relaxed text-bone">The assistant panel is ready for an AI connection. These shortcuts can set up common views in the meantime.</p>
        <p className="mt-2 text-xs text-muted-foreground">Layers on: {activeLayerLabels.length ? activeLayerLabels.join(", ") : "none"}</p>
      </section>

      <section aria-labelledby="assistant-shortcuts">
        <h3 id="assistant-shortcuts" className="type-data text-xs uppercase text-muted-foreground">Workspace shortcuts</h3>
        <div className="mt-2 flex flex-col gap-2">
          {STARTER_ACTIONS.map(({ label, Icon, action }) => {
            const disabled = action.type === "set-view" && !site;
            return <button key={label} type="button" disabled={disabled} onClick={() => chooseAction(action)} className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 text-left text-sm text-bone transition hover:border-retro-purple/50 hover:bg-retro-purple/5 disabled:cursor-not-allowed disabled:opacity-45" title={disabled ? "Select a site on the Moon first" : undefined}>
              <Icon size={16} className="shrink-0 text-retro-purple" />
              <span className="flex-1">{label}</span>
              <ArrowUpRight size={14} className="text-muted-foreground" />
            </button>;
          })}
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-retro-blue">{lastAction && <><Check size={13} className="mr-1 inline" />{lastAction}</>}</p>
      </section>

      <section className="border-t border-line pt-4">
        <h3 className="flex items-center gap-2 type-data text-xs uppercase text-muted-foreground"><Sparkles size={14} className="text-retro-purple" />Ask about a site</h3>
        <label className="sr-only" htmlFor="assistant-message">Message the mission assistant</label>
        <textarea id="assistant-message" disabled rows={3} placeholder="AI connection not configured" className="mt-2 w-full resize-none rounded-md border border-line bg-void/60 p-3 text-sm text-muted-foreground placeholder:text-muted-foreground/70 disabled:cursor-not-allowed" />
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">When connected, the assistant can help choose layers and compare sites using the available mission data.</p>
      </section>
    </div>

    <footer className="border-t border-line px-4 py-3 text-xs text-muted-foreground">Site selections and layer settings stay under your control.</footer>
  </aside>;
}