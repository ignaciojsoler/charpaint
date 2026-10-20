#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { createCliRenderer } from "@opentui/core";
import { CharpaintApp } from "./ui/app.ts";

const { values } = parseArgs({
  options: {
    width: { type: "string", short: "w", default: "80" },
    height: { type: "string", short: "h", default: "24" },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`CHARPAINT — real-time ASCII art terminal paint

Usage: bun run src/main.ts [--width N] [--height N]

  --width, -w   Document width in cells (default: 80)
  --height, -h  Document height in cells (default: 24)

Requires a terminal with mouse support (SGR mouse mode). Run inside a
real terminal — not a pipe — for full interactivity.`);
  process.exit(0);
}

const width = Number(values.width);
const height = Number(values.height);
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 4) {
  console.error("error: --width must be an integer >= 8, --height an integer >= 4");
  process.exit(1);
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 60,
});

new CharpaintApp(renderer, width, height);

const shutdown = () => renderer.destroy();
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
