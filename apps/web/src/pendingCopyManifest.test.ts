// B-124 pending-copy guard, inventory half (Decision Log #405). See
// docs/pending-copy-manifest.md for the whole mechanism and how counsel clears
// a string.
//
// The first describe block is the real guard: it scans the SOURCE of apps/web
// and apps/admin and fails when a tagged string and the manifest disagree.
// The other two test the tooling itself against throw-away fixtures, so the
// guard cannot quietly stop working.
/* global process */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareToManifest,
  normalise,
  parseManifest,
  scanApps,
  scanFile,
} from "../../../scripts/pending-copy/scanSource.mjs";
import { findPendingCopyInDist } from "../../../scripts/pending-copy/distScan.mjs";

// vitest runs with cwd = apps/web (jsdom gives import.meta.url a non-file scheme).
const ROOT = path.resolve(process.cwd(), "..", "..");
const MANIFEST_PATH = path.join(ROOT, "docs", "pending-copy-manifest.md");
const TAG = "[COPY PENDING LEGAL REVIEW]";

describe("pending-copy manifest matches the source of apps/web and apps/admin", () => {
  const scanned = scanApps(ROOT);
  const manifest = parseManifest(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const { unlisted, stale } = compareToManifest(scanned, manifest);

  it("finds the tagged strings at all (the scanner is not silently empty)", () => {
    expect(scanned.length).toBeGreaterThan(0);
    expect(manifest.length).toBeGreaterThan(0);
  });

  it("has a manifest row for every tagged string in the source", () => {
    expect(
      unlisted,
      "A string tagged [COPY PENDING LEGAL REVIEW] has no row in docs/pending-copy-manifest.md. " +
        "Add a row (file, the string as rendered, the Figma frame):\n" +
        unlisted.map((u) => `  ${u.file}\n    ${u.text}`).join("\n"),
    ).toEqual([]);
  });

  it("has no stale manifest rows (every row still matches a tagged string)", () => {
    expect(
      stale,
      "These manifest rows match no tagged string any more. If counsel approved the wording, the tag is gone " +
        "and the row must be deleted; if the wording changed, update the row:\n" +
        stale.map((s) => `  ${s.file}\n    ${s.text}`).join("\n"),
    ).toEqual([]);
  });

  it("gives every row a frame or an explicit 'no frame' note", () => {
    for (const row of manifest) expect(row.frame.length, row.text).toBeGreaterThan(0);
  });
});

describe("scanner (fixtures)", () => {
  const dirs: string[] = [];
  function fixture(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-copy-"));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  });

  it("finds a tag in JSX text, a string literal and a template literal, but not in a comment", () => {
    const dir = fixture({
      "apps/web/src/A.tsx": `
        // ${TAG} in a comment is not a user-visible string
        export const a = "plain ${TAG}";
        export const b = \`with \${x} ${TAG}\`;
        export const C = () => <p>Hello {name}. ${TAG}</p>;
      `,
    });
    const hits = scanApps(dir, ["apps/web/src"]).map((h) => h.text);
    expect(hits).toEqual(["plain " + TAG, "with {…} " + TAG, "Hello {…}. " + TAG]);
  });

  it("collapses a tag wrapped over two source lines and decodes entities", () => {
    const dir = fixture({
      "apps/web/src/B.tsx": `export const B = () => (
        <p>
          It&rsquo;s a wrapped sentence [COPY PENDING
          LEGAL REVIEW]
        </p>
      );`,
    });
    expect(scanApps(dir, ["apps/web/src"]).map((h) => h.text)).toEqual([
      "It’s a wrapped sentence [COPY PENDING LEGAL REVIEW]",
    ]);
  });

  it("attaches a bare tag span to its parent's text", () => {
    const dir = fixture({
      "apps/web/src/C.tsx": `export const C = () => (
        <label>I agree to this. <span>${TAG}</span></label>
      );`,
    });
    expect(scanApps(dir, ["apps/web/src"]).map((h) => h.text)).toEqual(["I agree to this. " + TAG]);
  });

  it("ignores test files and node_modules", () => {
    const dir = fixture({
      "apps/web/src/D.test.tsx": `export const d = "${TAG}";`,
      "apps/web/src/node_modules/x/index.ts": `export const x = "${TAG}";`,
    });
    expect(scanApps(dir, ["apps/web/src"])).toEqual([]);
  });

  it("compareToManifest reports an unlisted string and a stale row, and counts duplicates", () => {
    const hit = { file: "apps/web/src/A.tsx", text: "one " + TAG };
    const row = { file: "apps/web/src/A.tsx", text: "one " + TAG };
    expect(compareToManifest([hit], [row])).toEqual({ unlisted: [], stale: [] });
    expect(compareToManifest([hit], []).unlisted).toEqual([hit]);
    expect(compareToManifest([], [row]).stale).toEqual([row]);
    // The same string twice in one file needs two rows.
    expect(compareToManifest([hit, hit], [row]).unlisted).toEqual([hit]);
    // A tag in a file the manifest does not name is unlisted even if the text matches elsewhere.
    expect(compareToManifest([{ file: "apps/web/src/Other.tsx", text: hit.text }], [row]).unlisted).toHaveLength(1);
  });

  it("parseManifest reads only table rows that start with a backticked path", () => {
    const rows = parseManifest(
      [
        "# heading with " + TAG,
        "| File | String | Frame |",
        "|---|---|---|",
        "| `apps/web/src/A.tsx` | some  text   here " + TAG + " | Frame `1:2` |",
        "prose line | not | a row",
      ].join("\n"),
    );
    expect(rows).toEqual([{ file: "apps/web/src/A.tsx", text: "some text here " + TAG, frame: "Frame `1:2`" }]);
  });

  it("scanFile on a file with no tag returns nothing without parsing it", () => {
    const dir = fixture({ "apps/web/src/E.tsx": "export const e = 1;" });
    expect(scanFile(path.join(dir, "apps/web/src/E.tsx"), dir)).toEqual([]);
    expect(normalise("  a\n  b  ")).toBe("a b");
  });
});

describe("production-build check (fixtures)", () => {
  const dirs: string[] = [];
  function dist(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-dist-"));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  });

  it("fails when the literal tag is in a built file, including the minified one-line form", () => {
    const dir = dist({ "assets/index-abc.js": `a.jsx("p",{children:"Draft wording ${TAG}"});var z=1;` });
    const hits = findPendingCopyInDist([dir]);
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("Draft wording");
  });

  it("finds the tag in html and css too, and when its words are split by whitespace", () => {
    const dir = dist({
      "index.html": `<p>[COPY PENDING\n LEGAL REVIEW]</p>`,
      "assets/a.css": `.x::after{content:"${TAG}"}`,
    });
    expect(findPendingCopyInDist([dir])).toHaveLength(2);
  });

  it("passes a clean build", () => {
    const dir = dist({ "assets/index.js": `a.jsx("p",{children:"Approved wording"});` });
    expect(findPendingCopyInDist([dir])).toEqual([]);
  });

  it("an allow-list entry would let a hit through (the shipped allow-list must stay empty)", () => {
    const dir = dist({ "assets/index.js": `a.jsx("p",{children:"Special case ${TAG}"});` });
    expect(findPendingCopyInDist([dir], ["Special case"])).toEqual([]);
    const shipped = JSON.parse(
      fs.readFileSync(path.join(ROOT, "scripts", "pending-copy", "dist-allowlist.json"), "utf8"),
    );
    expect(shipped).toEqual([]);
  });
});
