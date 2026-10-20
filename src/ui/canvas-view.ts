import {
  FrameBufferRenderable,
  MouseButton,
  type CliRenderer,
  type MouseEvent,
  type RenderContext,
} from "@opentui/core";
import type { DrawingEngine } from "../core/engine.ts";
import { getCell, isEmptyCell } from "../core/document.ts";
import { CANVAS_BG, GHOST_BG, MARGIN_BG } from "../core/palettes.ts";
import type { Cell, Point } from "../core/types.ts";
import { rgba } from "./theme.ts";

const FALLBACK_FG = "#3a3f55";

interface ShadowCell {
  char: string;
  fg: string;
  bg: string;
}

/**
 * Bridges the renderer-agnostic DrawingEngine and OpenTUI's FrameBuffer.
 *
 * The document model stays the single source of truth; this view keeps a
 * shadow of what is currently in the native buffer and only writes cells
 * whose desired state changed, so strokes never trigger full repaints and
 * the native frame differ sees minimal work (no flicker).
 */
export class CanvasView extends FrameBufferRenderable {
  private readonly engine: DrawingEngine;
  private readonly cli: CliRenderer;
  /** Viewport origin in document coordinates. */
  private ox = 0;
  private oy = 0;
  private shadow: (ShadowCell | null)[] = [];
  private destroyed = false;

  constructor(ctx: RenderContext, cli: CliRenderer, engine: DrawingEngine) {
    super(ctx, {
      id: "charpaint-canvas",
      width: Math.max(1, engine.doc.width),
      height: Math.max(1, engine.doc.height),
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 4,
      minHeight: 2,
      onSizeChange: () => {
        // A resize clears the native buffer: drop the shadow to force a
        // full (once) repaint of the new viewport.
        this.shadow = [];
        this.sync();
      },
      onMouseDown: (event) => this.handlePointer("down", event),
      onMouseDrag: (event) => this.handlePointer("drag", event),
      onMouseUp: (event) => this.handlePointer("up", event),
      onMouseMove: (event) => this.handlePointer("move", event),
    });
    this.engine = engine;
    this.cli = cli;
    engine.subscribe(() => this.sync());
  }

  // ------------------------------------------------------------ geometry

  /** Global (render-region) origin of this renderable. */
  private globalOrigin(): Point {
    let x = 0;
    let y = 0;
    let node = this as { x: number; y: number; parent: unknown } | null;
    while (node) {
      x += node.x;
      y += node.y;
      node = (node.parent ?? null) as typeof node;
    }
    return { x, y };
  }

  private toDocument(event: MouseEvent): Point {
    const origin = this.globalOrigin();
    return {
      x: event.x - origin.x + this.ox,
      y: event.y - origin.y + this.oy,
    };
  }

  /** Scroll the viewport so a document point stays visible. */
  private ensureVisible(point: Point): void {
    const maxOx = Math.max(0, this.engine.doc.width - this.width);
    const maxOy = Math.max(0, this.engine.doc.height - this.height);
    if (point.x < this.ox) this.ox = point.x;
    if (point.x >= this.ox + this.width) this.ox = point.x - this.width + 1;
    if (point.y < this.oy) this.oy = point.y;
    if (point.y >= this.oy + this.height) this.oy = point.y - this.height + 1;
    this.ox = Math.max(0, Math.min(maxOx, this.ox));
    this.oy = Math.max(0, Math.min(maxOy, this.oy));
  }

  // -------------------------------------------------------------- pointer

  private handlePointer(kind: "down" | "drag" | "up" | "move", event: MouseEvent): void {
    const doc = this.toDocument(event);
    this.ensureVisible(doc);
    const input = {
      x: doc.x,
      y: doc.y,
      // The mouse has no pressure channel: feed the engine's simulated value.
      pressure: this.engine.pressure,
      buttons: event.button === MouseButton.LEFT ? 1 : 0,
      modifiers: {
        shift: event.modifiers.shift,
        alt: event.modifiers.alt,
        ctrl: event.modifiers.ctrl,
      },
    };

    if (kind === "down" && event.button === MouseButton.RIGHT) {
      // Right-click eyedropper from anywhere, regardless of active tool.
      event.preventDefault();
      this.engine.pickAt(doc.x, doc.y);
      this.sync();
      return;
    }

    switch (kind) {
      case "down":
        event.preventDefault(); // keep focus/selection defaults off the canvas
        this.engine.pointerDown(input);
        break;
      case "drag":
        this.engine.pointerDrag(input);
        break;
      case "up":
        this.engine.pointerUp(input);
        break;
      case "move":
        this.engine.pointerMove(input);
        break;
    }
    this.sync();
  }

