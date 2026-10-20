/**
 * Character palettes and color palettes.
 *
 * Palettes are ordered light → heavy so they double as pressure ramps:
 * the brush engine indexes them by simulated pressure.
 */

export interface CharPalette {
  id: string;
  name: string;
  chars: readonly string[];
}

/**
 * The default "Density" ramp has one glyph per pressure band (10%), so
 * every pressure step visible in the UI produces a distinct stroke weight.
 * It keeps the product spec's anchors: `.` at the lightest bands, `:` at
 * medium-low, `+` at medium, `#` at high, and `█` at maximum pressure.
 */
export const PALETTES: readonly CharPalette[] = [
  {
    id: "density",
    name: "Density",
    chars: [".", ",", ":", ";", "+", "*", "#", "%", "@", "█"],
  },
  { id: "ascii", name: "ASCII", chars: [" ", ".", ",", ":", ";", "!", "+", "*", "#", "%", "@"] },
  { id: "blocks", name: "Blocks", chars: ["░", "▒", "▓", "█"] },
  { id: "organic", name: "Organic", chars: [".", ",", "'", "`", "~", "^"] },
  {
    id: "technical",
    name: "Technical",
    chars: ["-", "/", "\\", "|", "+", "[", "]", "{", "}", "<", ">"],
  },
];

export const DEFAULT_PALETTE_INDEX = 0;

/** Curated foregrounds: readable and vibrant on a dark canvas. */
export const FG_COLORS: readonly string[] = [
  "#f8f8f2", // paper white
  "#8a8f98", // gray
  "#1a1b26", // near-black (paints on light bgs)
  "#ff5555", // red
  "#ffb86c", // orange
  "#f1fa8c", // yellow
  "#50fa7b", // green
  "#8be9fd", // cyan
  "#7aa2f7", // blue
  "#bd93f9", // purple
  "#ff79c6", // pink
  "#d4a373", // sand
];

/** Background paint colors (all dark enough to keep glyphs readable). */
export const BG_COLORS: readonly string[] = [
  "#000000",
  "#282a36",
  "#3b3f5c",
  "#5c2020",
  "#4d4420",
  "#1f3d2b",
  "#1f2d5c",
  "#3d2145",
];

/** Canvas backdrop. */
export const CANVAS_BG = "#101018";
/** Backdrop for the out-of-document margin. */
export const MARGIN_BG = "#08080c";
/** Ghost cursor highlight. */
export const GHOST_BG = "#2e3352";

export const DEFAULT_FOREGROUND = FG_COLORS[0]!;
