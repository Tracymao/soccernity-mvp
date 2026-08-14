import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See MVP Build Plan Section 5 for the stack decision this implements.
export default defineConfig({
  plugins: [react()],
});
