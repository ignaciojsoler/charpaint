import {
  FrameBufferRenderable,
  type RenderContext,
} from "@opentui/core";
import type { DrawingEngine } from "../core/engine.ts";
import { isEmptyCell } from "../core/document.ts";
import { CANVAS_BG } from "../core/palettes.ts";
import { rgba, UI } from "./theme.ts";

const FALLBACK_FG = "#3a3f55";

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreviewCell {
  char: string;
  fg: string;
  bg: string;
}

/**
 * Thumbnail of the whole document. Cells inside the canvas viewport are
 * tinted so the user can see where they are when the artwork is larger
 * than the screen.
 */
export class MiniMapView extends FrameBufferRenderable {
  private shadow: (PreviewCell | null)[] = [];

  constructor(
    ctx: RenderContext,
    private readonly engine: DrawingEngine,
    private readonly viewport: () => Viewport,
  ) {
    super(ctx, {
      id: "charpaint-preview",
      width: 16,
      height: 6,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 2,
      minHeight: 1,
      onSizeChange: () => {
        this.shadow = [];
        this.sync();
      },
    });
  }

  sync(): void {
    const fb = this.frameBuffer;
    const width = this.width;
    const height = this.height;
    if (!fb || width < 1 || height < 1) return;
    if (fb.width !== width || fb.height !== height) return; // resize in flight

    const doc = this.engine.doc;
    const vp = this.viewport();
    const needed = width * height;
    if (this.shadow.length !== needed) this.shadow = new Array(needed).fill(null);

    let wrote = false;
    for (let vy = 0; vy < height; vy++) {
      for (let vx = 0; vx < width; vx++) {
        const desired = this.sample(vx, vy, width, height, vp);
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
    if (wrote) this.requestRender();
  }

  private sample(
    vx: number,
    vy: number,
    width: number,
    height: number,
    vp: Viewport,
  ): PreviewCell {
    const doc = this.engine.doc;
    const x0 = Math.floor((vx * doc.width) / width);
    const y0 = Math.floor((vy * doc.height) / height);
    if (x0 >= doc.width || y0 >= doc.height) {
      return { char: " ", fg: FALLBACK_FG, bg: UI.previewOut };
    }

    const inside =
      x0 >= vp.x && x0 < vp.x + vp.width && y0 >= vp.y && y0 < vp.y + vp.height;
    const bg = inside ? UI.previewIn : UI.previewOut;

    const x1 = Math.min(doc.width, Math.max(x0 + 1, Math.ceil(((vx + 1) * doc.width) / width)));
    const y1 = Math.min(doc.height, Math.max(y0 + 1, Math.ceil(((vy + 1) * doc.height) / height)));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cell = doc.cells[y]?.[x];
        if (cell === undefined || isEmptyCell(cell)) continue;
        return {
          char: cell.char,
          fg: cell.foreground ?? FALLBACK_FG,
          bg: cell.background ?? CANVAS_BG,
        };
      }
    }
    return { char: " ", fg: FALLBACK_FG, bg };
  }
}
