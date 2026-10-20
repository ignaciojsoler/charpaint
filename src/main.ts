#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { createCliRenderer } from "@opentui/core";
import { CharpaintApp } from "./ui/app.ts";

const { values } = parseArgs({
  options: {
    width: { type: "string", short: "w" },
    height: { type: "string", short: "h" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`CHARPAINT — real-time ASCII art terminal paint

Usage: bun run src/main.ts [--width N] [--height N]

  --width, -w   Document width in cells  (default: fill the terminal)
  --height, -h  Document height in cells (default: fill the terminal)

By default the canvas adapts to your terminal: it starts at the current
size and grows when you enlarge the window. Shrinking the window keeps
the artwork intact (pan with the arrow keys). Pass both flags to pin a
fixed-size document instead.

Requires a terminal with mouse support (SGR mouse mode). Run inside a
real terminal — not a pipe — for full interactivity.`);
  process.exit(0);
}

function parseDimension(value: string | undefined, min: number, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    console.error(`error: ${label} must be an integer >= ${min}`);
    process.exit(1);
  }
  return parsed;
}

const explicitWidth = parseDimension(values.width, 8, "--width");
const explicitHeight = parseDimension(values.height, 4, "--height");

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 60,
});

// Fully adaptive only when neither dimension is pinned.
const autoGrow = explicitWidth === undefined && explicitHeight === undefined;
const width = explicitWidth ?? Math.max(8, renderer.width);
const height = explicitHeight ?? Math.max(4, renderer.height - 4);

new CharpaintApp(renderer, width, height, { autoGrow });

const shutdown = () => renderer.destroy();
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
