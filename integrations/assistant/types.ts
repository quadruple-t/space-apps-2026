import type { FreeplayView, LayerId } from "@/lib/freeplay-store";

export type AssistantAction =
  | { type: "set-layer"; layerId: LayerId; enabled: boolean }
  | { type: "show-catalog"; enabled: boolean }
  | { type: "set-view"; view: FreeplayView };

export type AssistantContext = {
  selectedSite: { id: string; name: string; latitudeDeg: number; longitudeDeg: number } | null;
  candidateSites: Array<{ id: string; name: string; latitudeDeg: number; longitudeDeg: number }>;
  activeLayers: LayerId[];
  catalogVisible: boolean;
  view: FreeplayView;
  missionWindow: { startIso: string; durationHours: number };
};

export type AssistantReply = {
  text: string;
  actions?: Array<{ label: string; action: AssistantAction }>;
};

export type AssistantProvider = {
  respond: (message: string, context: AssistantContext) => Promise<AssistantReply>;
};