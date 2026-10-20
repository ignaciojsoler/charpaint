import {
  BoxRenderable,
  TextRenderable,
  bold,
  dim,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
  type RenderContext,
  type Renderable,
} from "@opentui/core";
import { DrawingEngine, PRESSURE_STEP } from "../core/engine.ts";
import { PALETTES } from "../core/palettes.ts";
import { CAT_ART, artToCells, centerOrigin } from "../core/demo-art.ts";
import { TOOL_LABELS, type ToolId } from "../core/types.ts";
import { CanvasView } from "./canvas-view.ts";
import { ActionsPanel, BrushPanel, ToolsPanel } from "./left-panel.ts";
import { CharsPanel, ColorsPanel } from "./right-panel.ts";
import { panel } from "./layout.ts";
import { UI } from "./theme.ts";

const TOOL_KEYS: Record<string, ToolId> = {
  b: "brush",
  e: "eraser",
  l: "line",
  r: "rect",
  t: "text",
  i: "picker",
};

const LEFT_WIDTH = 18;
const RIGHT_WIDTH = 18;
/** Root border (top + bottom). */
const ROOT_BORDER = 2;
/** Status bar rows. */
const STATUS_ROWS = 2;
/** Canvas panel border (top + bottom). */
const CANVAS_BORDER = 2;

/** Below this width the tool column is hidden; below the next, both. */
const FULL_MIN_WIDTH = 78;
const RIGHT_ONLY_MIN_WIDTH = 56;

const ACTIONS_MIN_BODY = 14;
const BRUSH_MIN_BODY = 20;
const COLORS_MIN_BODY = 12;

const HELP = `TOOLS
  B Brush        E Eraser
  L Line         R Rect
  T Text         I Picker

BRUSH
  [ ] glyph        P density mode
  - = pressure     1-4 size
  Tab palette      F / G fg / bg

EDIT / VIEW
  ^Z / U undo      ^Y / ⇧U redo
  C clear          ⇧C demo cat
  Arrows pan       drag to paint
  ? / H help       Q quit`;

const HELP_COMPACT = `TOOLS   B brush  E eraser  L line  R rect
        T text   I picker
BRUSH   P density  [ ] glyph  - = pressure
        1-4 size  Tab palette  F/G colors
VIEW    ^Z undo  ^Y redo  C clear  ⇧C cat
        Arrows pan  drag paint  Q quit`;

/**
 * Application shell: tool/brush sidebars, canvas, character and color
 * sidebars, and status bar. Owns no drawing logic — it adapts terminal input
 * into engine calls.
 */
export interface CharpaintOptions {
  /**
   * Adaptive canvas: grow the document to fill the available canvas area
   * and follow terminal enlargement. Shrinking never destroys content; the
   * viewport pans with the arrow keys instead.
   */
  autoGrow?: boolean;
}

export class CharpaintApp {
  private readonly engine: DrawingEngine;
  private readonly renderer: CliRenderer;
  private readonly canvas: CanvasView;
  private readonly autoGrow: boolean;

  private readonly body: BoxRenderable;
  private readonly leftColumn: BoxRenderable;
  private readonly rightColumn: BoxRenderable;
  private readonly canvasPanel: BoxRenderable;
  private readonly tools: ToolsPanel;
  private readonly actions: ActionsPanel;
  private readonly brush: BrushPanel;
  private readonly chars: CharsPanel;
  private readonly colors: ColorsPanel;

  private readonly stateLine: TextRenderable;
  private readonly hintsLine: TextRenderable;
  private readonly helpOverlay: BoxRenderable;
  private helpBox!: BoxRenderable;
  private helpText!: TextRenderable;
  private helpVisible = false;
  private layoutKey = "";

