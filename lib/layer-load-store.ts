"use client";

import { create } from "zustand";
import type { LayerId } from "./freeplay-store";

export type LayerLoadStatus = { state: "loading" | "ready" | "error"; message?: string };
type LayerLoadState = {
  statuses: Partial<Record<LayerId | "catalog", LayerLoadStatus>>;
  setStatus: (id: LayerId | "catalog", status: LayerLoadStatus | null) => void;
  reset: () => void;
};

export const useLayerLoad = create<LayerLoadState>((set) => ({
  statuses: {},
  setStatus: (id, status) => set((current) => {
    const old = current.statuses[id];
    if ((!old && !status) || (old && status && old.state === status.state && old.message === status.message)) return current;
    const statuses = { ...current.statuses };
    if (status) statuses[id] = status; else delete statuses[id];
    return { statuses };
  }),
  reset: () => set({ statuses: {} }),
}));
