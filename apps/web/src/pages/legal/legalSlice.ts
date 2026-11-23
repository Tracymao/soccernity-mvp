// Pure slicing of docs/legal-copy-draft-tos-privacy-policy.md into what the
// public /terms and /privacy pages show. Used at build time by the Vite
// plugin (vite-plugins/legalCopy.ts) so only these four values ship in the
// bundle, never the whole draft (changelog, Part C counsel notes, dispositions).
// Kept free of Node imports so it can be unit-tested in the normal src tree.

export interface LegalCopy {
  IS_NOT_APPROVED: boolean;
  SOURCE_VERSION: string;
  TERMS_MARKDOWN: string;
  PRIVACY_MARKDOWN: string;
}

export function sliceLegalCopy(rawSource: string): LegalCopy {
  // Normalise CRLF (the file is checked out with Windows line endings on some machines).
  const source = rawSource.replace(/\r\n?/g, "\n");

  function between(startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    if (start === -1) return "";
    const end = source.indexOf(endMarker, start);
    return (end === -1 ? source.slice(start) : source.slice(start, end))
      .replace(/\n---\s*$/, "")
      .trim();
  }

  return {
    // The source file marks itself "NOT APPROVED" until counsel signs off. The
    // banner is shown for as long as that text is present anywhere in the source.
    IS_NOT_APPROVED: /NOT APPROVED/.test(source),
    // "PART A" holds "# Soccernity Terms of Service"; "PART B" holds
    // "# Soccernity Privacy Policy"; "PART C" (open items for counsel) is not
    // part of either public page.
    TERMS_MARKDOWN: between("# Soccernity Terms of Service", "## PART B"),
    PRIVACY_MARKDOWN: between("# Soccernity Privacy Policy", "## PART C"),
    // Version line from the source header.
    SOURCE_VERSION: /\*\*Version:\*\*\s*(.+)/.exec(source)?.[1]?.trim() ?? "",
  };
}
