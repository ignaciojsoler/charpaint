import {
  BoxRenderable,
  TextRenderable,
  bold,
  dim,
  fg,
  t,
  type RenderContext,
} from "@opentui/core";
import type { DrawingEngine } from "../core/engine.ts";
import type { ToolId } from "../core/types.ts";
import { absoluteOrigin, listRow, panel, spacer } from "./layout.ts";
import { UI } from "./theme.ts";

const TOOLS: readonly { id: ToolId; label: string; icon: string; key: string }[] = [
  { id: "brush", label: "Brush", icon: "✎", key: "B" },
  { id: "eraser", label: "Eraser", icon: "⌫", key: "E" },
  { id: "line", label: "Line", icon: "╱", key: "L" },
  { id: "rect", label: "Rect", icon: "▭", key: "R" },
  { id: "text", label: "Text", icon: "T", key: "T" },
  { id: "picker", label: "Picker", icon: "◉", key: "I" },
];

interface ToolRow {
  row: BoxRenderable;
  icon: TextRenderable;
  label: TextRenderable;
  key: TextRenderable;
}

/** Clickable tool list with keyboard-shortcut hints. */
export class ToolsPanel {
  readonly box: BoxRenderable;
  private readonly rows = new Map<ToolId, ToolRow>();
  private hovered: ToolId | null = null;

  constructor(
    ctx: RenderContext,
    private readonly engine: DrawingEngine,
  ) {
    this.box = panel(ctx, { id: "tools", title: " Tools ", width: 18, flexShrink: 0 });
    for (const tool of TOOLS) {
      const row = listRow(ctx, `tool-${tool.id}`);
      const icon = this.text(ctx, tool.icon);
      const gap = this.text(ctx, " ");
      const label = this.text(ctx, tool.label);
      const key = this.text(ctx, tool.key);
      row.add(icon);
      row.add(gap);
      row.add(label);
      row.add(spacer(ctx));
      row.add(key);
      row.onMouseDown = (event) => {
        event.stopPropagation();
        this.engine.setTool(tool.id);
      };
      row.onMouseOver = () => {
        this.hovered = tool.id;
        this.refresh();
      };
      row.onMouseOut = () => {
        if (this.hovered === tool.id) this.hovered = null;
        this.refresh();
      };
      this.rows.set(tool.id, { row, icon, label, key });
      this.box.add(row);
    }
    this.refresh();
  }

  private text(ctx: RenderContext, content: string): TextRenderable {
    return new TextRenderable(ctx, { height: 1, flexShrink: 0, selectable: false, content });
  }

  refresh(): void {
    for (const tool of TOOLS) {
      const row = this.rows.get(tool.id);
      if (!row) continue;
      const active = this.engine.tool === tool.id;
      row.row.backgroundColor = active
        ? UI.selectionBg
        : this.hovered === tool.id
          ? UI.hoverBg
          : undefined;
      row.icon.content = t`${fg(active ? UI.accentHot : UI.dim)(tool.icon)}`;
      row.label.content = t`${fg(active ? UI.chromeText : UI.textMuted)(tool.label)}`;
      row.key.content = t`${fg(active ? UI.accent : UI.dim)(tool.key)}`;
    }
  }
}

/** Undo / redo / clear / demo helpers, also reachable by mouse. */
export class ActionsPanel {
  readonly box: BoxRenderable;

