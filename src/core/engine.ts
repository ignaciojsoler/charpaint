import { BrushEngine, clampPressure, createBrushState, type BrushState } from "./brush.ts";
import {
  countPaintedCells,
  createDocument,
  emptyCell,
  getCell,
  inBounds,
  setCell,
  cellsEqual,
} from "./document.ts";
import {
  linePoints,
  rectOutlinePoints,
  snapTo45,
  snapToSquare,
} from "./geometry.ts";
import { BG_COLORS, FG_COLORS, PALETTES } from "./palettes.ts";
import { History } from "./history.ts";
import type { Cell, CellChange, Document, PointerInput, Point, ToolId } from "./types.ts";

export const PRESSURE_STEP = 0.1;

export interface Ghost {
  points: Point[];
  cell: Cell;
  /** True when the ghost represents a committed-shape preview (line/rect drag). */
  preview: boolean;
}

/**
 * The drawing engine owns the document, the brush, undo history, and the
 * tool state machine. It is deliberately free of terminal/OpenTUI imports:
 * the UI layer feeds it PointerInput and key commands, and subscribes to
 * change notifications.
 */
export class DrawingEngine {
  readonly doc: Document;
  readonly brush: BrushState;
  readonly history: History;

  tool: ToolId = "brush";
  /** Simulated stylus pressure in [0, 1] (the mouse adapter has no real pressure). */
  pressure = 0.6;

  /** Last known pointer position in document coordinates (ghost cursor). */
  hover: Point | null = null;
  /** Active text-tool cursor, null when no text session is open. */
  textCursor: Point | null = null;

  private readonly brushEngine: BrushEngine;
  private stroke: CellChange[] | null = null;
  private dragStart: Point | null = null;
  private dragCurrent: Point | null = null;
  private dragModifiers: PointerInput["modifiers"];
  private lastStamp: Point | null = null;
  private textAnchorX = 0;
  private listeners = new Set<() => void>();

  constructor(width = 80, height = 24) {
    this.doc = createDocument(width, height);
    this.brush = createBrushState();
    this.brushEngine = new BrushEngine(this.brush);
    this.history = new History();
  }

  // ------------------------------------------------------------- events

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  // ------------------------------------------------------------ strokes

  private beginStroke(): void {
    if (this.stroke === null) this.stroke = [];
  }

  private endStroke(): void {
    if (this.stroke !== null) {
      this.history.push(this.stroke);
      this.stroke = null;
    }
  }

  private writeCell(x: number, y: number, cell: Cell): void {
    if (!inBounds(this.doc, x, y)) return;
    const before = getCell(this.doc, x, y);
    if (before === undefined || cellsEqual(before, cell)) return;
    setCell(this.doc, x, y, cell);
    this.stroke?.push({ x, y, before, after: cell });
  }

  // ------------------------------------------------------------- pointer

  pointerDown(input: PointerInput): void {
    const point = { x: input.x, y: input.y };
    this.hover = point;

    switch (this.tool) {
      case "brush":
      case "eraser":
        this.beginStroke();
        this.lastStamp = point;
        this.stampAt(input);
        break;

      case "line":
      case "rect":
        this.dragStart = point;
        this.dragCurrent = point;
        this.dragModifiers = input.modifiers;
        break;

      case "text":
        // Clicking elsewhere commits the current session and starts a new one.
        this.commitText();
        this.beginStroke();
        this.textCursor = point;
        this.textAnchorX = point.x;
        break;

      case "picker":
        this.pickAt(point.x, point.y);
        break;
    }
    this.emit();
  }

  pointerDrag(input: PointerInput): void {
    const point = { x: input.x, y: input.y };
    this.hover = point;

    switch (this.tool) {
      case "brush":
      case "eraser": {
        if (this.stroke === null) this.beginStroke();
        const from = this.lastStamp ?? point;
        // Interpolate so fast drags never leave gaps. Skip the first point:
        // it was stamped by the previous sample already.
        const segment = linePoints(from.x, from.y, point.x, point.y);
        for (let i = from === point ? 0 : 1; i < segment.length; i++) {
          const p = segment[i]!;
          this.stampAt({ ...input, x: p.x, y: p.y });
        }
        this.lastStamp = point;
        break;
      }

      case "line":
      case "rect":
        if (this.dragStart) {
          this.dragCurrent = point;
          this.dragModifiers = input.modifiers;
        }
        break;

      case "text":
      case "picker":
        break;
    }
    this.emit();
  }

