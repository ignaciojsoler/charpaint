import { cellsEqual, setCell } from "./document.ts";
import type { CellChange, Document } from "./types.ts";

/**
 * Stroke-based undo/redo.
 *
 * Every drawing gesture (a brush drag, one committed line, a text session,
 * a canvas clear) is pushed as one batch of CellChanges, so a single undo
 * reverts the whole gesture. Batches are deduplicated by position keeping
 * the earliest `before` and the latest `after` — brush stamps overlap a
 * lot during interpolation, and no-ops (before === after) are dropped.
 */
export class History {
  private undoStack: CellChange[][] = [];
  private redoStack: CellChange[][] = [];

  constructor(private readonly limit = 200) {}

  push(changes: readonly CellChange[]): void {
    if (changes.length === 0) return;

    const byPosition = new Map<string, CellChange>();
    for (const change of changes) {
      const key = `${change.x},${change.y}`;
      const existing = byPosition.get(key);
      if (existing) {
        existing.after = change.after;
      } else {
        byPosition.set(key, { x: change.x, y: change.y, before: change.before, after: change.after });
      }
    }

    const batch = [...byPosition.values()].filter((c) => !cellsEqual(c.before, c.after));
    if (batch.length === 0) return;

    this.undoStack.push(batch);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(doc: Document): boolean {
    const batch = this.undoStack.pop();
    if (!batch) return false;
    for (let i = batch.length - 1; i >= 0; i--) {
      const change = batch[i]!;
      setCell(doc, change.x, change.y, change.before);
    }
    this.redoStack.push(batch);
    return true;
  }

  redo(doc: Document): boolean {
    const batch = this.redoStack.pop();
    if (!batch) return false;
    for (const change of batch) {
      setCell(doc, change.x, change.y, change.after);
    }
    this.undoStack.push(batch);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
