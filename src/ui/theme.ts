import { RGBA } from "@opentui/core";

/** UI chrome palette (distinct from the paint palettes in core/palettes). */
export const UI = {
  chromeBg: "#15151f",
  chromeText: "#c8ccd8",
  dim: "#5a6072",
  accent: "#7aa2f7",
  accentHot: "#ff79c6",
  danger: "#ff5555",
  ok: "#50fa7b",
} as const;

const rgbaCache = new Map<string, RGBA>();

/** Cached RGBA instances — setCell is hot, avoid re-parsing hex per cell. */
export function rgba(hex: string): RGBA {
  let color = rgbaCache.get(hex);
  if (!color) {
    color = RGBA.fromHex(hex);
    rgbaCache.set(hex, color);
  }
  return color;
}
