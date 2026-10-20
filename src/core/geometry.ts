import type { Point } from "./types.ts";

/**
 * Integer Bresenham line, inclusive of both endpoints.
 * Used to interpolate between consecutive mouse positions so fast drags
 * never leave gaps in a stroke.
 */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalize two corners into an inclusive top-left origin + size. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): RectBounds {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    width: Math.abs(x1 - x0) + 1,
    height: Math.abs(y1 - y0) + 1,
  };
}

/** Perimeter cells of the rect defined by two opposite corners. */
export function rectOutlinePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const { x, y, width, height } = normalizeRect(x0, y0, x1, y1);
  const points: Point[] = [];
  const right = x + width - 1;
  const bottom = y + height - 1;
  for (let cx = x; cx <= right; cx++) {
    points.push({ x: cx, y });
    if (bottom !== y) points.push({ x: cx, y: bottom });
  }
  for (let cy = y + 1; cy < bottom; cy++) {
    points.push({ x, y: cy });
    if (right !== x) points.push({ x: right, y: cy });
  }
  return points;
}

/**
 * Snap an endpoint so the segment from `origin` is constrained to
 * 45-degree steps (used by the line tool with Shift held).
 */
export function snapTo45(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (dx === 0 && dy === 0) return point;
  // Terminal cells are ~1:2 (w:h); double dy so angles feel right on screen.
  const angle = Math.atan2(dy * 2, dx);
  const snapped = (Math.round(angle / (Math.PI / 4)) * Math.PI) / 4;
  const length = Math.hypot(dx, dy * 2);
  return {
    x: origin.x + Math.round(Math.cos(snapped) * length),
    y: origin.y + Math.round((Math.sin(snapped) * length) / 2),
  };
}

/** Snap two corners to a square (used by the rect tool with Shift held). */
export function snapToSquare(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: origin.x + (dx < 0 ? -size : size),
    y: origin.y + (dy < 0 ? -size : size),
  };
}

export const MAX_BRUSH_SIZE = 4;

const stampCache = new Map<number, Point[]>();

/**
 * Brush stamp offsets for a given size (1..MAX_BRUSH_SIZE).
 *
 * Offsets form an ellipse corrected for terminal cell aspect ratio (cells
 * are roughly twice as tall as they are wide), so stamps look round on
 * screen instead of vertically squashed. Size 1 is a single cell.
 */
export function stampOffsets(size: number): Point[] {
  const clamped = Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(size)));
  const cached = stampCache.get(clamped);
  if (cached) return cached;

  const radius = clamped - 0.5;
  const aspectX = 0.55; // horizontal compression to compensate cell aspect
  const offsets: Point[] = [];
  const maxDy = Math.ceil(radius);
  const maxDx = Math.ceil(radius / aspectX);
  for (let dy = -maxDy; dy <= maxDy; dy++) {
    for (let dx = -maxDx; dx <= maxDx; dx++) {
      if ((dx * aspectX) ** 2 + dy ** 2 <= radius ** 2) {
        offsets.push({ x: dx, y: dy });
      }
    }
  }
  stampCache.set(clamped, offsets);
  return offsets;
}