  constructor(
    renderer: CliRenderer,
    width = 80,
    height = 24,
    options: CharpaintOptions = {},
  ) {
    this.renderer = renderer;
    this.engine = new DrawingEngine(width, height);
    this.autoGrow = options.autoGrow ?? false;

    const ctx: RenderContext = renderer;
    const engine = this.engine;

    const root = new BoxRenderable(ctx, {
      id: "charpaint-root",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: UI.bg,
      border: true,
      borderStyle: "rounded",
      borderColor: UI.border,
      title: " ▞ CHARPAINT ",
      titleColor: UI.accent,
    });

    this.body = new BoxRenderable(ctx, {
      id: "charpaint-body",
      flexGrow: 1,
      flexDirection: "row",
      backgroundColor: UI.bg,
    });

    this.leftColumn = new BoxRenderable(ctx, {
      id: "left-column",
      width: LEFT_WIDTH,
      flexShrink: 0,
      flexDirection: "column",
      backgroundColor: UI.bg,
    });

    this.tools = new ToolsPanel(ctx, engine);
    this.actions = new ActionsPanel(ctx, {
      undo: () => engine.undo(),
      redo: () => engine.redo(),
      clear: () => engine.clearCanvas(),
      stampCat: () => this.stampCat(),
    });
    this.brush = new BrushPanel(ctx, engine);

    this.canvasPanel = panel(ctx, {
      id: "canvas-panel",
      title: " Canvas ",
      flexGrow: 1,
      borderColor: UI.borderActive,
    });
    this.canvas = new CanvasView(ctx, renderer, engine);
    this.canvasPanel.add(this.canvas);

    this.rightColumn = new BoxRenderable(ctx, {
      id: "right-column",
      width: RIGHT_WIDTH,
      flexShrink: 0,
      flexDirection: "column",
      backgroundColor: UI.bg,
    });

    this.chars = new CharsPanel(ctx, engine);
    this.colors = new ColorsPanel(ctx, engine);

    const status = new BoxRenderable(ctx, {
      id: "charpaint-status",
      height: STATUS_ROWS,
      flexShrink: 0,
      flexDirection: "column",
      backgroundColor: UI.bg,
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.stateLine = new TextRenderable(ctx, {
      id: "charpaint-state",
      height: 1,
      flexShrink: 0,
      selectable: false,
      truncate: true,
    });
    const hints = new BoxRenderable(ctx, {
      id: "charpaint-hints",
      height: 1,
      flexShrink: 0,
      flexDirection: "row",
    });
    this.hintsLine = new TextRenderable(ctx, {
      id: "charpaint-hints-text",
      height: 1,
      flexGrow: 1,
      selectable: false,
      truncate: true,
    });
    const helpHint = new TextRenderable(ctx, {
      id: "charpaint-help-hint",
      height: 1,
      flexShrink: 0,
      selectable: false,
      content: t`${fg(UI.accent)("?")}${dim(" help")}`,
      onMouseDown: (event) => {
        event.stopPropagation();
        this.setHelp(true);
      },
    });
    hints.add(this.hintsLine);
    hints.add(helpHint);
    status.add(this.stateLine);
    status.add(hints);

    this.helpOverlay = this.buildHelp(ctx);

    root.add(this.body);
    root.add(status);
    root.add(this.helpOverlay);
    renderer.root.add(root);

    engine.subscribe(() => this.refreshChrome());
    renderer.keyInput.on("keypress", this.onKey);
    renderer.on("resize", this.onRendererResize);
    renderer.once("destroy", () => {
      renderer.keyInput.off("keypress", this.onKey);
      renderer.off("resize", this.onRendererResize);
    });

    this.applyResponsive();
    this.sizeFrames();
    if (this.autoGrow) this.fitToAvailable();
    this.refreshChrome();
    this.canvas.sync();
  }

  // -------------------------------------------------------------- layout

  private buildHelp(ctx: RenderContext): BoxRenderable {
    const overlay = new BoxRenderable(ctx, {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20,
      visible: false,
      shouldFill: false,
    });
    overlay.onMouseDown = (event) => {
      event.stopPropagation();
      this.setHelp(false);
    };

    const box = new BoxRenderable(ctx, {
      id: "help-box",
      width: 46,
      height: 21,
      flexDirection: "column",
      border: true,
      borderStyle: "double",
      borderColor: UI.accent,
      backgroundColor: UI.panelBg,
      title: " Help ",
      titleColor: UI.accent,
      titleAlignment: "center",
      bottomTitle: " Esc to close ",
      bottomTitleAlignment: "right",
    });
    box.onMouseDown = (event) => event.stopPropagation();

    const text = new TextRenderable(ctx, {
      flexGrow: 1,
      padding: 1,
      selectable: false,
      wrapMode: "none",
      content: t`${fg(UI.chromeText)(HELP)}`,
    });
    box.add(text);
    overlay.add(box);
    this.helpBox = box;
    this.helpText = text;
    return overlay;
  }

  /** Pick a help layout that fits the current terminal. */
  private layoutHelp(): void {
    const full = this.renderer.height >= 24 && this.renderer.width >= 50;
    this.helpText.content = t`${fg(UI.chromeText)(full ? HELP : HELP_COMPACT)}`;
    this.helpBox.width = Math.max(24, Math.min(46, this.renderer.width - 2));
    this.helpBox.height = full ? 21 : 8;
    this.helpBox.requestRender();
  }

  private setHelp(visible: boolean): void {
    this.layoutHelp();
    this.helpVisible = visible;
    this.helpOverlay.visible = visible;
    this.helpOverlay.requestRender();
  }

  /** Size available for the canvas after the current chrome. */
  private availableCanvasSize(): { width: number; height: number } {
    const left = this.renderer.width >= FULL_MIN_WIDTH ? LEFT_WIDTH : 0;
    const right = this.renderer.width >= RIGHT_ONLY_MIN_WIDTH ? RIGHT_WIDTH : 0;
    return {
      width: Math.max(8, this.renderer.width - ROOT_BORDER - left - right - CANVAS_BORDER),
      height: Math.max(4, this.renderer.height - ROOT_BORDER - STATUS_ROWS - CANVAS_BORDER),
    };
  }

  private readonly onRendererResize = (): void => {
    this.applyResponsive();
    this.sizeFrames();
    this.growToTerminal();
    this.refreshChrome();
  };

  /**
   * Frame buffers are sized explicitly (they do not flex-grow), so the
   * canvas gets the exact content area of its panel.
   */
  private sizeFrames(): void {
    const available = this.availableCanvasSize();
    this.canvas.width = available.width;
    this.canvas.height = available.height;
  }

  /**
   * Grow-only auto fit: enlarging the terminal enlarges the document;
   * shrinking leaves it intact so no artwork is ever destroyed.
   */
  private growToTerminal(): void {
    if (!this.autoGrow) return;
    const available = this.availableCanvasSize();
    const width = Math.max(available.width, this.engine.doc.width);
    const height = Math.max(available.height, this.engine.doc.height);
    this.engine.resizeDocument(width, height);
  }

  /** Initial auto fit — the document starts exactly at the viewport size. */
  private fitToAvailable(): void {
    const available = this.availableCanvasSize();
    this.engine.resizeDocument(available.width, available.height);
  }

  /** Show or hide sidebars according to the current terminal size. */
  private applyResponsive(): void {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const bodyHeight = h - ROOT_BORDER - STATUS_ROWS;
    const showLeft = w >= FULL_MIN_WIDTH;
    const showRight = w >= RIGHT_ONLY_MIN_WIDTH;
    const showActions = showLeft && bodyHeight >= ACTIONS_MIN_BODY;
    const showBrush = showLeft && bodyHeight >= BRUSH_MIN_BODY;
    const showColors = showRight && bodyHeight >= COLORS_MIN_BODY;

    this.layoutHelp();

    const key = `${showLeft}|${showRight}|${showActions}|${showBrush}|${showColors}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;

    const bodyChildren: Renderable[] = [this.canvasPanel];
    if (showLeft) bodyChildren.unshift(this.leftColumn);
    if (showRight) bodyChildren.push(this.rightColumn);
    setChildren(this.body, bodyChildren);

    if (showLeft) {
      const left: Renderable[] = [this.tools.box];
      if (showActions) left.push(this.actions.box);
      if (showBrush) left.push(this.brush.box);
      setChildren(this.leftColumn, left);
    }
    if (showRight) {
      const right: Renderable[] = [this.chars.box];
      if (showColors) right.push(this.colors.box);
      setChildren(this.rightColumn, right);
    }
  }

  // --------------------------------------------------------------- chrome

  private refreshChrome(): void {
    const engine = this.engine;
    const palette = PALETTES[engine.brush.paletteIndex]!;
    const glyph = engine.resolvedBrushCell().char;
    const display = glyph === " " ? "␣" : glyph;
    const mode = engine.brush.fixedChar === null ? "auto" : "fixed";
    const pressurePct = Math.round(engine.pressure * 100);

    this.canvasPanel.title = ` Canvas ${engine.doc.width}×${engine.doc.height}${
      engine.isModified ? " ●" : ""
    } `;

    this.tools.refresh();
    this.brush.refresh();
    this.chars.refresh();
    this.colors.refresh();

    const bg = engine.brush.background === null ? dim("∅") : fg(engine.brush.background)("■");
    const tool = fg(UI.accent)(bold(TOOL_LABELS[engine.tool]));
    const glyphText = fg(UI.accentHot)(bold(display));
    const filled = "█".repeat(Math.round(engine.pressure * 10));
    const empty = "░".repeat(10 - Math.round(engine.pressure * 10));
    const width = this.renderer.width;

    if (width >= 96) {
      this.stateLine.content = t`${tool}  ${glyphText} ${dim(mode)}  ${dim("palette ")}${fg(
        UI.chromeText,
      )(palette.name)}  ${dim("size ")}${fg(UI.chromeText)(String(engine.brush.size))}  ${dim(
        "press ",
      )}${fg(UI.accent)(filled)}${dim(empty)} ${fg(UI.textMuted)(
        `${pressurePct}%`,
      )}  ${dim("FG ")}${fg(engine.brush.foreground)("■")}  ${dim("BG ")}${bg}`;
    } else if (width >= 70) {
      this.stateLine.content = t`${tool} ${glyphText} ${dim(mode)} · ${dim(
        palette.name,
      )} · ${dim("size ")}${fg(UI.chromeText)(String(engine.brush.size))} · ${fg(UI.accent)(
        filled,
      )}${dim(empty)} ${fg(UI.textMuted)(`${pressurePct}%`)} · ${dim("FG ")}${fg(
        engine.brush.foreground,
      )("■")}`;
    } else {
      this.stateLine.content = t`${tool} ${glyphText} ${dim(mode)} · ${fg(UI.textMuted)(
        `${pressurePct}%`,
      )} · ${dim("FG ")}${fg(engine.brush.foreground)("■")}`;
    }

    this.hintsLine.content = t`${dim(
      width >= 96
        ? "←↑↓→ pan · drag to paint · Tab palette · 1-4 size · -/= pressure"
        : width >= FULL_MIN_WIDTH
          ? "←↑↓→ pan · drag paint · Tab palette"
          : "B E L R T I tools · drag paint",
    )}`;
  }

  private stampCat(): void {
    const origin = centerOrigin(CAT_ART, this.engine.doc.width, this.engine.doc.height);
    this.engine.stampCells(artToCells(CAT_ART, origin.x, origin.y));
  }

  // ---------------------------------------------------------------- keys

  private readonly onKey = (key: KeyEvent): void => {
    const engine = this.engine;

    if (this.helpVisible) {
      if (key.name === "escape" || key.name === "?" || key.name === "h") this.setHelp(false);
      else if (key.name === "q") this.renderer.destroy();
      return;
    }

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
      case "?":
      case "h":
        this.setHelp(true);
        return;
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
      case "left":
        this.canvas.pan(-1, 0);
        return;
      case "right":
        this.canvas.pan(1, 0);
        return;
      case "up":
        this.canvas.pan(0, -1);
        return;
      case "down":
        this.canvas.pan(0, 1);
        return;
      case "c":
        if (key.shift) this.stampCat();
        else engine.clearCanvas();
        return;
    }
  };
}

function setChildren(container: BoxRenderable, children: readonly Renderable[]): void {
  for (const child of container.getChildren()) container.remove(child);
  for (const child of children) container.add(child);
}
