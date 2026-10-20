import { describe, expect, it } from "vitest";
import { createDocument, getCell } from "../src/core/document.ts";
import { History } from "../src/core/history.ts";
import type { CellChange } from "../src/core/types.ts";

function change(x: number, y: number, before = ".", after = "#"): CellChange {
  return { x, y, before: { char: before }, after: { char: after } };
}

describe("History", () => {
  it("undoes and redoes batches", () => {
    const doc = createDocument(4, 4);
    const history = new History();
    history.push([change(0, 0), change(1, 1)]);

    expect(history.canUndo).toBe(true);
    expect(history.undo(doc)).toBe(true);
    expect(getCell(doc, 0, 0)?.char).toBe(".");
    expect(history.canRedo).toBe(true);

    expect(history.redo(doc)).toBe(true);
    expect(getCell(doc, 0, 0)?.char).toBe("#");
    expect(history.canUndo).toBe(true);
  });

  it("deduplicates positions keeping earliest before and latest after", () => {
    const doc = createDocument(2, 2);
    const history = new History();
    history.push([change(0, 0, "a", "b"), change(0, 0, "b", "c")]);

    history.undo(doc);
    expect(getCell(doc, 0, 0)?.char).toBe("a");
    history.redo(doc);
    expect(getCell(doc, 0, 0)?.char).toBe("c");
  });

  it("drops no-op changes", () => {
    const history = new History();
    history.push([change(0, 0, "x", "x")]);
    expect(history.canUndo).toBe(false);
  });

  it("ignores empty batches", () => {
    const history = new History();
    history.push([]);
    expect(history.canUndo).toBe(false);
  });

  it("clears the redo stack on new work", () => {
    const doc = createDocument(2, 2);
    const history = new History();
    history.push([change(0, 0)]);
    history.undo(doc);
    expect(history.canRedo).toBe(true);
    history.push([change(1, 1)]);
    expect(history.canRedo).toBe(false);
  });

  it("respects the size limit", () => {
    const history = new History(3);
    for (let i = 0; i < 10; i++) history.push([change(i, 0)]);
    const doc = createDocument(10, 1);
    let undos = 0;
    while (history.undo(doc)) undos++;
    expect(undos).toBe(3);
  });

  it("returns false when nothing can be undone/redone", () => {
    const doc = createDocument(1, 1);
    const history = new History();
    expect(history.undo(doc)).toBe(false);
    expect(history.redo(doc)).toBe(false);
  });
});
