import type * as CesiumNS from "cesium";

export type Cesium = typeof CesiumNS;

declare global {
  interface Window { Cesium?: Cesium; CESIUM_BASE_URL?: string }
}

let pending: Promise<Cesium> | null = null;

/** Loads the Cesium bundle copied to /public/cesium (see scripts/copy-cesium.mjs) once per page. */
export function loadCesium(): Promise<Cesium> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (pending) return pending;
  window.CESIUM_BASE_URL = "/cesium/";
  pending = new Promise<Cesium>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/cesium/Widgets/widgets.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium did not initialise")));
    script.onerror = () => { pending = null; reject(new Error("Couldn't load /cesium/Cesium.js. Run `npm install` to copy Cesium into public/.")); };
    document.head.appendChild(script);
  });
  return pending;
}
