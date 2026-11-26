import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { elevation, fontFamily, motion, radius, typeScale } from "@soccernity/shared";

// Drift guard: packages/shared tokens, foundations.css and Figma must agree.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  resolve(here, "../../../../packages/shared/src/tokens/foundations.css"),
  "utf8",
);

const rootBlock = css.match(/:root\s*\{([^}]*)\}/)![1];
const reducedBlock = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/)![1];

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--sn-[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const v = vars(rootBlock);

describe("foundations.css matches the shared tokens", () => {
  it("radius", () => {
    for (const k of ["sm", "md", "lg", "xl", "full"] as const) {
      expect(v[`--sn-radius-${k}`]).toBe(`${radius[k]}px`);
    }
  });
  it("type scale", () => {
    for (const [step, t] of Object.entries(typeScale)) {
      expect(v[`--sn-text-${kebab(step)}-size`]).toBe(`${t.size}px`);
      expect(v[`--sn-text-${kebab(step)}-line`]).toBe(`${t.line}px`);
    }
    expect(Object.keys(v).filter((k) => k.startsWith("--sn-text-"))).toHaveLength(
      Object.keys(typeScale).length * 2,
    );
  });
  it("font stacks", () => {
    expect(v["--sn-font-ui"]).toBe(fontFamily.ui);
    expect(v["--sn-font-display"]).toBe(fontFamily.display);
  });
  it("elevation", () => {
    expect(elevation.level0).toBe("none");
    expect(v["--sn-elevation-1"]).toBe(elevation.level1);
    expect(v["--sn-elevation-2"]).toBe(elevation.level2);
    expect(v["--sn-elevation-3"]).toBe(elevation.level3);
  });
  it("motion", () => {
    for (const k of ["fast", "base", "slow"] as const) {
      expect(v[`--sn-duration-${k}`]).toBe(`${motion.duration[k]}ms`);
    }
    for (const k of ["out", "in", "standard", "linear"] as const) {
      expect(v[`--sn-ease-${k}`]).toBe(motion.ease[k]);
    }
    for (const k of ["sm", "md", "lg"] as const) {
      expect(v[`--sn-distance-${k}`]).toBe(`${motion.distance[k]}px`);
    }
    expect(v["--sn-stagger-step"]).toBe(`${motion.staggerStep}ms`);
  });
});

describe("reduced motion", () => {
  it("collapses durations and distances and nothing else", () => {
    expect(vars(reducedBlock)).toEqual({
      "--sn-duration-fast": "0.01ms",
      "--sn-duration-base": "0.01ms",
      "--sn-duration-slow": "0.01ms",
      "--sn-distance-sm": "0px",
      "--sn-distance-md": "0px",
      "--sn-distance-lg": "0px",
    });
    expect(reducedBlock).toMatch(/html\s*\{\s*scroll-behavior:\s*auto;/);
  });
  it("has no blanket animation rule", () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(noComments).not.toMatch(/animation\s*:\s*none/);
  });
});

describe("app entries import the foundations", () => {
  it.each(["apps/web/src/main.tsx", "apps/admin/src/main.tsx"])("%s", (p) => {
    const src = readFileSync(resolve(here, "../../../..", p), "utf8");
    expect(src).toContain("@soccernity/shared/src/tokens/foundations.css");
  });
});
