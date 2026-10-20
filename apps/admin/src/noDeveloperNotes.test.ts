// FC4 (d): no developer note may be visible to an admin. A rendered string that names a
// Decision Log entry, the Build Plan, an endpoint or services/api is a note to the team,
// not product wording. This scans the source of every screen component (comments removed,
// so engineering comments stay legal) and fails on any such wording left in the markup or
// in a string literal. Real product wording and [COPY PENDING LEGAL REVIEW] strings are
// not matched by it.
/* global process */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const DIRS = ["pages", "layout", "components"];
const DEVELOPER_WORDING = [
  /Decision Log/i,
  /Build Plan/i,
  /services\/api/i,
  /\bendpoint\b/i,
  /\bbackend\b/i,
  /direct DB insert/i,
  /\bREADME\b/i,
];

function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("no developer notes in apps/admin screens", () => {
  const files = DIRS.flatMap((d) => walk(path.join(SRC, d)));

  it("scans the screen components", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("names no Decision Log, Build Plan, endpoint, backend or services/api in rendered text", () => {
    const offences: string[] = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        // Imports and identifiers (api/adminAuth, backendStatus) are code, not text.
        if (/^\s*(import|export \{)/.test(line)) return;
        for (const pattern of DEVELOPER_WORDING) {
          if (pattern.test(line)) offences.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offences).toEqual([]);
  });
});