  constructor(
    ctx: RenderContext,
    actions: { undo: () => void; redo: () => void; clear: () => void; stampCat: () => void },
  ) {
    this.box = panel(ctx, { id: "actions", title: " Actions ", width: 18, flexShrink: 0 });
    const entries = [
      { icon: "↶", label: "Undo", key: "^Z", run: actions.undo },
      { icon: "↷", label: "Redo", key: "^Y", run: actions.redo },
      { icon: "✕", label: "Clear", key: "C", run: actions.clear },
      { icon: "▞", label: "Cat demo", key: "⇧C", run: actions.stampCat },
    ];
    for (const entry of entries) {
      const row = listRow(ctx, `action-${entry.label.toLowerCase()}`);
      row.add(new TextRenderable(ctx, { height: 1, flexShrink: 0, selectable: false, content: t`${fg(UI.dim)(entry.icon)}` }));
      row.add(new TextRenderable(ctx, { height: 1, flexShrink: 0, selectable: false, content: " " }));
      row.add(new TextRenderable(ctx, { height: 1, flexShrink: 0, selectable: false, content: t`${fg(UI.textMuted)(entry.label)}` }));
      row.add(spacer(ctx));
      row.add(new TextRenderable(ctx, { height: 1, flexShrink: 0, selectable: false, content: t`${fg(UI.dim)(entry.key)}` }));
      row.onMouseOver = () => {
        row.backgroundColor = UI.hoverBg;
      };
      row.onMouseOut = () => {
        row.backgroundColor = undefined;
      };
      row.onMouseDown = (event) => {
        event.stopPropagation();
        entry.run();
      };
      this.box.add(row);
    }
  }
}

/** Live readout of the brush: glyph, size, pressure and colors. */
export class BrushPanel {
  readonly box: BoxRenderable;
  private readonly charLine: TextRenderable;
  private readonly sizeLine: TextRenderable;
  private readonly pressureLine: TextRenderable;
  private readonly colorLine: TextRenderable;
  private readonly barLeft = "Press ".length + 1; // panel line has paddingLeft
  private readonly barCells = 9;

  constructor(
    ctx: RenderContext,
    private readonly engine: DrawingEngine,
  ) {
    this.box = panel(ctx, { id: "brush-state", title: " Brush ", width: 18, flexShrink: 0 });
    this.charLine = this.line(ctx, "brush-char");
    this.sizeLine = this.line(ctx, "brush-size");
    this.pressureLine = this.line(ctx, "brush-pressure");
    this.colorLine = this.line(ctx, "brush-color");

    this.pressureLine.onMouseDown = (event) => {
      event.stopPropagation();
      const origin = absoluteOrigin(this.pressureLine);
      const relX = event.x - origin.x;
      const cells = Math.min(this.barCells - 1, Math.max(0, relX - this.barLeft));
      this.engine.setPressure((cells + 0.5) / this.barCells);
    };
    this.pressureLine.onMouseOver = () => {
      this.pressureLine.bg = UI.hoverBg;
    };
    this.pressureLine.onMouseOut = () => {
      this.pressureLine.bg = undefined;
    };

    this.box.add(this.charLine);
    this.box.add(this.sizeLine);
    this.box.add(this.pressureLine);
    this.box.add(this.colorLine);
    this.refresh();
  }

  private line(ctx: RenderContext, id: string): TextRenderable {
    return new TextRenderable(ctx, {
      id,
      height: 1,
      flexShrink: 0,
      selectable: false,
      paddingLeft: 1,
      truncate: true,
    });
  }

  refresh(): void {
    const brush = this.engine.brush;
    const glyph = this.engine.resolvedBrushCell().char;
    const display = glyph === " " ? "␣" : glyph;
    const mode = brush.fixedChar === null ? "auto" : "fixed";

    this.charLine.content = t`${dim("Char ")}${fg(UI.accentHot)(bold(display))} ${dim(mode)}`;

    const filled = "█".repeat(brush.size);
    const rest = "·".repeat(4 - brush.size);
    this.sizeLine.content = t`${dim("Size ")}${fg(UI.accent)(filled)}${dim(rest)} ${fg(
      UI.textMuted,
    )(String(brush.size))}`;

    const cells = Math.round(this.engine.pressure * this.barCells);
    const bar = "█".repeat(cells) + "░".repeat(this.barCells - cells);
    this.pressureLine.content = t`${dim("Press ")}${fg(UI.accent)(bar)}`;

    const bg = brush.background === null ? dim("∅") : fg(brush.background)("■");
    this.colorLine.content = t`${dim("FG ")}${fg(brush.foreground)("■")}  ${dim("BG ")}${bg}`;
  }
}
