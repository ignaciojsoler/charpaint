import { describe, expect, it } from "vitest";
import { DrawingEngine } from "../src/core/engine.ts";
import { getCell } from "../src/core/document.ts";
import { PALETTES } from "../src/core/palettes.ts";
import type { PointerInput } from "../src/core/types.ts";

/**
 * Mirrors the app's mouse adapter: pointer samples carry the engine's
 * current simulated pressure, exactly how a future tablet adapter would
 * carry real stylus pressure.
 */
function input(
  engine: DrawingEngine,
  x: number,
  y: number,
  overrides: Partial<PointerInput> = {},
): PointerInput {
  return { x, y, pressure: engine.pressure, buttons: 1, ...overrides };
}

describe("DrawingEngine: brush", () => {
  it("paints a single cell on pointer down", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 0.5; // medium → "*"
    engine.pointerDown(input(engine, 3, 4));
    engine.pointerUp(input(engine, 3, 4));
    expect(getCell(engine.doc, 3, 4)?.char).toBe("*");
  });

  it("maps pressure to density while painting", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 0.1;
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerUp(input(engine, 0, 0));
    expect(getCell(engine.doc, 0, 0)?.char).toBe(",");

    engine.pressure = 1.0;
    engine.pointerDown(input(engine, 1, 0));
    engine.pointerUp(input(engine, 1, 0));
    expect(getCell(engine.doc, 1, 0)?.char).toBe("█");
  });

  it("interpolates fast drags without gaps", () => {
    const engine = new DrawingEngine(20, 20);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerDrag(input(engine, 9, 9)); // diagonal jump
    engine.pointerUp(input(engine, 9, 9));

    for (let i = 0; i <= 9; i++) {
      expect(getCell(engine.doc, i, i)?.char).toBe("█");
    }
  });

  it("paints with the brush stamp at larger sizes", () => {
    const engine = new DrawingEngine(20, 20);
    engine.pressure = 1;
    engine.setSize(2);
    engine.pointerDown(input(engine, 5, 5));
    engine.pointerUp(input(engine, 5, 5));
    expect(getCell(engine.doc, 5, 5)?.char).toBe("█");
    expect(getCell(engine.doc, 6, 5)?.char).toBe("█"); // stamp spills to neighbors
  });

  it("does not paint outside the document", () => {
    const engine = new DrawingEngine(5, 5);
    engine.pointerDown(input(engine, -3, -3));
    engine.pointerDrag(input(engine, 2, 2));
    engine.pointerUp(input(engine, 2, 2));
    expect(getCell(engine.doc, 2, 2)?.char).not.toBe(" ");
  });

  it("emits change notifications", () => {
    const engine = new DrawingEngine(5, 5);
    let count = 0;
    engine.subscribe(() => count++);
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerDrag(input(engine, 1, 1));
    engine.pointerUp(input(engine, 1, 1));
    expect(count).toBe(3);
  });
});

describe("DrawingEngine: eraser", () => {
  it("restores cells to their empty state", () => {
    const engine = new DrawingEngine(5, 5);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 1, 1));
    engine.pointerUp(input(engine, 1, 1));
    expect(getCell(engine.doc, 1, 1)?.char).toBe("█");

    engine.setTool("eraser");
    engine.pointerDown(input(engine, 1, 1));
    engine.pointerUp(input(engine, 1, 1));
    expect(getCell(engine.doc, 1, 1)).toEqual({ char: " " });
  });
});

describe("DrawingEngine: undo/redo", () => {
  it("undoes a whole stroke as one unit", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerDrag(input(engine, 5, 0));
    engine.pointerUp(input(engine, 5, 0));

    engine.undo();
    for (let x = 0; x <= 5; x++) {
      expect(getCell(engine.doc, x, 0)?.char).toBe(" ");
    }
    engine.redo();
    for (let x = 0; x <= 5; x++) {
      expect(getCell(engine.doc, x, 0)?.char).toBe("█");
    }
  });

  it("undoes separate strokes separately", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerUp(input(engine, 0, 0));
    engine.pointerDown(input(engine, 1, 0));
    engine.pointerUp(input(engine, 1, 0));

    engine.undo();
    expect(getCell(engine.doc, 1, 0)?.char).toBe(" ");
    expect(getCell(engine.doc, 0, 0)?.char).toBe("█");
    engine.undo();
    expect(getCell(engine.doc, 0, 0)?.char).toBe(" ");
  });
});

