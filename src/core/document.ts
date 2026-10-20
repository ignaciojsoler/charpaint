import type { Cell, Document } from "./types.ts";

export const EMPTY_CHAR = " ";

/** A pristine cell: blank glyph, no colors. */
export function emptyCell(): Cell {
  return { char: EMPTY_CHAR };
}

export function isEmptyCell(cell: Cell): boolean {
  return (
    cell.char === EMPTY_CHAR &&
    cell.foreground === undefined &&
    cell.background === undefined
  );
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    a.foreground === b.foreground &&
    a.background === b.background
  );
}

export function createDocument(width: number, height: number): Document {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid document dimensions: ${width}x${height}`);
  }
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) row.push(emptyCell());
    cells.push(row);
  }
  return { width, height, cells };
}

export function inBounds(doc: Document, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}

export function getCell(doc: Document, x: number, y: number): Cell | undefined {
  if (!inBounds(doc, x, y)) return undefined;
  return doc.cells[y]?.[x];
}

/**
 * Replace a cell. Returns the previous cell, or `undefined` when the
 * position is outside the document (nothing was written).
 */
export function setCell(doc: Document, x: number, y: number, cell: Cell): Cell | undefined {
  const row = doc.cells[y];
  if (!row || x < 0 || x >= doc.width) return undefined;
  const previous = row[x];
  if (previous === undefined) return undefined;
  row[x] = cell;
  return previous;
}

export function countPaintedCells(doc: Document): number {
  let painted = 0;
  for (const row of doc.cells) {
    for (const cell of row) {
      if (!isEmptyCell(cell)) painted++;
    }
  }
  return painted;
}

/**
 * Grow or shrink the document, preserving content in the overlapping
 * region and filling new cells with the empty state. Cells are immutable
 * (writes replace them), so sharing references with the old grid is safe.
 */
export function resizeDocument(doc: Document, width: number, height: number): Document {
  if (width === doc.width && height === doc.height) return doc;
  const next = createDocument(width, height);
  const copyWidth = Math.min(width, doc.width);
  const copyHeight = Math.min(height, doc.height);
  for (let y = 0; y < copyHeight; y++) {
    const source = doc.cells[y]!;
    const target = next.cells[y]!;
    for (let x = 0; x < copyWidth; x++) target[x] = source[x]!;
  }
  return next;
}
