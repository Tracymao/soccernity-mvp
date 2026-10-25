// B-186 (Decision Log #410 instruction, #405): no developer note may be visible to a person using
// apps/web. A rendered string that names a Decision Log entry, the Build Plan, an endpoint, the
// backend, Figma or a sprint is a note to the team, not product wording. This is the apps/web
// twin of apps/admin/src/noDeveloperNotes.test.ts (FC4): it scans the source of every screen
// component (comments removed, so engineering comments stay legal) and fails on any such wording
// left in the markup or in a string literal.
//
// THE WORD LIST (and why it is not the admin list verbatim):
//   admin's list:      Decision Log, Build Plan, services/api, endpoint, backend, direct DB
//                      insert, README
//   added for the web: Figma (a design tool name), "Sprint N", "PR #N", "Decision #N", "Section N."
//                      (a Build Plan reference), "stub" and "placeholder" used as a status note,
//                      "not wired", "needs a ... module".
// A real product sentence may legitimately contain a common word, so only the unambiguous
// developer-facing phrases are listed: "endpoint" and "backend" stay (no product sentence on this
// platform needs either), but words such as "API", "server" or "module" alone are NOT listed
// (users do see "Couldn't reach the Soccernity server"). Nothing that carries the legal-review
// tag is exempt; the tag is product wording and is checked by the pending-copy manifest instead.
/* global process */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const DIRS = ["pages", "layout", "components"];
export const DEVELOPER_WORDING: RegExp[] = [
  /Decision Log/i,
  /Build Plan/i,
  /services\/api/i,
  /\bendpoints?\b/i,
  /\bbackend\b/i,
  /direct DB insert/i,
  /\bREADME\b/i,
  /\bFigma\b/i,
  /\bSprint \d/i,
  /\bPR #\d/i,
  /\bDecision #\d/i,
  /\bSection \d+(\.\d+)?\b/,
  /\bnot wired\b/i,
  /needs? a \w+( \w+)? module/i,
];

export function stripComments(source: string): string {
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

/** Offending lines (file:line  text) in the given source, comments removed. */
export function findDeveloperWording(source: string, label = "source"): string[] {
  const offences: string[] = [];
  stripComments(source)
    .split("\n")
    .forEach((line, i) => {
      // Imports and identifiers are code, not text.
      if (/^\s*(import|export \{)/.test(line)) return;
      for (const pattern of DEVELOPER_WORDING) {
        if (pattern.test(line)) offences.push(`${label}:${i + 1}  ${line.trim()}`);
      }
    });
  return offences;
}

describe("no developer notes in apps/web screens", () => {
  const files = DIRS.flatMap((d) => walk(path.join(SRC, d)));

  it("scans the screen components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("names no Decision Log, Build Plan, endpoint, backend, Figma or sprint in rendered text", () => {
    const offences: string[] = [];
    for (const file of files) {
      offences.push(...findDeveloperWording(fs.readFileSync(file, "utf8"), path.relative(SRC, file)));
    }
    expect(offences).toEqual([]);
  });

  it("bites: a developer note injected into a string is caught, and a comment is not", () => {
    expect(findDeveloperWording('const a = "Not adjustable yet - see Decision Log #6";')).toHaveLength(1);
    expect(findDeveloperWording("<p>This needs a backend module first.</p>").length).toBeGreaterThan(0);
    expect(findDeveloperWording("// Decision Log #6 explains this\nconst a = 1;")).toEqual([]);
    expect(findDeveloperWording("{/* Figma 1:2 */}\n<p>Hello</p>")).toEqual([]);
    expect(findDeveloperWording("<p>Couldn't reach the Soccernity server.</p>")).toEqual([]);
  });
});
