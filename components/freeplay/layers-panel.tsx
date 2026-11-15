"use client";

import { LAYERS, LAYER_CATEGORIES } from "@/scenes/cesium/moon-layers";
import { useFreeplay, type LayerId } from "@/lib/freeplay-store";
import { MeteorStreamsPanel } from "./meteor-streams-panel";

type Props = {
  className?: string;
  showBaseImagery?: boolean;
  showCatalog?: boolean;
  layerIds?: LayerId[];
};

export function LayersPanel({ className = "", showBaseImagery = true, showCatalog = true, layerIds }: Props) {
  const layers = useFreeplay((s) => s.layers);
  const setLayer = useFreeplay((s) => s.setLayer);
  const catalogEnabled = useFreeplay((s) => s.showCatalog);
  const setShowCatalog = useFreeplay((s) => s.setShowCatalog);
  const visibleLayers = layerIds ? LAYERS.filter((layer) => layerIds.includes(layer.id)) : LAYERS;

  return <section aria-label="Layers" className={`flex flex-col gap-2 overflow-y-auto p-3 ${className}`}>
    <h2 className="type-data text-[0.6rem] uppercase tracking-[0.16em] text-retro-purple">Layers</h2>

    {showBaseImagery && <>
      <div className="hud-readout">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.66rem] text-bone">Base imagery</span>
          <span className="type-data text-[0.52rem] uppercase text-muted-foreground">always on</span>
        </div>
        <p className="mt-0.5 text-[0.56rem] text-muted-foreground">LRO WAC global mosaic · NASA Moon Trek snapshot</p>
      </div>
      <p className="text-[0.56rem] leading-snug text-muted-foreground">Stored map snapshots show overview resolution; zooming in does not add source detail.</p>
      <a download href="/api/v1/globe/assets/collected-data" className="text-[0.56rem] text-retro-purple underline">Download collected scientific data</a>
    </>}

    {showCatalog && <div className={`hud-readout transition-colors ${catalogEnabled ? "border-retro-purple/50" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="layer-catalog" className="cursor-pointer text-[0.66rem] text-bone">Catalog sites</label>
        <button id="layer-catalog" type="button" role="switch" aria-checked={catalogEnabled} onClick={() => setShowCatalog(!catalogEnabled)}
          className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${catalogEnabled ? "border-retro-purple bg-retro-purple/70" : "border-line bg-void"}`}>
          <span className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-bone transition-[left] ${catalogEnabled ? "left-[0.85rem]" : "left-[0.15rem]"}`} />
          <span className="sr-only">{catalogEnabled ? "On" : "Off"}</span>
        </button>
      </div>
      <p className="mt-0.5 text-[0.56rem] leading-snug text-muted-foreground">Past landings and Artemis III candidates from the Lunaris360 catalog. Their LOLA terrain horizon is used for sunlight and Earth visibility.</p>
      <div className="type-data mt-1.5 flex items-center gap-1.5 text-[0.54rem] text-muted-foreground"><span aria-hidden className="text-bone">★</span>catalog site</div>
    </div>}

    {LAYER_CATEGORIES.map((category) => {
      const categoryLayers = visibleLayers.filter((layer) => layer.category === category.id);
      if (categoryLayers.length === 0) return null;
      return <details key={category.id} open className="border-t border-line pt-2">
        <summary className="cursor-pointer text-[0.7rem] text-bone">{category.label}
          <span className="type-data ml-2 text-[0.55rem] text-retro-purple">{categoryLayers.filter((layer) => layers[layer.id].on).length} active</span>
        </summary>
        <p className="my-2 text-[0.56rem] text-muted-foreground">{category.description}</p>
        <div className="flex flex-col gap-2">
          {categoryLayers.map((def) => {
            const state = layers[def.id];
            const inputId = `layer-${def.id}`;
            return <div key={def.id} className={`hud-readout transition-colors ${state.on ? "border-retro-purple/50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={inputId} className="cursor-pointer text-[0.66rem] text-bone">{def.label}</label>
                <button id={inputId} type="button" role="switch" aria-checked={state.on} onClick={() => setLayer(def.id, { on: !state.on })}
                  className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${state.on ? "border-retro-purple bg-retro-purple/70" : "border-line bg-void"}`}>
                  <span className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-bone transition-[left] ${state.on ? "left-[0.85rem]" : "left-[0.15rem]"}`} />
                  <span className="sr-only">{state.on ? "On" : "Off"}</span>
                </button>
              </div>
              <p className="mt-0.5 text-[0.56rem] leading-snug text-muted-foreground">{def.description}</p>

              {def.id === "meteorStreams" && state.on && <MeteorStreamsPanel />}
              <div className="mt-1.5">
                {def.legend.kind === "ramp"
                  ? <>
                      <div className="h-1.5 rounded-sm" style={{ background: def.legend.css }} aria-hidden />
                      <div className="type-data mt-0.5 flex justify-between text-[0.52rem] text-muted-foreground"><span>{def.legend.low}</span><span>{def.legend.high}</span></div>
                    </>
                  : <div className="type-data flex items-center gap-1.5 text-[0.54rem] text-muted-foreground"><span aria-hidden className="inline-block size-2.5 rounded-sm border-2" style={{ borderColor: def.legend.color }} />{def.legend.text}</div>}
              </div>

              <label className="mt-1.5 flex items-center gap-2 text-[0.54rem] text-muted-foreground">
                <span className="w-12 shrink-0">Opacity</span>
                <input type="range" min={0} max={1} step={0.05} value={state.opacity} disabled={!state.on}
                  onChange={(e) => setLayer(def.id, { opacity: Number(e.target.value) })} aria-label={`${def.label} opacity`}
                  className="min-w-0 flex-1 accent-[#a986ff] disabled:opacity-40" />
                <span className="type-data w-8 text-right tabular-nums">{Math.round(state.opacity * 100)}%</span>
              </label>
              <p className="type-data mt-1 text-[0.5rem] text-muted-foreground/80">{def.credit}</p>
            </div>;
          })}
        </div>
      </details>;
    })}
  </section>;
}
