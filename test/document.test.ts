import { describe, expect, it } from "vitest";
import {
  cellsEqual,
  countPaintedCells,
  createDocument,
  emptyCell,
  getCell,
  inBounds,
  isEmptyCell,
  setCell,
} from "../src/core/document.ts";

describe("document model", () => {
  it("creates a grid of empty cells with the given dimensions", () => {
    const doc = createDocument(4, 3);
    expect(doc.width).toBe(4);
    expect(doc.height).toBe(3);
    expect(doc.cells).toHaveLength(3);
    expect(doc.cells[0]).toHaveLength(4);
    expect(doc.cells.every((row) => row.every(isEmptyCell))).toBe(true);
  });

  it("rejects invalid dimensions", () => {
    expect(() => createDocument(0, 5)).toThrow();
    expect(() => createDocument(5, -1)).toThrow();
    expect(() => createDocument(2.5, 5)).toThrow();
  });

  it("gets and sets cells in bounds", () => {
    const doc = createDocument(2, 2);
    const cell = { char: "#", foreground: "#fff" };
    const previous = setCell(doc, 1, 1, cell);
    expect(previous).toEqual(emptyCell());
    expect(getCell(doc, 1, 1)).toEqual(cell);
  });

  it("returns undefined for out-of-bounds access", () => {
    const doc = createDocument(2, 2);
    expect(getCell(doc, -1, 0)).toBeUndefined();
    expect(getCell(doc, 0, 2)).toBeUndefined();
    expect(setCell(doc, 2, 0, emptyCell())).toBeUndefined();
    expect(inBounds(doc, 1, 1)).toBe(true);
    expect(inBounds(doc, 2, 0)).toBe(false);
  });

  it("compares cells by value including colors", () => {
    expect(cellsEqual({ char: "a" }, { char: "a" })).toBe(true);
    expect(cellsEqual({ char: "a" }, { char: "b" })).toBe(false);
    expect(cellsEqual({ char: "a", foreground: "#fff" }, { char: "a" })).toBe(false);
    expect(
      cellsEqual({ char: "a", background: "#000" }, { char: "a", background: "#000" }),
    ).toBe(true);
  });

  it("counts painted cells", () => {
    const doc = createDocument(3, 3);
    expect(countPaintedCells(doc)).toBe(0);
    setCell(doc, 0, 0, { char: "x", foreground: "#fff" });
    setCell(doc, 2, 2, { char: " ", background: "#123456" }); // colored blank still counts
    expect(countPaintedCells(doc)).toBe(2);
  });
});
