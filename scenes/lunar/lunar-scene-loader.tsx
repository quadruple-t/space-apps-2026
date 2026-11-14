"use client";

import { Component, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { LunarHorizonIllustration } from "@/components/graphics/lunar-horizon-illustration";
import { useInView } from "@/hooks/use-in-view";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { detectWebGL } from "@/lib/webgl";
import { cn } from "@/lib/utils";
import type { LunarSceneVariant } from "./lunar-scene";

const LunarScene = dynamic(() => import("./lunar-scene"), { ssr: false });

let webglCache: boolean | null = null;
const noopSubscribe = () => () => {};
function getWebGL() {
  if (webglCache === null) webglCache = detectWebGL();
  return webglCache;
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Mounts the WebGL lunar scene when supported, with the static illustration
 * underneath as both loading state and fallback. Pauses rendering when the
 * scene scrolls out of view.
 */
export function LunarSceneLoader({
  variant = "hero",
  className,
  fallbackLabel = "Illustration of a low Sun on the lunar south-pole horizon",
}: {
  variant?: LunarSceneVariant;
  className?: string;
  fallbackLabel?: string;
}) {
  const webgl = useSyncExternalStore(noopSubscribe, getWebGL, () => null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  // Mount lazily (preview sits below the fold); pause when off-screen.
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: "200px" });
  const [mounted, setMounted] = useState(variant === "hero");
  if (inView && !mounted) setMounted(true);

  const detail =
    typeof window !== "undefined" && (window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4)
      ? "low"
      : "high";

  const fallback = <LunarHorizonIllustration />;

  return (
    <div ref={ref} className={cn("relative h-full w-full overflow-hidden bg-void", className)}>
      <div
        role="img"
        aria-label={fallbackLabel}
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          ready ? "opacity-0" : "opacity-100",
        )}
      >
        {fallback}
      </div>
      {webgl && mounted && (
        <div className={cn("absolute inset-0 transition-opacity duration-[1400ms]", ready ? "opacity-100" : "opacity-0")}>
          <SceneErrorBoundary fallback={null}>
            <LunarScene
              variant={variant}
              active={inView}
              still={reduced}
              detail={detail}
              onReady={() => setReady(true)}
            />
          </SceneErrorBoundary>
        </div>
      )}
    </div>
  );
}
