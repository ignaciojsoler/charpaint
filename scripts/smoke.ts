/**
 * Headless smoke test: boots the real CharpaintApp against OpenTUI's test
 * renderer, drives mouse + keyboard through the real input parsers, and
 * asserts on the document. Run with: bun run scripts/smoke.ts
 */
import { createTestRenderer } from "@opentui/core/testing";
import { getCell } from "../src/core/document.ts";
import { CharpaintApp } from "../src/ui/app.ts";
import { CAT_ART, centerOrigin } from "../src/core/demo-art.ts";

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    console.error(`  FAIL  ${name}`);
    failures++;
  }
}

const setup = await createTestRenderer({ width: 100, height: 30 });

// CharpaintApp is constructed against the test renderer's CliRenderer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app = new CharpaintApp(setup.renderer as any, 60, 20);
const engine = (app as unknown as { engine: import("../src/core/engine.ts").DrawingEngine }).engine;

await setup.renderOnce();

// --- 1. layout: header + canvas + status are on screen ------------------
const frame1 = setup.captureCharFrame();
check("header shows CHARPAINT", frame1.includes("CHARPAINT"));
check("header shows document dimensions", frame1.includes("60×20"));
check("status bar shows shortcuts", frame1.includes("pan") && frame1.includes("? help"));
check(
  "sidebars render",
  ["Tools", "Characters", "Colors"].every((label) => frame1.includes(label)),
);

// --- 2. locate the canvas on screen via its global origin ---------------
const canvas = (app as unknown as { canvas: { globalOrigin(): { x: number; y: number } } })
  .canvas;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const origin = (canvas as any)["globalOrigin"]() as { x: number; y: number };
console.log(`  canvas origin: ${origin.x},${origin.y}`);

// --- 3. draw: drag a horizontal line with the mouse ----------------------
engine.pressure = 1;
await setup.mockMouse.drag(origin.x + 2, origin.y + 2, origin.x + 12, origin.y + 2);
await setup.renderOnce();

let painted = 0;
for (let x = 2; x <= 12; x++) {
  if (getCell(engine.doc, x, 2)?.char === "█") painted++;
}
check(`drag paints an unbroken line (${painted}/11 cells)`, painted === 11);
check("header marks document as modified", setup.captureCharFrame().includes("●"));

// --- 4. keyboard: undo ----------------------------------------------------
await setup.mockInput.pressKey("u");
await setup.renderOnce();
check("undo clears the stroke", getCell(engine.doc, 5, 2)?.char === " ");

// --- 5. keyboard: redo, then erase ----------------------------------------
await setup.mockInput.pressKey("U");
await setup.renderOnce();
check("redo restores the stroke", getCell(engine.doc, 5, 2)?.char === "█");

await setup.mockInput.pressKey("e");
await setup.mockMouse.drag(origin.x + 4, origin.y + 2, origin.x + 6, origin.y + 2);
await setup.renderOnce();
check("eraser wipes cells", getCell(engine.doc, 5, 2)?.char === " ");
check("eraser leaves neighbors", getCell(engine.doc, 10, 2)?.char === "█");

// --- 6. pressure simulation changes density --------------------------------
await setup.mockInput.pressKey("b");
engine.pressure = 0.1;
await setup.mockMouse.click(origin.x + 2, origin.y + 8);
engine.pressure = 0.95;
await setup.mockMouse.click(origin.x + 4, origin.y + 8);
await setup.renderOnce();
check("low pressure paints ','", getCell(engine.doc, 2, 8)?.char === ",");
check("high pressure paints '█'", getCell(engine.doc, 4, 8)?.char === "█");

engine.setPressure(0.7);
await setup.mockInput.pressKey("=");
await setup.mockMouse.click(origin.x + 8, origin.y + 8);
await setup.renderOnce();
check("80% pressure paints '@'", getCell(engine.doc, 8, 8)?.char === "@");

// --- 7. palette + fixed char ------------------------------------------------
await setup.mockInput.pressKey("p"); // ensure density mode off->fixed? no: clear fixed
await setup.mockInput.pressKey("]");
await setup.mockInput.pressKey("]"); // fixedChar = second palette char
await setup.mockMouse.click(origin.x + 6, origin.y + 8);
await setup.renderOnce();
check("char cycling selects a fixed char", getCell(engine.doc, 6, 8)?.char === ",");

// --- 8. text tool ------------------------------------------------------------
await setup.mockInput.pressKey("t");
await setup.mockMouse.click(origin.x + 2, origin.y + 12);
await setup.mockInput.typeText("hi");
await setup.mockInput.pressEnter();
await setup.mockInput.typeText("!");
await setup.mockInput.pressEscape();
await setup.renderOnce();
check("text tool types", getCell(engine.doc, 2, 12)?.char === "h" && getCell(engine.doc, 3, 12)?.char === "i");
check("text newline returns to anchor", getCell(engine.doc, 2, 13)?.char === "!");