describe("DrawingEngine: line tool", () => {
  it("previews during drag and commits on release", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.setTool("line");

    engine.pointerDown(input(engine, 0, 0));
    engine.pointerDrag(input(engine, 4, 0));

    // Preview exists but nothing is committed yet
    expect(engine.getGhost()?.preview).toBe(true);
    expect(engine.getGhost()?.points.length).toBe(5);
    expect(getCell(engine.doc, 2, 0)?.char).toBe(" ");

    engine.pointerUp(input(engine, 4, 0));
    expect(engine.getGhost()?.preview).toBeFalsy();
    for (let x = 0; x <= 4; x++) {
      expect(getCell(engine.doc, x, 0)?.char).toBe("█");
    }
  });

  it("commits as a single undo unit", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.setTool("line");
    engine.pointerDown(input(engine, 0, 0));
    engine.pointerUp(input(engine, 9, 9));
    engine.undo();
    expect(getCell(engine.doc, 5, 5)?.char).toBe(" ");
  });

  it("shift constrains the line angle", () => {
    const engine = new DrawingEngine(20, 20);
    engine.pressure = 1;
    engine.setTool("line");
    engine.pointerDown(input(engine, 2, 2));
    engine.pointerUp(input(engine, 12, 3, { modifiers: { shift: true } }));
    // snapped to horizontal: y stays 2 along the line
    expect(getCell(engine.doc, 7, 2)?.char).toBe("█");
    expect(getCell(engine.doc, 7, 3)?.char).toBe(" ");
  });
});

describe("DrawingEngine: rect tool", () => {
  it("commits an outline rectangle", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.setTool("rect");
    engine.pointerDown(input(engine, 1, 1));
    engine.pointerUp(input(engine, 4, 3));

    expect(getCell(engine.doc, 1, 1)?.char).toBe("█");
    expect(getCell(engine.doc, 4, 3)?.char).toBe("█");
    expect(getCell(engine.doc, 2, 2)?.char).toBe(" "); // interior stays empty
  });
});

describe("DrawingEngine: text tool", () => {
  it("types characters onto the grid", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setTool("text");
    engine.pointerDown(input(engine, 1, 1));
    engine.typeChar("H");
    engine.typeChar("i");
    engine.commitText();

    expect(getCell(engine.doc, 1, 1)?.char).toBe("H");
    expect(getCell(engine.doc, 2, 1)?.char).toBe("i");
  });

  it("backspace removes the previous character", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setTool("text");
    engine.pointerDown(input(engine, 1, 1));
    engine.typeChar("a");
    engine.textBackspace();
    engine.commitText();
    expect(getCell(engine.doc, 1, 1)?.char).toBe(" ");
  });

  it("undo reverts a whole text session", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setTool("text");
    engine.pointerDown(input(engine, 0, 0));
    engine.typeChar("h");
    engine.typeChar("i");
    engine.commitText();
    engine.undo();
    expect(getCell(engine.doc, 0, 0)?.char).toBe(" ");
    expect(getCell(engine.doc, 1, 0)?.char).toBe(" ");
  });

  it("newline returns to the anchor column", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setTool("text");
    engine.pointerDown(input(engine, 2, 1));
    engine.typeChar("a");
    engine.textNewline();
    engine.typeChar("b");
    engine.commitText();
    expect(getCell(engine.doc, 2, 2)?.char).toBe("b");
  });
});

describe("DrawingEngine: picker", () => {
  it("adopts char and colors from a painted cell", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 3, 3));
    engine.pointerUp(input(engine, 3, 3));

    engine.setTool("picker");
    engine.pointerDown(input(engine, 3, 3));

    expect(engine.brush.fixedChar).toBe("█");
    expect(engine.tool).toBe("brush"); // returns to brush after picking
  });
});

