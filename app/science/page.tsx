import { redirect } from "next/navigation";

/** Keep legacy science links working while Mission Control is the primary destination. */
export default function ScienceRedirect() {
  redirect("/mission-control");
}
