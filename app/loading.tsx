import { LoadingIndicator } from "@/components/freeplay/loading-indicator";

export default function Loading() {
  return <main className="grid min-h-[60vh] place-items-center bg-void p-6"><LoadingIndicator label="page" /></main>;
}
