import { emptyCell } from "./document.ts";
import { stampOffsets } from "./geometry.ts";
import { DEFAULT_FOREGROUND, DEFAULT_PALETTE_INDEX, PALETTES } from "./palettes.ts";
import type { Cell, PointerInput, Point } from "./types.ts";

export interface BrushState {
  /** Index into PALETTES. */
  paletteIndex: number;
  /**
   * When set, the brush always paints this character and pressure only
   * affects colors nothing. When null, pressure indexes the active palette
   * ramp (density mode).
   */
  fixedChar: string | null;
  /** 1..MAX_BRUSH_SIZE. */
  size: number;
  /** Hex foreground. */
  foreground: string;
  /** Hex background, or null for the canvas default. */
  background: string | null;
}

export function createBrushState(): BrushState {
  return {
    paletteIndex: DEFAULT_PALETTE_INDEX,
    fixedChar: null,
    size: 1,
    foreground: DEFAULT_FOREGROUND,
    background: null,
  };
}

export function clampPressure(pressure: number): number {
  if (Number.isNaN(pressure)) return 0;
  return Math.min(1, Math.max(0, pressure));
}

/**
 * Map normalized pressure onto a palette ramp.
 *
 * The ramp is divided into `chars.length` equal bands; pressure 1 always
 * lands on the heaviest glyph. With the default Density palette this gives
 * the spec mapping: <0.2 `.`, <0.4 `:`, <0.6 `+`, <0.8 `#`, otherwise `█`.
 */
export function pressureToChar(pressure: number, chars: readonly string[]): string {
  if (chars.length === 0) return "#";
  const p = clampPressure(pressure);
  const index = Math.min(chars.length - 1, Math.floor(p * chars.length));
  return chars[index] ?? chars[chars.length - 1] ?? "#";
}

/**
 * The brush engine turns abstract pointer input into concrete cells.
 *
 * It knows nothing about mice or tablets — adapters feed it PointerInput
 * and it resolves characters (via pressure), colors, and stamp shapes.
 * A future tablet adapter only needs to deliver real `pressure`/`tilt`.
 */
export class BrushEngine {
  constructor(readonly state: BrushState = createBrushState()) {}

  get palette() {
    return PALETTES[this.state.paletteIndex] ?? PALETTES[0]!;
  }

  /** The character a pointer sample with this pressure would paint. */
  resolveChar(pressure: number): string {
    if (this.state.fixedChar !== null) return this.state.fixedChar;
    return pressureToChar(pressure, this.palette.chars);
  }

  /** The full cell a pointer sample would paint (or erase). */
  resolveCell(input: PointerInput, erase: boolean): Cell {
    if (erase) return emptyCell();
    const cell: Cell = { char: this.resolveChar(input.pressure) };
    cell.foreground = this.state.foreground;
    if (this.state.background !== null) cell.background = this.state.background;
    return cell;
  }

  /** All offsets covered by the brush stamp at the current size. */
  stamp(center: Point): Point[] {
    return stampOffsets(this.state.size).map((o) => ({
      x: center.x + o.x,
      y: center.y + o.y,
    }));
  }
}
