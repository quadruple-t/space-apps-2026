/**
 * False-colour ramps for single-band (grayscale) globe imagery.
 *
 * The stored snapshots stay byte-identical (they are served and cached by checksum);
 * colour is applied in the browser after the verified image has decoded.
 */

/** Ramp stops as [position 0–1, CSS hex colour], in ascending position order. */
export type ColorRamp = readonly (readonly [number, string])[];

/** CSS gradient that matches the ramp exactly, for legends. */
export const rampCss = (ramp: ColorRamp) =>
  `linear-gradient(90deg,${ramp.map(([at, color]) => `${color} ${Math.round(at * 100)}%`).join(",")})`;

const hex = (color: string) => {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** 256-entry RGB lookup table (768 bytes) interpolated linearly between ramp stops. */
export function rampLut(ramp: ColorRamp): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  const stops = ramp.map(([at, color]) => [at, hex(color)] as const);
  for (let v = 0; v < 256; v++) {
    const t = v / 255;
    let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const [a, ca] = stops[j], [b, cb] = stops[Math.min(j + 1, stops.length - 1)];
    const f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
    for (let c = 0; c < 3; c++) lut[v * 3 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * f);
  }
  return lut;
}

/**
 * Recolour RGBA pixels in place: each pixel's gray level indexes the ramp.
 * Alpha is untouched, so transparent no-data areas stay transparent.
 */
export function colorizePixels(data: Uint8ClampedArray, lut: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const v = ((data[i] + data[i + 1] + data[i + 2]) / 3) | 0;
    data[i] = lut[v * 3]; data[i + 1] = lut[v * 3 + 1]; data[i + 2] = lut[v * 3 + 2];
  }
}

/** Draw a decoded image to a canvas and apply the ramp. Cesium accepts the canvas as imagery. */
export function colorizeImage(image: CanvasImageSource & { width: number; height: number }, ramp: ColorRamp): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to colour the map image");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  colorizePixels(pixels.data, rampLut(ramp));
  context.putImageData(pixels, 0, 0);
  return canvas;
}
