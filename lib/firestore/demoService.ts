import type { HomeDemo } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { homeDemoConverter } from "./converters";
import { fetchStaticDoc } from "./fetch";

/** demo/home: one lunar day at one site for the Home page, or null if not seeded yet. */
export function getHomeDemo(): Promise<HomeDemo | null> {
  return fetchStaticDoc(`${COLLECTIONS.demo}/home`, homeDemoConverter);
}
