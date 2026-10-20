import { describe, expect, it } from "vitest";
import {
  BrushEngine,
  clampPressure,
  createBrushState,
  pressureToChar,
} from "../src/core/brush.ts";
import { PALETTES } from "../src/core/palettes.ts";

const DENSITY = PALETTES[0]!.chars; // 10 bands, light → heavy

describe("pressureToChar", () => {
  it("maps the ten pressure bands onto distinct density glyphs", () => {
    expect(DENSITY).toHaveLength(10);
    // One glyph per 10% band: every UI pressure step is visible.
    expect(pressureToChar(0.05, DENSITY)).toBe("."); // low
    expect(pressureToChar(0.15, DENSITY)).toBe(",");
    expect(pressureToChar(0.25, DENSITY)).toBe(":"); // medium-low
    expect(pressureToChar(0.35, DENSITY)).toBe(";");
    expect(pressureToChar(0.45, DENSITY)).toBe("+"); // medium
    expect(pressureToChar(0.55, DENSITY)).toBe("*");
    expect(pressureToChar(0.65, DENSITY)).toBe("#"); // high
    expect(pressureToChar(0.75, DENSITY)).toBe("%");
    expect(pressureToChar(0.85, DENSITY)).toBe("@");
    expect(pressureToChar(0.95, DENSITY)).toBe("█"); // maximum

    const glyphs = Array.from({ length: 10 }, (_, i) => pressureToChar((i + 0.5) / 10, DENSITY));
    expect(new Set(glyphs).size).toBe(10);
  });

  it("starts each 10% band on its glyph", () => {
    expect(pressureToChar(0, DENSITY)).toBe(".");
    expect(pressureToChar(0.1, DENSITY)).toBe(",");
    expect(pressureToChar(0.2, DENSITY)).toBe(":");
    expect(pressureToChar(0.7, DENSITY)).toBe("%");
    expect(pressureToChar(0.8, DENSITY)).toBe("@");
    expect(pressureToChar(0.9, DENSITY)).toBe("█");
    expect(pressureToChar(1, DENSITY)).toBe("█");
  });

  it("does not skip a band at a floating-point boundary", () => {
    expect(pressureToChar(0.7999999999999999, DENSITY)).toBe("@");
  });

  it("clamps out-of-range pressure", () => {
    expect(pressureToChar(-1, DENSITY)).toBe(".");
    expect(pressureToChar(2, DENSITY)).toBe("█");
    expect(pressureToChar(Number.NaN, DENSITY)).toBe(".");
  });

  it("maps across arbitrary palette lengths", () => {
    const blocks = PALETTES.find((p) => p.id === "blocks")!.chars; // 4 chars
    expect(pressureToChar(0.1, blocks)).toBe("░");
    expect(pressureToChar(0.9, blocks)).toBe("█");
  });

  it("never crashes on empty ramps", () => {
    expect(pressureToChar(0.5, [])).toBe("#");
  });
});

describe("clampPressure", () => {
  it("clamps to [0, 1]", () => {
    expect(clampPressure(-0.5)).toBe(0);
    expect(clampPressure(0.5)).toBe(0.5);
    expect(clampPressure(1.5)).toBe(1);
  });
});

describe("BrushEngine", () => {
  it("resolves characters from pressure in palette mode", () => {
    const brush = new BrushEngine(createBrushState());
    expect(brush.resolveChar(0.05)).toBe(".");
    expect(brush.resolveChar(0.95)).toBe("█");
  });

  it("fixed char overrides pressure", () => {
    const state = createBrushState();
    state.fixedChar = "@";
    const brush = new BrushEngine(state);
    expect(brush.resolveChar(0.05)).toBe("@");
    expect(brush.resolveChar(0.95)).toBe("@");
  });

  it("resolves painted cells with colors", () => {
    const state = createBrushState();
    state.foreground = "#ff0000";
    state.background = "#0000ff";
    const brush = new BrushEngine(state);
    const cell = brush.resolveCell({ x: 0, y: 0, pressure: 0.5, buttons: 1 }, false);
    expect(cell).toEqual({ char: "*", foreground: "#ff0000", background: "#0000ff" });
  });

  it("omits background when none is selected", () => {
    const brush = new BrushEngine(createBrushState());
    const cell = brush.resolveCell({ x: 0, y: 0, pressure: 0.5, buttons: 1 }, false);
    expect(cell.background).toBeUndefined();
    expect(cell.foreground).toBeDefined();
  });

  it("resolves eraser cells to the empty cell", () => {
    const brush = new BrushEngine(createBrushState());
    expect(brush.resolveCell({ x: 0, y: 0, pressure: 1, buttons: 1 }, true)).toEqual({
      char: " ",
    });
  });

  it("stamps around the center at the configured size", () => {
    const state = createBrushState();
    state.size = 1;
    const brush = new BrushEngine(state);
    expect(brush.stamp({ x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
    state.size = 2;
    const pts = brush.stamp({ x: 0, y: 0 });
    expect(pts.length).toBeGreaterThan(1);
    expect(pts).toContainEqual({ x: 0, y: 0 });
  });
});