  pointerMove(input: PointerInput): void {
    this.hover = { x: input.x, y: input.y };
    this.emit();
  }

  pointerUp(input: PointerInput): void {
    const point = { x: input.x, y: input.y };
    this.hover = point;

    switch (this.tool) {
      case "brush":
      case "eraser":
        this.endStroke();
        this.lastStamp = null;
        break;

      case "line":
      case "rect": {
        if (this.dragStart) {
          const shape = this.shapePoints(this.dragStart, point, input.modifiers);
          this.beginStroke();
          const cell = this.brushEngine.resolveCell(input, false);
          for (const p of shape) this.writeCell(p.x, p.y, cell);
          this.endStroke();
        }
        this.dragStart = null;
        this.dragCurrent = null;
        break;
      }

      case "text":
      case "picker":
        break;
    }
    this.emit();
  }

  private stampAt(input: PointerInput): void {
    const erase = this.tool === "eraser";
    const cell = this.brushEngine.resolveCell(input, erase);
    for (const p of this.brushEngine.stamp({ x: input.x, y: input.y })) {
      this.writeCell(p.x, p.y, cell);
    }
  }

  private shapePoints(from: Point, to: Point, modifiers: PointerInput["modifiers"]): Point[] {
    let end = to;
    if (modifiers?.shift) {
      end = this.tool === "line" ? snapTo45(from, to) : snapToSquare(from, to);
    }
    return this.tool === "line"
      ? linePoints(from.x, from.y, end.x, end.y)
      : rectOutlinePoints(from.x, from.y, end.x, end.y);
  }

  // ----------------------------------------------------------- text tool

  typeChar(char: string): void {
    if (this.tool !== "text" || this.textCursor === null) return;
    const cell: Cell = { char };
    cell.foreground = this.brush.foreground;
    if (this.brush.background !== null) cell.background = this.brush.background;
    this.writeCell(this.textCursor.x, this.textCursor.y, cell);
    if (this.textCursor.x + 1 < this.doc.width) this.textCursor = { x: this.textCursor.x + 1, y: this.textCursor.y };
    this.emit();
  }

  textBackspace(): void {
    if (this.tool !== "text" || this.textCursor === null) return;
    if (this.textCursor.x > this.textAnchorX) {
      this.textCursor = { x: this.textCursor.x - 1, y: this.textCursor.y };
      this.writeCell(this.textCursor.x, this.textCursor.y, emptyCell());
      this.emit();
    }
  }

  textNewline(): void {
    if (this.tool !== "text" || this.textCursor === null) return;
    if (this.textCursor.y + 1 < this.doc.height) {
      this.textCursor = { x: this.textAnchorX, y: this.textCursor.y + 1 };
      this.emit();
    }
  }

  /** End the current text session, sealing its undo batch. */
  commitText(): void {
    if (this.textCursor !== null) {
      this.textCursor = null;
      this.endStroke();
      this.emit();
    }
  }

  // -------------------------------------------------------------- picker

  /**
   * Eyedropper: adopt the character and colors of a painted cell.
   * Returns true when something was picked. Switches back to the brush.
   */
  pickAt(x: number, y: number): boolean {
    const cell = getCell(this.doc, x, y);
    if (!cell || (cell.char === " " && cell.foreground === undefined)) return false;
    if (cell.char !== " ") this.brush.fixedChar = cell.char;
    if (cell.foreground !== undefined) this.brush.foreground = cell.foreground;
    if (cell.background !== undefined) this.brush.background = cell.background;
    if (this.tool === "picker") this.tool = "brush";
    return true;
  }

  // ------------------------------------------------------------ commands

