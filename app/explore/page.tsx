import { redirect } from "next/navigation";

/** The 3D surface drive moved into Freeplay; keep old /explore links working. */
export default function ExploreRedirect() {
  redirect("/freeplay/drive");
}
