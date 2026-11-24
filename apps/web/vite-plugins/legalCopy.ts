import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { sliceLegalCopy } from "../src/pages/legal/legalSlice";

// Virtual module "virtual:legal-copy": reads the draft legal copy at build time
// (and in Vitest) and exports ONLY the four values the /terms and /privacy pages
// need. The rest of the file never reaches the JavaScript bundle.
const VIRTUAL_ID = "virtual:legal-copy";
const RESOLVED_ID = "\0" + VIRTUAL_ID;
const SOURCE_RELATIVE = "../../docs/legal-copy-draft-tos-privacy-policy.md";

export function legalCopyPlugin(): Plugin {
  let sourcePath = "";
  return {
    name: "soccernity-legal-copy",
    configResolved(config) {
      sourcePath = path.resolve(config.root, SOURCE_RELATIVE);
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      this.addWatchFile(sourcePath);
      const copy = sliceLegalCopy(fs.readFileSync(sourcePath, "utf8"));
      return Object.entries(copy)
        .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
        .join("\n");
    },
    configureServer(server) {
      // Dev: reload when the markdown changes.
      server.watcher.add(sourcePath);
      server.watcher.on("change", (file) => {
        if (path.resolve(file) !== sourcePath) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