  // -------------------------------------------------------------- drawing

  /** Desired visual state for one viewport cell. */
  private desiredCell(vx: number, vy: number): ShadowCell {
    const dx = vx + this.ox;
    const dy = vy + this.oy;
    const doc = this.engine.doc;
    if (dx < 0 || dy < 0 || dx >= doc.width || dy >= doc.height) {
      return { char: " ", fg: FALLBACK_FG, bg: MARGIN_BG };
    }
    const cell = getCell(doc, dx, dy)!;
    return {
      char: cell.char,
      fg: cell.foreground ?? FALLBACK_FG,
      bg: cell.background ?? CANVAS_BG,
    };
  }

  sync(): void {
    if (this.destroyed) return;
    const fb = this.frameBuffer;
    const width = this.width;
    const height = this.height;
    if (!fb || fb.width !== width || fb.height !== height) return; // resize in flight
    if (width < 1 || height < 1) return;

    const engine = this.engine;
    const ghost = engine.getGhost();
    const ghostCells = new Map<string, { cell: Cell; preview: boolean }>();
    if (ghost) {
      for (const p of ghost.points) {
        const vx = p.x - this.ox;
        const vy = p.y - this.oy;
        if (vx >= 0 && vy >= 0 && vx < width && vy < height) {
          ghostCells.set(`${vx},${vy}`, { cell: ghost.cell, preview: ghost.preview });
        }
      }
    }

    const needed = width * height;
    if (this.shadow.length !== needed) this.shadow = new Array<ShadowCell | null>(needed).fill(null);

    let wrote = false;
    for (let vy = 0; vy < height; vy++) {
      for (let vx = 0; vx < width; vx++) {
        let desired = this.desiredCell(vx, vy);

        const overlay = ghostCells.get(`${vx},${vy}`);
        if (overlay) {
          if (overlay.preview) {
            // Shape preview: real colors, exactly what committing would paint.
            desired = {
              char: overlay.cell.char,
              fg: overlay.cell.foreground ?? FALLBACK_FG,
              bg: overlay.cell.background ?? CANVAS_BG,
            };
          } else {
            // Ghost cursor: hint the stamp area without hiding existing art.
            const docCell = getCell(engine.doc, vx + this.ox, vy + this.oy);
            const painted = docCell !== undefined && !isEmptyCell(docCell);
            desired = {
              char: painted ? desired.char : overlay.cell.char,
              fg: painted ? desired.fg : (overlay.cell.foreground ?? FALLBACK_FG),
              bg: GHOST_BG,
            };
          }
        }

        const index = vy * width + vx;
        const current = this.shadow[index];
        if (
          current != null &&
          current.char === desired.char &&
          current.fg === desired.fg &&
          current.bg === desired.bg
        ) {
          continue;
        }
        fb.setCell(vx, vy, desired.char, rgba(desired.fg), rgba(desired.bg));
        this.shadow[index] = desired;
        wrote = true;
      }
    }

    // Text tool gets the real terminal cursor at the insertion point.
    const cursor = engine.textCursor;
    if (cursor !== null) {
      const origin = this.globalOrigin();
      this.cli.setCursorPosition(origin.x + cursor.x - this.ox, origin.y + cursor.y - this.oy, true);
    } else {
      this.cli.setCursorPosition(0, 0, false);
    }

    if (wrote || ghost !== null) this.requestRender();
  }

  override destroy(): void {
    this.destroyed = true;
    this.cli.setCursorPosition(0, 0, false);
    super.destroy();
  }
}
