import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  dim,
  fg,
  t,
  type RenderContext,
  type TextChunk,
} from "@opentui/core";
import type { DrawingEngine } from "../core/engine.ts";
import { BG_COLORS, FG_COLORS, PALETTES } from "../core/palettes.ts";
import { absoluteOrigin, listRow, panel } from "./layout.ts";
import { UI } from "./theme.ts";

const CHIP_COLS = 5;
const CHIP_ROWS = 3;

interface Chip {
  box: BoxRenderable;
  text: TextRenderable;
}

/** Glyph ramp for the active palette; click a glyph to pin it. */
export class CharsPanel {
  readonly box: BoxRenderable;
  private readonly paletteName: TextRenderable;
  private readonly chips: Chip[] = [];
  private hovered = -1;

  constructor(
    ctx: RenderContext,
    private readonly engine: DrawingEngine,
  ) {
    this.box = panel(ctx, {
      id: "chars",
      title: " Characters ",
      width: 18,
      height: 6,
      flexShrink: 0,
    });

    const header = listRow(ctx, "chars-header");
    header.add(this.arrow(ctx, "‹", () => this.engine.cyclePalette(-1)));
    this.paletteName = new TextRenderable(ctx, {
      height: 1,
      flexGrow: 1,
      selectable: false,
      textAlign: "center",
      truncate: true,
    });
    header.add(this.paletteName);
    header.add(this.arrow(ctx, "›", () => this.engine.cyclePalette(1)));
    this.box.add(header);

    for (let row = 0; row < CHIP_ROWS; row++) {
      const line = new BoxRenderable(ctx, {
        id: `chars-row-${row}`,
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 1,
      });
      for (let col = 0; col < CHIP_COLS; col++) {
        const index = row * CHIP_COLS + col;
        const box = new BoxRenderable(ctx, {
          width: 3,
          height: 1,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
        });
        const text = new TextRenderable(ctx, { height: 1, selectable: false, content: " " });
        box.add(text);
        box.onMouseDown = (event) => {
          event.stopPropagation();
          const char = PALETTES[this.engine.brush.paletteIndex]?.chars[index];
          if (char !== undefined) this.engine.setFixedChar(char);
        };
        box.onMouseOver = () => {
          this.hovered = index;
          this.refresh();
        };
        box.onMouseOut = () => {
          if (this.hovered === index) this.hovered = -1;
          this.refresh();
        };
        line.add(box);
        this.chips.push({ box, text });
      }
      this.box.add(line);
    }
    this.refresh();
  }

  private arrow(ctx: RenderContext, glyph: string, run: () => void): TextRenderable {
    const text = new TextRenderable(ctx, {
      height: 1,
      flexShrink: 0,
      selectable: false,
      content: t`${dim(glyph)}`,
    });
    text.onMouseDown = (event) => {
      event.stopPropagation();
      run();
    };
    text.onMouseOver = () => {
      text.content = t`${fg(UI.accent)(glyph)}`;
    };
    text.onMouseOut = () => {
      text.content = t`${dim(glyph)}`;
    };
    return text;
  }

  refresh(): void {
    const palette = PALETTES[this.engine.brush.paletteIndex] ?? PALETTES[0]!;
    this.paletteName.content = t`${fg(UI.chromeText)(palette.name)}`;
    const active = this.engine.brush.fixedChar ?? this.engine.resolvedBrushCell().char;

    for (let index = 0; index < this.chips.length; index++) {
      const chip = this.chips[index]!;
      const char = palette.chars[index];
      if (char === undefined) {
        chip.box.visible = false;
        continue;
      }
      chip.box.visible = true;
      chip.box.backgroundColor =
        char === active ? UI.selectionBg : this.hovered === index ? UI.hoverBg : undefined;
      chip.text.content = t`${fg(char === active ? UI.accentHot : UI.chromeText)(
        char === " " ? "␣" : char,
      )}`;
    }
  }
}

const COLORS_PER_ROW = 6;

interface ColorRow {
  line: TextRenderable;
  options: readonly (string | null)[];
}

/** Foreground and background swatches with a click target per color. */
export class ColorsPanel {
  readonly box: BoxRenderable;
  private readonly fgRows: ColorRow[] = [];
  private readonly bgRows: ColorRow[] = [];

  constructor(
    ctx: RenderContext,
    private readonly engine: DrawingEngine,
  ) {
    this.box = panel(ctx, { id: "colors", title: " Colors ", width: 18, height: 6, flexShrink: 0 });
    this.buildGroup(ctx, "FG", FG_COLORS, this.fgRows, (color) =>
      this.engine.setForeground(color ?? FG_COLORS[0]!),
    );
    this.buildGroup(ctx, "BG", [null, ...BG_COLORS], this.bgRows, (color) =>
      this.engine.setBackground(color),
    );
    this.refresh();
  }

  private buildGroup(
    ctx: RenderContext,
    label: string,
    options: readonly (string | null)[],
    out: ColorRow[],
    pick: (color: string | null) => void,
  ): void {
    for (let row = 0; row * COLORS_PER_ROW < options.length; row++) {
      const line = new TextRenderable(ctx, {
        id: `colors-${label}-${row}`,
        height: 1,
        flexShrink: 0,
        selectable: false,
        paddingLeft: 1,
        truncate: true,
      });
      const slice = options.slice(row * COLORS_PER_ROW, (row + 1) * COLORS_PER_ROW);
      line.onMouseDown = (event) => {
        event.stopPropagation();
        const origin = absoluteOrigin(line);
        // paddingLeft (1) + the "FG " / "BG " label (3).
        const index = Math.floor((event.x - origin.x - 4) / 2);
        if (index < 0 || index >= slice.length) return;
        pick(slice[index] ?? null);
      };
      line.onMouseOver = () => {
        line.bg = UI.hoverBg;
      };
      line.onMouseOut = () => {
        line.bg = undefined;
      };
      this.box.add(line);
      out.push({ line, options: slice });
    }
  }

  refresh(): void {
    this.renderGroup("FG", this.fgRows, this.engine.brush.foreground);
    this.renderGroup("BG", this.bgRows, this.engine.brush.background);
  }

  private renderGroup(label: string, rows: ColorRow[], selected: string | null): void {
    for (let row = 0; row < rows.length; row++) {
      const entry = rows[row]!;
      const chunks: TextChunk[] = [fg(UI.dim)(row === 0 ? `${label} ` : "   ")];
      for (const option of entry.options) {
        if (option === null) {
          chunks.push(
            selected === null ? fg(UI.accentHot)("◆") : fg(UI.dim)("∅"),
            fg(UI.chromeText)(" "),
          );
        } else {
          chunks.push(fg(option)(option === selected ? "◆" : "■"), fg(UI.chromeText)(" "));
        }
      }
      entry.line.content = new StyledText(chunks);
    }
  }
}
