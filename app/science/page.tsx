import { redirect } from "next/navigation";

/** Keep legacy science links working. */
export default function ScienceRedirect() {
  redirect("/how-it-works");
}
