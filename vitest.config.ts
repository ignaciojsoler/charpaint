import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Core engine is pure TypeScript — no OpenTUI/FFI imports — so tests
    // run under plain Node with Vitest. UI smoke tests live in scripts/
    // and run with Bun.
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
