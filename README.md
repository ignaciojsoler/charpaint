# CHARPAINT

Real-time ASCII art terminal paint. Draw directly with characters — the canvas
**is** a character grid, not a pixel image converted to ASCII after the fact.

![status](https://img.shields.io/badge/status-prototype-orange)

## Run

```bash
bun install
bun run start                          # canvas fills the terminal
bun run src/main.ts -w 100 -h 30       # fixed 100×30 document
```

By default the canvas is **adaptive**: the document starts at the size left
over by the tool sidebars, status bar and borders, and grows when you enlarge
the window. Shrinking never destroys artwork — the document keeps its size and
the viewport pans with the arrow keys. Pass both `--width` and `--height` to
pin a fixed-size document.

Requires [Bun](https://bun.sh) (OpenTUI's native core loads through its FFI)
and a terminal with mouse reporting (see *Terminal compatibility* below).

## Interface

```
┌ Tools ─────┐┌ Canvas 60×20 ────────────┐┌ Characters ─┐
│ Brush    B ││                          ││ ‹ Density › │
│ Eraser   E ││      the document        ││ . , : ; +   │
├ Actions ───┤│                          │├ Colors ─────┤
│ Undo    ^Z ││                          ││ FG ■ ■ ■ ■  │
├ Brush ─────┤│                          ││   ■ ■ ■ ■   │
│ Char # auto││                          │└─────────────┘
└────────────┘└──────────────────────────┘
 BRUSH # auto · Density · size 1 · ██████░░░░ 60% · FG ■
 ←↑↓→ pan · drag to paint · Tab palette · ? help
```

Every panel is clickable: tool rows, undo/redo/clear/demo-cat, palette arrows,
glyph chips, color swatches, the pressure bar and the `? help` hint. `?` or
`h` opens a modal shortcut reference (`Esc` closes it).

The layout adapts to the terminal: both sidebars need at least 78 columns,
56–77 keeps only the right sidebar, and narrower terminals fall back to the
canvas alone. Short panels (Actions, Brush, Colors) drop out as the terminal
gets shorter, and the status/hints text switches to compact variants.

## Controls

| Action | Input |
| --- | --- |
| Draw | Left click + drag |
| Eyedropper (char + colors) | Right click, or `i` + left click |
| Tools | `b` brush · `e` eraser · `l` line · `r` rect · `t` text · `i` picker |
| Shape constraint | Hold `Shift` while dragging line/rect (45° / square) |
| Palettes | `Tab` / `Shift+Tab` (Density, ASCII, Blocks, Organic, Technical) |
| Fixed char / density mode | `[` `]` cycle chars · `p` back to pressure-driven density |
| Simulated pressure | `-` / `+` |
| Brush size | `1`–`4` (aspect-corrected round stamps) |
| Foreground / background | `f`/`F`, `g`/`G`, or click the color swatches |
| Undo / redo | `u` or `Ctrl+Z` · `Shift+U` or `Ctrl+Y` (stroke-granular) |
| Clear canvas | `c` (undoable) |
| Demo cat | `Shift+C` (stamps centered, one undoable stroke) |
| Pan viewport | Arrow keys (when the document is larger than the view) |
| Help / close help | `?` or `h` · `Esc` |
| Click UI | tools · undo/redo/clear/cat · glyphs · swatches · pressure bar |
| Text tool | Click to place the cursor, type, `Enter` newline, `Esc` finish |
| Quit | `q` or `Ctrl+C` |

## Architecture

```
src/
  core/                  # pure TypeScript, zero terminal imports, Vitest-tested
    types.ts             #   Cell, Document, PointerInput, ToolId
    document.ts          #   grid model + pure cell ops
    geometry.ts          #   Bresenham lines, rects, aspect-corrected stamps
    palettes.ts          #   character palettes + paint colors
    brush.ts             #   pressure → density mapping, cell resolution
    history.ts           #   stroke-based undo/redo
    engine.ts            #   DrawingEngine: tool state machine orchestrating all of the above
  ui/                    # OpenTUI layer (runs under Bun)
    app.ts               #   app shell: layout, responsive chrome, help, key/mouse wiring
    layout.ts            #   panel/row/spacer helpers and absolute screen positions
    left-panel.ts        #   Tools, Actions and Brush panels
    right-panel.ts       #   Characters and Colors panels
    canvas-view.ts       #   Document → FrameBuffer bridge with shadow-cell diffing
    theme.ts             #   UI colors, RGBA cache
  main.ts                # entry point
test/                    # Vitest unit tests (Node) — core only, no FFI
scripts/smoke.ts         # headless end-to-end check (Bun + @opentui/core/testing)
```

The drawing engine never imports OpenTUI. The UI layer feeds it
`PointerInput` and key commands and subscribes to changes. This keeps the
whole drawing workflow unit-testable under plain Node.

### Pointer abstraction and pressure

Terminal mouse protocols report position and buttons — **never stylus
pressure**. CHARPAINT therefore ships with a pressure *simulator* (`-`/`+`)
whose value the mouse adapter injects into every sample:

```ts
interface PointerInput {
  x: number;
  y: number;
  pressure: number;   // 0..1
  tiltX?: number;
  tiltY?: number;
  buttons: number;
}
```

Pressure indexes the active palette as a light→heavy ramp. The default
"Density" palette has ten glyphs — `.` `,` `:` `;` `+` `*` `#` `%` `@` `█` —
one per 10% pressure band, keeping the spec anchors (`:` medium-low, `+`
medium, `#` high, `█` max). A future
tablet adapter only has to deliver real `pressure`/`tilt` through the same
interface — the brush engine, tools, and renderer stay untouched.

### Rendering

The document is rendered to an OpenTUI `FrameBufferRenderable`. The view
keeps a shadow copy of the native buffer and only writes cells whose desired
state changed; OpenTUI's native frame differ handles the rest, so drawing is
flicker-free. Empty cells get a faint dot grid so the canvas reads as a
worksheet. Terminal resizes re-derive the viewport from the document (the
document itself never resizes under you) and the viewport auto-scrolls to keep
the pointer visible.

## Terminal compatibility notes

- **Mouse**: OpenTUI enables SGR mouse reporting with motion tracking.
  Works in kitty, Ghostty, Alacritty, WezTerm, iTerm2, GNOME Terminal,
  Windows Terminal, and most modern emulators. Inside tmux/screen, mouse
  support depends on the multiplexer config (`set -g mouse on` in tmux).
- **Drag capture**: the canvas owns the drag once a stroke starts, so
  fast drags that leave the window still end cleanly.
- **No click events**: terminals send button down/up pairs; strokes are
  interpolated with Bresenham between samples, so fast movements never
  leave gaps.
- **Keyboard**: modifiers beyond Ctrl/Shift/Alt vary by terminal; the
  Kitty keyboard protocol (when available) improves reporting. All core
  shortcuts here use portable encodings.
- **True color**: paint colors are 24-bit hex; on 256-color terminals the
  renderer approximates.

## Tests

```bash
bun run test       # Vitest unit tests for the core engine (Node)
bun run typecheck  # strict tsc
bun run smoke      # headless end-to-end: real app, mock mouse/keyboard (Bun)
```

## Roadmap (designed for, not yet implemented)

Real stylus/tablet adapters · brush textures & character patterns · layers ·
selections with copy/paste · save/load of native documents · export to TXT
and ANSI art · custom user brushes.
