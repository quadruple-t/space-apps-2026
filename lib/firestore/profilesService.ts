import { MISSION_PROFILE_IDS, type MissionProfile, type MissionProfileId } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { missionProfileConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

/** All mission profiles in canonical order (short-landing, robotic-14-day, long-term-base). */
export async function listProfiles(): Promise<MissionProfile[]> {
  const profiles = await fetchStaticCollection(COLLECTIONS.missionProfiles, missionProfileConverter);
  return [...profiles].sort((a, b) => MISSION_PROFILE_IDS.indexOf(a.id) - MISSION_PROFILE_IDS.indexOf(b.id));
}

export async function getProfile(id: MissionProfileId): Promise<MissionProfile | null> {
  return (await listProfiles()).find((p) => p.id === id) ?? null;
}