// --- 9. line tool commits on release ------------------------------------------
await setup.mockInput.pressKey("l");
await setup.mockMouse.drag(origin.x + 20, origin.y + 5, origin.x + 20, origin.y + 10);
await setup.renderOnce();
let lineOk = true;
for (let y = 5; y <= 10; y++) {
  const c = getCell(engine.doc, 20, y)?.char;
  if (c === " " || c === undefined) lineOk = false;
}
check("line tool commits vertical line", lineOk);

// --- 10. UI: clickable tools, glyphs, colors and help -------------------------
const ui = app as unknown as {
  tools: { box: { screenX: number; screenY: number } };
  chars: { box: { screenX: number; screenY: number } };
  colors: { box: { screenX: number; screenY: number } };
};

const toolsBox = ui.tools.box;
await setup.mockMouse.click(toolsBox.screenX + 2, toolsBox.screenY + 2); // Eraser row
await setup.renderOnce();
check("clicking a tool row selects the tool", engine.tool === "eraser");
await setup.mockMouse.click(toolsBox.screenX + 2, toolsBox.screenY + 1); // Brush row
await setup.renderOnce();
check("clicking another tool row switches back", engine.tool === "brush");

const charsBox = ui.chars.box;
await setup.mockMouse.click(charsBox.screenX + 6, charsBox.screenY + 2); // second glyph
await setup.renderOnce();
check("clicking a glyph pins it", engine.brush.fixedChar === ",");
await setup.mockInput.pressKey("p");
await setup.renderOnce();
check("P returns to pressure mode", engine.brush.fixedChar === null);

const colorsBox = ui.colors.box;
await setup.mockMouse.click(colorsBox.screenX + 7, colorsBox.screenY + 1); // second FG swatch
await setup.renderOnce();
check("clicking a swatch sets the foreground", engine.brush.foreground === "#8a8f98");

await setup.mockInput.pressKey("?");
await setup.renderOnce();
check("? opens the help overlay", setup.captureCharFrame().includes("EDIT / VIEW"));
// A lone ESC is a sequence prefix in the test input parser, so toggle with "?".
await setup.mockInput.pressKey("?");
await setup.renderOnce();
check("help overlay toggles closed", !setup.captureCharFrame().includes("EDIT / VIEW"));

// --- 11. resize keeps the document and repaints --------------------------------
setup.renderer.resize(80, 24);
await setup.renderOnce();
await setup.renderOnce();
check("document survives resize", getCell(engine.doc, 2, 12)?.char === "h");
const frameAfterResize = setup.captureCharFrame();
check("header still renders after resize", frameAfterResize.includes("CHARPAINT"));

// --- 12. demo cat stamp (Shift+C) --------------------------------------------
await setup.mockInput.pressKey("C");
await setup.renderOnce();
const catOrigin = centerOrigin(CAT_ART, engine.doc.width, engine.doc.height);
const noseCell = getCell(engine.doc, catOrigin.x + 19, catOrigin.y + 12);
check("Shift+C stamps the cat (nose pixel)", noseCell?.foreground === "#ff7aa8");
check("cat outline pixel painted", getCell(engine.doc, catOrigin.x + 2, catOrigin.y)?.foreground === "#1f1410");
check("cat is visible in the frame", setup.captureCharFrame().includes("█"));

await setup.mockInput.pressKey("u");
await setup.renderOnce();
check("cat stamp undoes as one stroke", getCell(engine.doc, catOrigin.x + 19, catOrigin.y + 12)?.char === " ");

await setup.mockInput.pressKey("U");
await setup.renderOnce();
check("cat stamp redoes", getCell(engine.doc, catOrigin.x + 19, catOrigin.y + 12)?.foreground === "#ff7aa8");

setup.renderer.destroy();

// --- 13. adaptive canvas: fills the available area and follows growth --------
const autoSetup = await createTestRenderer({ width: 100, height: 30 });
const autoApp = new CharpaintApp(autoSetup.renderer as any, 60, 20, { autoGrow: true });
const autoEngine = (
  autoApp as unknown as { engine: import("../src/core/engine.ts").DrawingEngine }
).engine;
await autoSetup.renderOnce();
check(
  "auto canvas fills the available area at launch",
  autoEngine.doc.width === 60 && autoEngine.doc.height === 24,
);

autoEngine.pressure = 1;
const autoCanvas = (autoApp as unknown as { canvas: { screenX: number; screenY: number } })
  .canvas;
await autoSetup.mockMouse.click(autoCanvas.screenX + 5, autoCanvas.screenY + 3);
await autoSetup.renderOnce();

autoSetup.renderer.resize(120, 40);
await autoSetup.renderOnce();
await autoSetup.renderOnce();
check(
  "auto canvas grows with the terminal",
  autoEngine.doc.width === 80 && autoEngine.doc.height === 34,
);
check("auto canvas preserves content on growth", getCell(autoEngine.doc, 5, 3)?.char === "█");

autoSetup.renderer.destroy();

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) FAILED`);
  process.exit(1);
}
console.log("\nall smoke checks passed");
