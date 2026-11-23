/* global process */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sliceLegalCopy } from "./legalSlice";
import * as legal from "./legalDocument";

const SOURCE_PATH = path.resolve(process.cwd(), "../../docs/legal-copy-draft-tos-privacy-policy.md");
const raw = fs.readFileSync(SOURCE_PATH, "utf8");

// The logic legalDocument.ts used before the build-time slice (R112), kept here
// as the reference the new exports must equal byte for byte.
function oldLogic(rawSource: string) {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const between = (startMarker: string, endMarker: string): string => {
    const start = source.indexOf(startMarker);
    if (start === -1) return "";
    const end = source.indexOf(endMarker, start);
    return (end === -1 ? source.slice(start) : source.slice(start, end)).replace(/\n---\s*$/, "").trim();
  };
  return {
    IS_NOT_APPROVED: /NOT APPROVED/.test(source),
    TERMS_MARKDOWN: between("# Soccernity Terms of Service", "## PART B"),
    PRIVACY_MARKDOWN: between("# Soccernity Privacy Policy", "## PART C"),
    SOURCE_VERSION: /\*\*Version:\*\*\s*(.+)/.exec(source)?.[1]?.trim() ?? "",
  };
}

describe("legal copy build-time slice", () => {
  it("the virtual module exports equal the old logic on the real file", () => {
    const old = oldLogic(raw);
    expect(legal.IS_NOT_APPROVED).toBe(old.IS_NOT_APPROVED);
    expect(legal.SOURCE_VERSION).toBe(old.SOURCE_VERSION);
    expect(legal.TERMS_MARKDOWN).toBe(old.TERMS_MARKDOWN);
    expect(legal.PRIVACY_MARKDOWN).toBe(old.PRIVACY_MARKDOWN);
  });

  it("sliceLegalCopy equals the old logic, with LF and with CRLF input", () => {
    const fixture =
      "# Header\n**Version:** 9.9 (draft, NOT APPROVED)\n\n# Soccernity Terms of Service\nterms body\n\n---\n\n## PART B\n# Soccernity Privacy Policy\nprivacy body\n\n---\n\n## PART C\ncounsel notes DISPOSITION\n";
    for (const input of [fixture, fixture.replace(/\n/g, "\r\n")]) {
      expect(sliceLegalCopy(input)).toEqual(oldLogic(input));
    }
    expect(sliceLegalCopy(fixture).TERMS_MARKDOWN).toBe("# Soccernity Terms of Service\nterms body");
  });

  it("the public text carries no Part C or disposition marker", () => {
    // Part C and the disposition markers are counsel notes. Other bracketed
    // markers ([OPEN, [PROPOSAL, [v0.) legitimately appear inside the rendered
    // Terms and Privacy text today, so they are not asserted absent here.
    for (const text of [legal.TERMS_MARKDOWN, legal.PRIVACY_MARKDOWN]) {
      expect(text).not.toContain("PART C");
      expect(text).not.toContain("DISPOSITION");
    }
  });

  it("only the four public values are exported", () => {
    expect(Object.keys(legal).sort()).toEqual([
      "IS_NOT_APPROVED",
      "PRIVACY_MARKDOWN",
      "SOURCE_VERSION",
      "TERMS_MARKDOWN",
    ]);
  });
});