  setTool(tool: ToolId): void {
    if (tool === this.tool) return;
    this.commitText();
    this.tool = tool;
    this.dragStart = null;
    this.dragCurrent = null;
    this.emit();
  }

  adjustPressure(delta: number): void {
    this.pressure = clampPressure(this.pressure + delta);
    this.emit();
  }

  setSize(size: number): void {
    this.brush.size = Math.max(1, Math.min(4, Math.round(size)));
    this.emit();
  }

  cyclePalette(direction: 1 | -1): void {
    const n = PALETTES.length;
    this.brush.paletteIndex = (this.brush.paletteIndex + direction + n) % n;
    this.brush.fixedChar = null;
    this.emit();
  }

  /** Step through the active palette's characters; selects a fixed char. */
  cycleChar(direction: 1 | -1): void {
    const chars = this.brushEngine.palette.chars;
    const current = this.brush.fixedChar;
    const index = current === null ? -1 : chars.indexOf(current);
    const next = index === -1 ? (direction === 1 ? 0 : chars.length - 1) : (index + direction + chars.length) % chars.length;
    this.brush.fixedChar = chars[next] ?? null;
    this.emit();
  }

  /** Return to pressure-driven density mode. */
  clearFixedChar(): void {
    this.brush.fixedChar = null;
    this.emit();
  }

  cycleForeground(direction: 1 | -1): void {
    const n = FG_COLORS.length;
    const index = FG_COLORS.indexOf(this.brush.foreground);
    this.brush.foreground = FG_COLORS[(index + direction + n) % n] ?? FG_COLORS[0]!;
    this.emit();
  }

  cycleBackground(direction: 1 | -1): void {
    // Slot 0 means "no background paint" (canvas default).
    const options: (string | null)[] = [null, ...BG_COLORS];
    const n = options.length;
    const index = options.indexOf(this.brush.background);
    this.brush.background = options[(index + direction + n) % n] ?? null;
    this.emit();
  }

  setForeground(color: string): void {
    this.brush.foreground = color;
    this.emit();
  }

  setBackground(color: string | null): void {
    this.brush.background = color;
    this.emit();
  }

  undo(): void {
    this.commitText();
    if (this.history.undo(this.doc)) this.emit();
  }

  redo(): void {
    this.commitText();
    if (this.history.redo(this.doc)) this.emit();
  }

  clearCanvas(): void {
    this.commitText();
    this.beginStroke();
    for (let y = 0; y < this.doc.height; y++) {
      for (let x = 0; x < this.doc.width; x++) {
        this.writeCell(x, y, emptyCell());
      }
    }
    this.endStroke();
    this.emit();
  }

  // -------------------------------------------------------------- status

  get isModified(): boolean {
    return countPaintedCells(this.doc) > 0;
  }

  /** The cell the brush would paint right now (for previews and status). */
  resolvedBrushCell(): Cell {
    return this.brushEngine.resolveCell(
      { x: 0, y: 0, pressure: this.pressure, buttons: 1 },
      this.tool === "eraser",
    );
  }

  /** Transient overlay for the renderer: shape preview or brush ghost. */
  getGhost(): Ghost | null {
    if (
      (this.tool === "line" || this.tool === "rect") &&
      this.dragStart !== null &&
      this.dragCurrent !== null
    ) {
      return {
        points: this.shapePoints(this.dragStart, this.dragCurrent, this.dragModifiers),
        cell: this.brushEngine.resolveCell(
          { x: 0, y: 0, pressure: this.pressure, buttons: 1 },
          false,
        ),
        preview: true,
      };
    }

    if (this.hover !== null && this.tool !== "text" && this.textCursor === null) {
      const points =
        this.tool === "picker"
          ? [{ ...this.hover }]
          : this.brushEngine.stamp(this.hover);
      return {
        points,
        cell: this.brushEngine.resolveCell(
          { x: 0, y: 0, pressure: this.pressure, buttons: 1 },
          this.tool === "eraser",
        ),
        preview: false,
      };
    }

    return null;
  }
}
