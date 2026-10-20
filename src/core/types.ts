/**
 * CHARPAINT core types.
 *
 * This module is intentionally free of any terminal/renderer imports so the
 * whole drawing core stays testable under plain Node + Vitest.
 */

/** A single character cell on the document grid. */
export interface Cell {
  /** Single grapheme occupying one terminal column. */
  char: string;
  /** Hex color (e.g. "#ff5555"). Undefined = terminal/canvas default. */
  foreground?: string;
  /** Hex color. Undefined = canvas default background. */
  background?: string;
}

/** The document is a plain two-dimensional character grid. */
export interface Document {
  width: number;
  height: number;
  /** Row-major cells: `cells[y][x]`. */
  cells: Cell[][];
}

/**
 * Renderer-agnostic pointer input for the brush engine.
 *
 * Mouse adapters synthesize `pressure` (see the pressure simulator); future
 * tablet adapters can fill in real pressure/tilt without touching the engine.
 */
export interface PointerInput {
  x: number;
  y: number;
  /** Normalized pressure in [0, 1]. */
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  /** Button bitmask; bit 0 (1) = primary button. */
  buttons: number;
  /** Optional modifier keys reported by the input adapter. */
  modifiers?: {
    shift?: boolean;
    alt?: boolean;
    ctrl?: boolean;
  };
}

export interface Point {
  x: number;
  y: number;
}

export type ToolId = "brush" | "eraser" | "line" | "rect" | "text" | "picker";

export const TOOL_LABELS: Record<ToolId, string> = {
  brush: "BRUSH",
  eraser: "ERASE",
  line: "LINE",
  rect: "RECT",
  text: "TEXT",
  picker: "PICK",
};

/** One cell mutation, used for undo/redo bookkeeping. */
export interface CellChange {
  x: number;
  y: number;
  before: Cell;
  after: Cell;
}
