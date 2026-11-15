"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

export type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];
const DRAG_THRESHOLD_PX = 6;
const BUTTON_PX = 56;
const EDGE_PX = 8;

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const readStored = (key: string): string | null => { try { return window.localStorage.getItem(key); } catch { return null; } };

/**
 * A launcher the user can drag to any screen corner; it snaps to the nearest one and remembers it.
 * Shift + arrow keys move it too, so it never depends on a pointer. Drag position is viewport-fixed.
 */
export function useCornerDrag(storageKey: string, fallback: Corner) {
  const stored = useSyncExternalStore(subscribe, () => readStored(storageKey), () => null);
  const corner: Corner = (CORNERS as readonly string[]).includes(stored ?? "") ? (stored as Corner) : fallback;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
    const justDragged = useRef(false);

  const setCorner = useCallback((next: Corner) => {
    try { window.localStorage.setItem(storageKey, next); } catch { /* private mode: lasts for this visit only */ }
    listeners.forEach((cb) => cb());
  }, [storageKey]);

  // Window-level listeners (capture phase) follow the pointer wherever it goes, so the drag never depends on
  // pointer capture, hit-testing or other handlers (for example the 3D view's) on the way.
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const rect = target.getBoundingClientRect();
    const g = { startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top, moved: false };
    try { target.setPointerCapture(pointerId); } catch { /* the window listeners below still follow the pointer */ }
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - g.startX, dy = ev.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      g.moved = true;
      ev.preventDefault();
      setDrag({
        x: Math.min(window.innerWidth - BUTTON_PX - EDGE_PX, Math.max(EDGE_PX, g.left + dx)),
        y: Math.min(window.innerHeight - BUTTON_PX - EDGE_PX, Math.max(EDGE_PX, g.top + dy)),
      });
    };
    const end = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      try { if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch { /* already released */ }
      if (!g.moved) return;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      setDrag(null);
      if (ev.type === "pointercancel") return;
      const top = g.top + (ev.clientY - g.startY) + BUTTON_PX / 2 < window.innerHeight / 2;
      const left = g.left + (ev.clientX - g.startX) + BUTTON_PX / 2 < window.innerWidth / 2;
      setCorner(`${top ? "t" : "b"}${left ? "l" : "r"}` as Corner);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!e.shiftKey || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const vertical = corner[0] as "t" | "b", horizontal = corner[1] as "l" | "r";
    const next = e.key === "ArrowUp" ? "t" : e.key === "ArrowDown" ? "b" : null;
    const side = e.key === "ArrowLeft" ? "l" : e.key === "ArrowRight" ? "r" : null;
    setCorner(`${next ?? vertical}${side ?? horizontal}` as Corner);
  };

  return {
    corner,
    dragging: drag !== null,
    /** Inline position while dragging; the corner's classes apply otherwise. */
    style: drag ? ({ left: drag.x, top: drag.y, right: "auto", bottom: "auto", touchAction: "none", userSelect: "none" } satisfies CSSProperties) : ({ touchAction: "none" } satisfies CSSProperties),
    handlers: {
      onPointerDown, onKeyDown,
      /** No native drag-and-drop or text selection while moving the launcher. */
      onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
      /** Swallows the click that ends a drag so the panel does not toggle. */
      onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); } },
    },
  };
}
