"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-triggered reveal. Server HTML is fully visible; the hidden state is
 * only applied after hydration for elements still below the fold, so content
 * never depends on JavaScript to appear.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen at hydration: leave it alone.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    // Hide on the next frame so the transition has a starting point.
    const raf = requestAnimationFrame(() => {
      setState("hidden");
      observer.observe(el);
    });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      data-state={state}
      className={cn("reveal", className)}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
