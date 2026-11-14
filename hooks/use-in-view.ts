"use client";

import { useEffect, useRef, useState } from "react";

type Options = { rootMargin?: string; threshold?: number; once?: boolean };

/** Observe whether an element intersects the viewport. */
export function useInView<T extends Element>({
  rootMargin = "0px",
  threshold = 0,
  once = false,
}: Options = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { rootMargin, threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, inView };
}
