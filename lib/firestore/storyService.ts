import type { ChapterId, StoryChapter } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { storyChapterConverter } from "./converters";
import { fetchStaticCollection } from "./fetch";

/** All story chapters, sorted by order (1, 2, 3). */
export async function listChapters(): Promise<StoryChapter[]> {
  const chapters = await fetchStaticCollection(COLLECTIONS.storyChapters, storyChapterConverter);
  return [...chapters].sort((a, b) => a.order - b.order);
}

export async function getChapter(id: ChapterId): Promise<StoryChapter | null> {
  return (await listChapters()).find((c) => c.id === id) ?? null;
}
