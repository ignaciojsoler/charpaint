import {
  BoxRenderable,
  MouseButton,
  TextRenderable,
  bold,
  dim,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
  type RenderContext,
} from "@opentui/core";
import { DrawingEngine, PRESSURE_STEP } from "../core/engine.ts";
import { BG_COLORS, FG_COLORS, PALETTES } from "../core/palettes.ts";
import { CAT_ART, artToCells, centerOrigin } from "../core/demo-art.ts";
import { TOOL_LABELS, type ToolId } from "../core/types.ts";
import { CanvasView } from "./canvas-view.ts";
import { UI } from "./theme.ts";

const TOOL_KEYS: Record<string, ToolId> = {
  b: "brush",
  e: "eraser",
  l: "line",
  r: "rect",
  t: "text",
  i: "picker",
};

const SHORTCUT_HINT =
  "b brush · e erase · l line · r rect · t text · i pick · tab palette · [ ] char · p density on/off · " +
  "-/+ pressure · 1-4 size · f/F fg · g/G bg · u/^z undo · U/^y redo · c clear · C cat · q quit";

/**
 * Application shell: header, canvas, status bar, and all input wiring.
 * Owns no drawing logic — it adapts terminal input into engine calls.
 */
export class CharpaintApp {
  private readonly engine: DrawingEngine;
  private readonly renderer: CliRenderer;
  private readonly canvas: CanvasView;
  private readonly header: TextRenderable;
  private readonly stateLine: TextRenderable;

  constructor(renderer: CliRenderer, width = 80, height = 24) {
    this.renderer = renderer;
    this.engine = new DrawingEngine(width, height);

    const ctx: RenderContext = renderer;

    const layout = new BoxRenderable(ctx, {
      id: "charpaint-root",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: UI.chromeBg,
    });

    this.header = new TextRenderable(ctx, {
      id: "charpaint-header",
      height: 1,
      flexShrink: 0,
      bg: UI.chromeBg,
      selectable: false,
    });
    layout.add(this.header);

    this.canvas = new CanvasView(ctx, renderer, this.engine);
    layout.add(this.canvas);

    const status = new BoxRenderable(ctx, {
      id: "charpaint-status",
      height: 3,
      flexShrink: 0,
      flexDirection: "column",
      backgroundColor: UI.chromeBg,
    });

    this.stateLine = new TextRenderable(ctx, {
      id: "charpaint-state",
      height: 1,
      selectable: false,
    });
    status.add(this.stateLine);

    status.add(this.buildSwatchRow(ctx));

    const keysLine = new TextRenderable(ctx, {
      id: "charpaint-keys",
      height: 1,
      selectable: false,
      content: t`${dim(SHORTCUT_HINT)}`,
    });
    status.add(keysLine);

    layout.add(status);
    renderer.root.add(layout);

    renderer.keyInput.on("keypress", this.onKey);
    renderer.once("destroy", () => {
      renderer.keyInput.off("keypress", this.onKey);
    });

    this.engine.subscribe(() => this.refreshChrome());
    this.refreshChrome();
    this.canvas.sync();
  }

  // ------------------------------------------------------------ swatches

  private buildSwatchRow(ctx: RenderContext): BoxRenderable {
    const row = new BoxRenderable(ctx, {
      id: "charpaint-swatches",
      height: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: UI.chromeBg,
    });

    row.add(
      new TextRenderable(ctx, { height: 1, selectable: false, content: t`${dim(" FG ")}` }),
    );
    for (const color of FG_COLORS) {
      row.add(this.swatch(ctx, color, (button) => {
        if (button === MouseButton.RIGHT) this.engine.setBackground(color);
        else this.engine.setForeground(color);
      }));
    }

    row.add(
      new TextRenderable(ctx, { height: 1, selectable: false, content: t`${dim("  BG ")}` }),
    );
    // "No background" swatch first.
    const none = new TextRenderable(ctx, {
      height: 1,
      selectable: false,
      content: t`${fg(UI.dim)("∅ ")}`,
      onMouseDown: (event) => {
        this.engine.setBackground(null);
        event.stopPropagation();
      },
    });
    row.add(none);
    for (const color of BG_COLORS) {
      row.add(this.swatch(ctx, color, () => this.engine.setBackground(color)));
    }

    return row;
  }

