// Source of the /terms and /privacy pages: the draft legal copy document
// itself, imported raw at build time so the live app always renders whatever
// version of docs/legal-copy-draft-tos-privacy-policy.md exists at merge time
// (v0.2 or v0.3 alike). No copy is duplicated into the app.
import rawSource from "../../../../../docs/legal-copy-draft-tos-privacy-policy.md?raw";

// The source file marks itself "NOT APPROVED" until counsel signs off. The
// banner below is shown for as long as that text is present in the source, so
// it disappears only when the source file itself stops carrying the status.
// Normalise CRLF (the file is checked out with Windows line endings on some machines).
const source = rawSource.replace(/\r\n?/g, "\n");

export const IS_NOT_APPROVED = /NOT APPROVED/.test(source);

function between(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) return "";
  const end = source.indexOf(endMarker, start);
  return (end === -1 ? source.slice(start) : source.slice(start, end))
    .replace(/\n---\s*$/, "")
    .trim();
}

// "PART A" holds "# Soccernity Terms of Service"; "PART B" holds
// "# Soccernity Privacy Policy"; "PART C" (open items for counsel) is not
// part of either public page.
export const TERMS_MARKDOWN = between("# Soccernity Terms of Service", "## PART B");
export const PRIVACY_MARKDOWN = between("# Soccernity Privacy Policy", "## PART C");

// Version line from the source header, e.g. "0.3 (draft -- still NOT APPROVED)".
export const SOURCE_VERSION = /\*\*Version:\*\*\s*(.+)/.exec(source)?.[1]?.trim() ?? "";
