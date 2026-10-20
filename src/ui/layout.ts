import { BoxRenderable, type RenderContext } from "@opentui/core";
import type { Point } from "../core/types.ts";
import { UI } from "./theme.ts";

interface Positioned {
  screenX: number;
  screenY: number;
}

/** Absolute screen position of a renderable. */
export function absoluteOrigin(node: Positioned): Point {
  return { x: node.screenX, y: node.screenY };
}

export interface PanelSpec {
  id: string;
  title?: string;
  width?: number;
  height?: number;
  flexGrow?: number;
  flexShrink?: number;
  borderColor?: string;
  bottomTitle?: string;
}

/** A rounded, titled panel — the basic chrome unit of the app. */
export function panel(ctx: RenderContext, spec: PanelSpec): BoxRenderable {
  return new BoxRenderable(ctx, {
    id: spec.id,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: spec.borderColor ?? UI.border,
    backgroundColor: UI.panelBg,
    ...(spec.title !== undefined ? { title: spec.title, titleColor: UI.textMuted } : {}),
    ...(spec.width !== undefined ? { width: spec.width } : {}),
    ...(spec.height !== undefined ? { height: spec.height } : {}),
    ...(spec.flexGrow !== undefined ? { flexGrow: spec.flexGrow } : {}),
    ...(spec.flexShrink !== undefined ? { flexShrink: spec.flexShrink } : {}),
    ...(spec.bottomTitle !== undefined
      ? { bottomTitle: spec.bottomTitle, bottomTitleAlignment: "right" }
      : {}),
  });
}

/** Horizontal filler for rows: pushes the following items right. */
export function spacer(ctx: RenderContext): BoxRenderable {
  return new BoxRenderable(ctx, { flexGrow: 1, height: 1 });
}

/** One-line row used by lists and grids. */
export function listRow(ctx: RenderContext, id: string): BoxRenderable {
  return new BoxRenderable(ctx, {
    id,
    height: 1,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 1,
    paddingRight: 1,
  });
}
