/** Screen position of the selected site, published by the globe every rendered frame. */
export type Anchor = { x: number; y: number; visible: boolean } | null;

const listeners = new Set<(a: Anchor) => void>();

export function subscribeAnchor(fn: (a: Anchor) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function publishAnchor(a: Anchor) {
  listeners.forEach((fn) => fn(a));
}
