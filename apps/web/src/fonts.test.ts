import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The web app loads its fonts itself (self-hosted @fontsource files imported once in main.tsx), because
// nothing else does: without them every page falls back to the system sans-serif. This test keeps the
// entry's font imports and the CSS in step: a rule that uses a family at a weight with no imported file
// would silently render the nearest weight (or a faux bold), so it fails here instead.

const SRC = path.dirname(fileURLToPath(import.meta.url));
const resolveModule = createRequire(import.meta.url).resolve;
const FAMILIES = ["Inter", "Montserrat"] as const;
type Family = (typeof FAMILIES)[number];

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

function importedWeights(): Record<Family, Set<string>> {
  const main = readFileSync(path.join(SRC, "main.tsx"), "utf8");
  const found: Record<Family, Set<string>> = { Inter: new Set(), Montserrat: new Set() };
  for (const match of main.matchAll(/import\s+"@fontsource\/(inter|montserrat)\/latin-(\d{3})\.css";/g)) {
    found[match[1] === "inter" ? "Inter" : "Montserrat"].add(match[2]);
  }
  return found;
}

// Every (family, weight) a CSS declaration block pins down. A block that sets a weight but names no
// family inherits one from its parent; those weights are only required to exist for at least one family.
function usedWeights(): { pairs: Map<string, string>; inherited: Map<string, string> } {
  const pairs = new Map<string, string>();
  const inherited = new Map<string, string>();
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const block of css.match(/\{[^{}]*\}/g) ?? []) {
      const shorthand = block.match(/font:\s*(?:italic\s+)?(\d{3})\s+[^;]*?"(Inter|Montserrat)"/);
      if (shorthand) {
        pairs.set(`${shorthand[2]} ${shorthand[1]}`, path.relative(SRC, file));
        continue;
      }
      const weight = block.match(/font-weight:\s*(\d{3})/);
      if (!weight) continue;
      const family = block.match(/font-family:\s*"(Inter|Montserrat)"/);
      if (family) pairs.set(`${family[1]} ${weight[1]}`, path.relative(SRC, file));
      else inherited.set(weight[1], path.relative(SRC, file));
    }
  }
  return { pairs, inherited };
}

describe("self-hosted fonts", () => {
  const imported = importedWeights();
  const { pairs, inherited } = usedWeights();

  it("finds the font imports in main.tsx and the weights the CSS uses", () => {
    expect(imported.Inter.size).toBeGreaterThan(0);
    expect(imported.Montserrat.size).toBeGreaterThan(0);
    expect(pairs.size).toBeGreaterThan(0);
  });

  it("imports a font file for every family and weight the CSS uses", () => {
    const missing = [...pairs]
      .filter(([key]) => {
        const [family, weight] = key.split(" ") as [Family, string];
        return !imported[family].has(weight);
      })
      .map(([key, file]) => `${key} (used in ${file})`);
    expect(missing).toEqual([]);
  });

  it("covers every weight a rule sets without naming a family (inherited family)", () => {
    const missing = [...inherited]
      .filter(([weight]) => !imported.Inter.has(weight) && !imported.Montserrat.has(weight))
      .map(([weight, file]) => `${weight} (used in ${file})`);
    expect(missing).toEqual([]);
  });

  it("imports only files that exist, and nothing the CSS never uses", () => {
    for (const family of FAMILIES) {
      for (const weight of imported[family]) {
        const file = resolveModule(`@fontsource/${family.toLowerCase()}/latin-${weight}.css`);
        expect(existsSync(file)).toBe(true);
        expect(pairs.has(`${family} ${weight}`), `${family} ${weight} is imported but no CSS uses it`).toBe(true);
      }
    }
  });

  it("does not load fonts from a font CDN", () => {
    const html = readFileSync(path.resolve(SRC, "..", "index.html"), "utf8");
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    for (const file of cssFiles(SRC)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });
});
