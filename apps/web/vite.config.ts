import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// See MVP Build Plan Section 5 for the stack decision this implements.
//
// `test` block added for AgeGateStep.test.tsx (Decision Log #19) -- the
// first component tests in apps/web. `defineConfig` now comes from
// `vitest/config` rather than plain `vite` so this one file can carry
// both Vite's and Vitest's config without a separate vitest.config.ts;
// vitest/config re-exports Vite's own defineConfig with the `test` field
// merged in. jsdom is the DOM environment Vitest needs to render React
// components and dispatch form events in a Node test run;
// @testing-library/react is the render/query/fireEvent harness.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
