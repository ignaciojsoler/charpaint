import { describe, expect, it } from "vitest";
import { CAT_ART, artSize, artToCells, centerOrigin } from "../src/core/demo-art.ts";
import { DrawingEngine } from "../src/core/engine.ts";
import { getCell } from "../src/core/document.ts";

describe("demo art: cat", () => {
  it("has rectangular rows", () => {
    const size = artSize(CAT_ART);
    expect(size).toEqual({ width: 40, height: 20 });
    for (const row of CAT_ART.rows) expect(row).toHaveLength(40);
  });

  it("maps every glyph key to a color", () => {
    const keys = new Set(CAT_ART.rows.join(""));
    keys.delete(".");
    for (const key of keys) {
      expect(CAT_ART.colors[key], `missing color for ${key}`).toBeDefined();
    }
  });

  it("fits inside the default 80×24 document", () => {
    const size = artSize(CAT_ART);
    expect(size.width).toBeLessThanOrEqual(80);
    expect(size.height).toBeLessThanOrEqual(24);
  });

  it("expands to positioned cells with the origin offset", () => {
    const cells = artToCells(CAT_ART, 10, 2);
    expect(cells.length).toBeGreaterThan(100);
    // Nose (row 12, cols 19-20) is pink.
    const nose = cells.find((c) => c.x === 10 + 19 && c.y === 2 + 12);
    expect(nose?.cell.foreground).toBe("#ff7aa8");
    // Ear tip (row 0, col 2) is outline-colored.
    const ear = cells.find((c) => c.x === 10 + 2 && c.y === 2 + 0);
    expect(ear?.cell.foreground).toBe("#1f1410");
    expect(cells.every((c) => c.cell.char === "█")).toBe(true);
  });

  it("centers on the document and clamps at the edges", () => {
    expect(centerOrigin(CAT_ART, 80, 24)).toEqual({ x: 20, y: 2 });
    expect(centerOrigin(CAT_ART, 30, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe("demo art through the engine", () => {
  it("stamps as a single undoable stroke", () => {
    const engine = new DrawingEngine(80, 24);
    const origin = centerOrigin(CAT_ART, engine.doc.width, engine.doc.height);
    engine.stampCells(artToCells(CAT_ART, origin.x, origin.y));

    expect(getCell(engine.doc, origin.x + 19, origin.y + 12)?.foreground).toBe("#ff7aa8");
    expect(engine.isModified).toBe(true);

    engine.undo();
    expect(getCell(engine.doc, origin.x + 19, origin.y + 12)?.char).toBe(" ");

    engine.redo();
    expect(getCell(engine.doc, origin.x + 19, origin.y + 12)?.foreground).toBe("#ff7aa8");
  });
});
