import type { Cell } from "./types.ts";

/**
 * Demo artwork: a pixel-art cat encoded as rows of palette keys.
 * Each key maps to a foreground color; "." cells stay empty.
 * The art is 40×20 cells so it fits the default 80×24 document.
 */
export interface ArtSpec {
  rows: readonly string[];
  /** Palette key → hex foreground color. */
  colors: Record<string, string>;
  /** Glyph used for every painted cell (default: full block). */
  char?: string;
}

/**
 * The cat. Legend:
 *   `#` outline · `O` orange · `o` dark orange · `L` cream
 *   `B` eye black · `W` eye highlight · `P` nose pink
 */
export const CAT_ART: ArtSpec = {
  char: "█",
  colors: {
    "#": "#1f1410", // outline: dark brown-black
    O: "#f08c1e", // orange fur
    o: "#c96a12", // dark orange: stripes, inner ears, shadow
    L: "#fbc97c", // cream: muzzle, chest, paws
    B: "#0b0b0f", // eyes
    W: "#ffffff", // eye highlights
    P: "#ff7aa8", // nose
  },
  rows: [
    "..##................................##..",
    "..#O#..............................#O#..",
    "..#Oo#............................#oO#..",
    "..#Ooo#..........................#ooO#..",
    "..#Oooo#........................#oooO#..",
    "..#Ooooo#......................#ooooO#..",
    "..####################################..",
    "..#OOOOOOOOOOOOOooOOOOooOOOOOOOOOOOOO#..",
    "..#OOOOOOOOOOOOOooOOOOooOOOOOOOOOOOOO#..",
    "..#OOOOOBWWBBOOOOOOOOOOOOOOBWWBBOOOOO#..",
    "..#OOOOOBBBBBOOOOOOOOOOOOOOBBBBBOOOOO#..",
    "..#OOOOOOOOOOOOOLLLLLLLLOOOOOOOOOOOOO#..",
    "#######OOOOOOOOOLLLPPLLLOOOOOOOOO#######",
    ".######OOOOOOOOOLLLL##LLLLOOOOOOOOO#####",
    "....################################....",
    "........#OOOOOOOOOOOOOOOOOOOOOO#........",
    "........#OOOOOOOOOOOOOOOOOOOOOO#........",
    "........#OOOOOLLLLLLLLLLLLOOOOO#........",
    "........#OOOLLLLLOOOOOOLLLLLOOO#........",
    "........########################........",
  ],
};

export interface ArtCell {
  x: number;
  y: number;
  cell: Cell;
}

/** Expand an ArtSpec into positioned cells with the given origin. */
export function artToCells(art: ArtSpec, originX: number, originY: number): ArtCell[] {
  const char = art.char ?? "█";
  const out: ArtCell[] = [];
  for (let dy = 0; dy < art.rows.length; dy++) {
    const row = art.rows[dy]!;
    for (let dx = 0; dx < row.length; dx++) {
      const key = row[dx]!;
      if (key === ".") continue;
      const color = art.colors[key];
      if (color === undefined) {
        throw new Error(`ArtSpec: no color mapped for key ${JSON.stringify(key)}`);
      }
      out.push({
        x: originX + dx,
        y: originY + dy,
        cell: { char, foreground: color },
      });
    }
  }
  return out;
}

export function artSize(art: ArtSpec): { width: number; height: number } {
  return {
    width: Math.max(...art.rows.map((r) => r.length)),
    height: art.rows.length,
  };
}

/** Top-left origin that centers the art on a document of the given size. */
export function centerOrigin(art: ArtSpec, width: number, height: number): { x: number; y: number } {
  const size = artSize(art);
  return {
    x: Math.max(0, Math.floor((width - size.width) / 2)),
    y: Math.max(0, Math.floor((height - size.height) / 2)),
  };
}
