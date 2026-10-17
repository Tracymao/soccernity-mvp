// FC2 pending-copy guard, build half (B-124, Decision Log #405): looks inside a
// PRODUCTION BUILD for the literal [COPY PENDING LEGAL REVIEW] tag. If the tag
// is in a built file it is in a string a visitor can read.
//
// The allow-list is deliberately EMPTY (dist-allowlist.json). It exists so the
// mechanism is visible and so a conscious, reviewed exception has somewhere to
// go -- it is NOT a place to park strings until launch. Counsel approving a
// piece of wording means the tag is STRIPPED from the string in source (and its
// row removed from docs/pending-copy-manifest.md); it does not mean the string
// is added here.
import fs from "node:fs";
import path from "node:path";

const TAG = /COPY\s+PENDING\s+LEGAL\s+REVIEW/g;
const SCANNED_EXTENSIONS = /\.(js|mjs|cjs|html|css|json|txt|svg)$/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.test(entry.name)) out.push(full);
  }
}

/**
 * @param {string[]} distDirs absolute paths of build output directories
 * @param {string[]} allowlist substrings; a hit whose surrounding snippet
 *   contains one of them is allowed. Must stay empty in the repo.
 * @returns {{ file: string, snippet: string }[]} the hits NOT allowed
 */
export function findPendingCopyInDist(distDirs, allowlist = []) {
  const violations = [];
  for (const dir of distDirs) {
    const files = [];
    walk(dir, files);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      TAG.lastIndex = 0;
      let match;
      while ((match = TAG.exec(content)) !== null) {
        const start = Math.max(0, match.index - 80);
        const snippet = content.slice(start, match.index + match[0].length + 10).replace(/\s+/g, " ");
        if (!allowlist.some((entry) => snippet.includes(entry))) {
          violations.push({ file: path.relative(process.cwd(), file).split(path.sep).join("/"), snippet });
        }
      }
    }
  }
  return violations;
}