  private swatch(
    ctx: RenderContext,
    color: string,
    onClick: (button: number) => void,
  ): BoxRenderable {
    return new BoxRenderable(ctx, {
      width: 2,
      height: 1,
      backgroundColor: color,
      onMouseDown: (event) => {
        event.stopPropagation();
        onClick(event.button);
      },
    });
  }

  // --------------------------------------------------------------- chrome

  private refreshChrome(): void {
    const engine = this.engine;
    const palette = PALETTES[engine.brush.paletteIndex]!;
    const activeChar = engine.resolvedBrushCell().char;
    const charMode = engine.brush.fixedChar === null ? "auto" : "fixed";

    this.header.content = t`${fg(UI.accent)(bold("▞ CHARPAINT"))}  ${dim(
      `${engine.doc.width}×${engine.doc.height}`,
    )}  ${fg(UI.chromeText)(TOOL_LABELS[engine.tool])}${
      engine.isModified ? fg(UI.danger)("  ●") : ""
    }`;

    const pressurePct = Math.round(engine.pressure * 100);
    const filled = Math.round(engine.pressure * 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    const displayChar = activeChar === " " ? "␣" : activeChar;

    this.stateLine.content = t`${dim("Char ")}${fg(UI.accentHot)(bold(`[${displayChar}]`))}${dim(
      ` ${charMode}`,
    )}  ${dim("Palette")} ${fg(UI.chromeText)(palette.name)}  ${dim("Size")} ${fg(
      UI.chromeText,
    )(String(engine.brush.size))}  ${dim("Pressure")} ${fg(UI.accent)(bar)} ${fg(UI.chromeText)(
      `${pressurePct}%`,
    )}  ${dim("FG")} ${fg(engine.brush.foreground)("■")}${dim(engine.brush.foreground)}  ${dim(
      "BG",
    )} ${
      engine.brush.background === null ? dim("·") : fg(engine.brush.background)("■")
    }${dim(engine.brush.background ?? "none")}`;
  }

  // ---------------------------------------------------------------- keys

  private readonly onKey = (key: KeyEvent): void => {
    const engine = this.engine;

    // An open text session captures printable input before global shortcuts.
    if (engine.tool === "text" && engine.textCursor !== null) {
      if (key.name === "escape") {
        engine.commitText();
        return;
      }
      if (key.name === "return") {
        engine.textNewline();
        return;
      }
      if (key.name === "backspace") {
        engine.textBackspace();
        return;
      }
      if (!key.ctrl && !key.meta) {
        if (key.name === "space") {
          engine.typeChar(" ");
          return;
        }
        if (key.sequence && [...key.sequence].length === 1) {
          engine.typeChar(key.sequence);
          return;
        }
      }
    }

    if (key.ctrl) {
      if (key.name === "z") engine.undo();
      else if (key.name === "y") engine.redo();
      return;
    }

    switch (key.name) {
      case "q":
        this.renderer.destroy();
        return;
      case "b":
      case "e":
      case "l":
      case "r":
      case "t":
      case "i":
        engine.setTool(TOOL_KEYS[key.name]!);
        return;
      case "escape":
        engine.commitText();
        return;
      case "tab":
        engine.cyclePalette(key.shift ? -1 : 1);
        return;
      case "[":
        engine.cycleChar(-1);
        return;
      case "]":
        engine.cycleChar(1);
        return;
      case "p":
        engine.clearFixedChar();
        return;
      case "-":
        engine.adjustPressure(-PRESSURE_STEP);
        return;
      case "=":
      case "+":
        engine.adjustPressure(PRESSURE_STEP);
        return;
      case "1":
      case "2":
      case "3":
      case "4":
        engine.setSize(Number(key.name));
        return;
      case "f":
        engine.cycleForeground(key.shift ? -1 : 1);
        return;
      case "g":
        engine.cycleBackground(key.shift ? -1 : 1);
        return;
      case "u":
        if (key.shift) engine.redo();
        else engine.undo();
        return;
      case "c":
        if (key.shift) {
          // Demo artwork: stamp the cat, centered, as one undoable stroke.
          const origin = centerOrigin(CAT_ART, engine.doc.width, engine.doc.height);
          engine.stampCells(artToCells(CAT_ART, origin.x, origin.y));
        } else {
          engine.clearCanvas();
        }
        return;
    }
  };
}