describe("DrawingEngine: settings", () => {
  it("cycles palettes and resets the fixed char", () => {
    const engine = new DrawingEngine(10, 10);
    expect(PALETTES[engine.brush.paletteIndex]!.id).toBe("density");
    engine.cycleChar(1);
    expect(engine.brush.fixedChar).not.toBeNull();
    engine.cyclePalette(1);
    expect(PALETTES[engine.brush.paletteIndex]!.id).toBe("ascii");
    expect(engine.brush.fixedChar).toBeNull();
    engine.cyclePalette(-1);
    expect(PALETTES[engine.brush.paletteIndex]!.id).toBe("density");
  });

  it("cycles chars within a palette", () => {
    const engine = new DrawingEngine(10, 10);
    engine.cycleChar(1);
    expect(engine.brush.fixedChar).toBe(".");
    engine.cycleChar(1);
    expect(engine.brush.fixedChar).toBe(",");
    engine.cycleChar(-1);
    engine.cycleChar(-1);
    expect(engine.brush.fixedChar).toBe("█"); // wraps
  });

  it("pins a specific glyph (palette click)", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 0.1;
    engine.setFixedChar("%");
    engine.pointerDown(input(engine, 2, 2));
    engine.pointerUp(input(engine, 2, 2));
    expect(getCell(engine.doc, 2, 2)?.char).toBe("%");
  });

  it("sets simulated pressure directly within [0, 1]", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setPressure(0.75);
    expect(engine.pressure).toBe(0.75);
    engine.setPressure(-3);
    expect(engine.pressure).toBe(0);
    engine.setPressure(9);
    expect(engine.pressure).toBe(1);
  });

  it("adjusts simulated pressure within [0, 1]", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 0.5;
    engine.adjustPressure(0.1);
    expect(engine.pressure).toBeCloseTo(0.6);
    for (let i = 0; i < 20; i++) engine.adjustPressure(0.2);
    expect(engine.pressure).toBe(1);
    for (let i = 0; i < 20; i++) engine.adjustPressure(-0.2);
    expect(engine.pressure).toBe(0);
  });

  it("cycles foreground and background colors", () => {
    const engine = new DrawingEngine(10, 10);
    const first = engine.brush.foreground;
    engine.cycleForeground(1);
    expect(engine.brush.foreground).not.toBe(first);
    engine.cycleForeground(-1);
    expect(engine.brush.foreground).toBe(first);

    expect(engine.brush.background).toBeNull();
    engine.cycleBackground(1);
    expect(engine.brush.background).not.toBeNull();
    engine.cycleBackground(-1);
    expect(engine.brush.background).toBeNull();
  });
});

describe("DrawingEngine: clear + modified", () => {
  it("clear wipes the canvas and is undoable", () => {
    const engine = new DrawingEngine(5, 5);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 2, 2));
    engine.pointerUp(input(engine, 2, 2));
    expect(engine.isModified).toBe(true);

    engine.clearCanvas();
    expect(engine.isModified).toBe(false);

    engine.undo();
    expect(engine.isModified).toBe(true);
    expect(getCell(engine.doc, 2, 2)?.char).toBe("█");
  });
});

describe("DrawingEngine: adaptive document", () => {
  it("grows while preserving art and notifies subscribers", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 1, 1));
    engine.pointerUp(input(engine, 1, 1));

    let notified = 0;
    engine.subscribe(() => notified++);

    expect(engine.resizeDocument(20, 15)).toBe(true);
    expect(engine.doc.width).toBe(20);
    expect(engine.doc.height).toBe(15);
    expect(getCell(engine.doc, 1, 1)?.char).toBe("█");
    expect(notified).toBe(1);

    expect(engine.resizeDocument(20, 15)).toBe(false);
    expect(notified).toBe(1);
  });

  it("keeps history usable after shrinking", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pressure = 1;
    engine.pointerDown(input(engine, 1, 1));
    engine.pointerUp(input(engine, 1, 1));
    engine.resizeDocument(5, 5);
    engine.undo();
    expect(getCell(engine.doc, 1, 1)?.char).toBe(" ");
  });
});

describe("DrawingEngine: ghost cursor", () => {
  it("reports a stamp ghost at the hover position", () => {
    const engine = new DrawingEngine(10, 10);
    engine.pointerMove(input(engine, 4, 4));
    const ghost = engine.getGhost();
    expect(ghost?.preview).toBe(false);
    expect(ghost?.points).toContainEqual({ x: 4, y: 4 });
  });

  it("reports no ghost during text sessions", () => {
    const engine = new DrawingEngine(10, 10);
    engine.setTool("text");
    engine.pointerDown(input(engine, 1, 1));
    expect(engine.getGhost()).toBeNull();
    expect(engine.textCursor).toEqual({ x: 1, y: 1 });
  });
});
