import { describe, expect, it } from "vitest";
import {
  linePoints,
  normalizeRect,
  rectOutlinePoints,
  snapTo45,
  snapToSquare,
  stampOffsets,
} from "../src/core/geometry.ts";

describe("linePoints", () => {
  it("includes both endpoints", () => {
    const pts = linePoints(0, 0, 3, 0);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 3, y: 0 });
    expect(pts).toHaveLength(4);
  });

  it("handles a single point", () => {
    expect(linePoints(2, 2, 2, 2)).toEqual([{ x: 2, y: 2 }]);
  });

  it("draws diagonals without gaps", () => {
    const pts = linePoints(0, 0, 4, 4);
    expect(pts).toHaveLength(5);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      // 8-connected: every step moves at most one cell per axis
      expect(Math.abs(cur.x - prev.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cur.y - prev.y)).toBeLessThanOrEqual(1);
    }
  });

  it("draws steep lines without gaps", () => {
    const pts = linePoints(0, 0, 1, 10);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i]!.y - pts[i - 1]!.y)).toBeLessThanOrEqual(1);
    }
  });

  it("works in reverse", () => {
    expect(linePoints(3, 3, 0, 0)).toEqual(linePoints(0, 0, 3, 3).reverse());
  });
});

describe("rectOutlinePoints", () => {
  it("draws a closed perimeter for any corner order", () => {
    const a = rectOutlinePoints(1, 1, 4, 3);
    const b = rectOutlinePoints(4, 3, 1, 1);
    expect(new Set(a.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(b.map((p) => `${p.x},${p.y}`)),
    );
    // Perimeter of 4x3 rect: 2*4 + 2*3 - 4 corners = 8... = 2w+2h-4 = 10
    expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBe(10);
  });

  it("degenerates to a single cell", () => {
    expect(rectOutlinePoints(2, 2, 2, 2)).toEqual([{ x: 2, y: 2 }]);
  });
});

describe("normalizeRect", () => {
  it("normalizes corners to origin + inclusive size", () => {
    expect(normalizeRect(5, 4, 2, 1)).toEqual({ x: 2, y: 1, width: 4, height: 4 });
  });
});

describe("snap helpers", () => {
  it("snaps lines to horizontal", () => {
    expect(snapTo45({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 });
  });

  it("snaps lines to 45 degrees", () => {
    const snapped = snapTo45({ x: 0, y: 0 }, { x: 8, y: 4 });
    // aspect-corrected 45° line: |dy| should be about half |dx|
    expect(Math.abs(snapped.y)).toBe(4);
    expect(Math.abs(snapped.x)).toBe(8);
  });

  it("snaps rects to squares", () => {
    expect(snapToSquare({ x: 0, y: 0 }, { x: 7, y: 3 })).toEqual({ x: 7, y: 7 });
    expect(snapToSquare({ x: 5, y: 5 }, { x: 2, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});

describe("stampOffsets", () => {
  it("size 1 is a single cell", () => {
    expect(stampOffsets(1)).toEqual([{ x: 0, y: 0 }]);
  });

  it("grows monotonically with size", () => {
    const sizes = [1, 2, 3, 4].map((s) => stampOffsets(s).length);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("is wider than tall (terminal cell aspect correction)", () => {
    const offsets = stampOffsets(3);
    const xs = offsets.map((o) => o.x);
    const ys = offsets.map((o) => o.y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    expect(width).toBeGreaterThan(height);
  });

  it("clamps out-of-range sizes", () => {
    expect(stampOffsets(0)).toEqual(stampOffsets(1));
    expect(stampOffsets(99)).toEqual(stampOffsets(4));
  });
});
