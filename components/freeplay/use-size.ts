"use client";

import { useEffect, useRef, useState } from "react";

/** Tracks an element's content box. Charts and the orbit SVG size themselves from it. */
export function useSize<T extends HTMLElement>(fallback = { width: 640, height: 360 }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.max(200, e.contentRect.width), height: Math.max(160, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
