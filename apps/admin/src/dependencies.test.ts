// Regression guard for the duplicate-React problem (Decision Log #27, B-246), the admin twin of
// apps/web's dependencies.test.ts. qrcode.react (B-271) peers on `react` and only apps/admin uses it, so
// without the scoped `overrides` in the root package.json npm hoists it to the repo root, where it
// resolves the root's React 18 (apps/mobile) while apps/admin renders with React 19: two copies of React
// in one bundle, and "Cannot read properties of null (reading 'useMemo')" the first time the QR renders.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directory npm would load `pkg` from when imported by apps/admin (walks up node_modules). */
function installDirOf(pkg: string): string {
  let dir = adminDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${pkg} is not installed for apps/admin`);
    dir = parent;
  }
}

/** The file `react` resolves to when required from inside `pkg`. */
function resolveFrom(installDir: string, request: string): string {
  return fs.realpathSync(createRequire(path.join(installDir, "package.json")).resolve(request));
}

describe("apps/admin resolves a single copy of React", () => {
  const adminReact = resolveFrom(adminDir, "react");

  it.each(["react-router", "@testing-library/react", "qrcode.react"])(
    "%s resolves the same react as apps/admin",
    (pkg) => {
      expect(resolveFrom(installDirOf(pkg), "react")).toBe(adminReact);
    },
  );
});
