import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// See MVP Build Plan Section 5 for the stack decision this implements.
//
// `test` block: mirrors apps/web/vite.config.ts exactly — `defineConfig`
// comes from `vitest/config` (which re-exports Vite's own defineConfig
// with the `test` field merged in) so this one file carries both Vite's
// and Vitest's config. jsdom is the DOM environment Vitest needs to
// render React components; @testing-library/react is the render harness
// (v16 — React 19 support, matching apps/web).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
