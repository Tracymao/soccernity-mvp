// Regression guard for the duplicate-React problem (Decision Log #27, B-246).
//
// In an npm-workspaces monorepo where apps/mobile and apps/admin once sat on
// React 18, a package that only apps/web depends on can get hoisted to the repo
// root and resolve ITS React from the root (18.x) while apps/web renders with
// its own nested React 19. Two copies of React in one bundle breaks hooks and
// context (the guardian card step's Stripe Elements is exactly such a consumer).
// The scoped `overrides` in the root package.json prevent that; this test fails
// if a React-consuming dependency ever resolves a different copy of react again.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directory npm would load `pkg` from when imported by apps/web (walks up node_modules). */
function installDirOf(pkg: string): string {
  let dir = webDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${pkg} is not installed for apps/web`);
    dir = parent;
  }
}

/** The file `react` (or react-dom) resolves to when required from inside `pkg`. */
function resolveFrom(installDir: string, request: string): string {
  return fs.realpathSync(
    createRequire(path.join(installDir, "package.json")).resolve(request),
  );
}

const webReact = resolveFrom(webDir, "react");
const webReactDom = resolveFrom(webDir, "react-dom");

describe("apps/web resolves a single copy of React", () => {
  it.each(["react-router", "@testing-library/react", "@stripe/react-stripe-js"])(
    "%s resolves the same react as apps/web",
    (pkg) => {
      expect(resolveFrom(installDirOf(pkg), "react")).toBe(webReact);
    },
  );

  it.each(["@testing-library/react", "@stripe/react-stripe-js"])(
    "%s resolves the same react-dom as apps/web",
    (pkg) => {
      expect(resolveFrom(installDirOf(pkg), "react-dom")).toBe(webReactDom);
    },
  );
});
