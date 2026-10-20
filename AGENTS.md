# AGENTS.md

## What this is

CHARPAINT: an interactive ASCII-art paint app for the terminal.
TypeScript + OpenTUI (`@opentui/core`, imperative renderables, no React).

## Commands

- `bun run start` — launch the app (needs a real TTY)
- `bun run test` — Vitest unit tests (run under Node; core has no FFI deps)
- `bun run typecheck` — strict `tsc --noEmit`
- `bun run smoke` — headless end-to-end check via `@opentui/core/testing`

## Non-negotiables

- `src/core/**` must NEVER import `@opentui/core` or any Node/Bun APIs.
  It is the pure, fully unit-tested drawing engine (document model, brush,
  history, tools). The UI layer (`src/ui/**`) adapts terminal I/O to it.
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on.
- Pointer input goes through `PointerInput` (`src/core/types.ts`). Pressure
  is simulated by the app layer; do not hardcode mouse assumptions into the
  engine — tablet adapters must be able to supply real pressure later.
- Undo/redo is stroke-granular via `History` batches of `CellChange`.
- `CanvasView` renders via a shadow-cell diff: only write changed cells to
  the frame buffer. Do not add full-repaint paths.

## Runtime notes

- App runs on Bun (OpenTUI native FFI). Node is only used for Vitest.
- Key events: letters normalize to lowercase `name` + `shift` flag
  (e.g. Shift+U → `{ name: "u", shift: true }`). Match shortcuts accordingly.
