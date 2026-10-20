import { RGBA } from "@opentui/core";

/** UI chrome palette (distinct from the paint palettes in core/palettes). */
export const UI = {
  /** App backdrop, behind every panel. */
  bg: "#0d0e15",
  /** Panel fill. */
  panelBg: "#131521",
  /** Panel borders. */
  border: "#272b3d",
  /** Highlighted border (canvas, active panel). */
  borderActive: "#4d6aa8",
  /** Primary chrome text. */
  chromeText: "#d7dbea",
  /** Secondary text. */
  textMuted: "#9aa0b8",
  /** De-emphasized text, key hints. */
  dim: "#626884",
  accent: "#7aa2f7",
  accentHot: "#ff79c6",
  danger: "#ff6b6b",
  ok: "#69e39a",
  /** Selection background for rows and chips. */
  selectionBg: "#27304b",
  /** Hover background for clickable rows. */
  hoverBg: "#1b1e2d",
  /** Faint dot grid on empty canvas cells. */
  gridDot: "#1a1c28",
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
