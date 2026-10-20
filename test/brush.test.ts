import { describe, expect, it } from "vitest";
import {
  BrushEngine,
  clampPressure,
  createBrushState,
  pressureToChar,
} from "../src/core/brush.ts";
import { PALETTES } from "../src/core/palettes.ts";

const DENSITY = PALETTES[0]!.chars; // [".", ":", "+", "#", "█"]

describe("pressureToChar", () => {
  it("implements the spec's five pressure levels", () => {
    expect(pressureToChar(0.0, DENSITY)).toBe("."); // low
    expect(pressureToChar(0.1, DENSITY)).toBe(".");
    expect(pressureToChar(0.3, DENSITY)).toBe(":"); // medium-low
    expect(pressureToChar(0.5, DENSITY)).toBe("+"); // medium
    expect(pressureToChar(0.7, DENSITY)).toBe("#"); // high
    expect(pressureToChar(0.9, DENSITY)).toBe("█"); // maximum
    expect(pressureToChar(1.0, DENSITY)).toBe("█");
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
    expect(cell).toEqual({ char: "+", foreground: "#ff0000", background: "#0000ff" });
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
