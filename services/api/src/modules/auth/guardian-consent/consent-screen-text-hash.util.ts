import { createHash } from 'crypto';
import * as ts from 'typescript';

// Tripwire support for CONSENT_SCREEN_VERSION (Decision Log #348). Extracts
// the guardian-visible consent wording from GuardianConsentConfirmPage.tsx
// and hashes it, so a spec can fail when the wording changes without the
// version constant being revisited.
//
// What counts as consent wording: JSX text nodes, plus string literals in
// top-level `const` initialisers (the WHAT_THEY_CAN_DO / WHAT_STAYS_OFF
// arrays, the generic error message). Imports, JSX attribute values
// (className, id, ...), comments, and string literals inside function
// bodies (status codes like "submitting") are ignored.
//
// Normalisation: lowercased, everything except letters/digits removed, so
// whitespace, punctuation and casing-only edits do NOT change the hash.
// A typo fix that changes letters DOES trip it -- the author then confirms
// no consent-basis change and updates only the recorded hash (see spec).
export function extractConsentText(tsxSource: string): string {
  const sf = ts.createSourceFile('page.tsx', tsxSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parts: string[] = [];

  const insideTopLevelConst = (node: ts.Node): boolean => {
    for (let n: ts.Node | undefined = node; n; n = n.parent) {
      if (ts.isFunctionLike(n)) return false;
      if (ts.isVariableStatement(n)) return n.parent === sf;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isJsxAttribute(node)) return;
    if (ts.isJsxText(node)) parts.push(node.text);
    else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      insideTopLevelConst(node)
    ) {
      parts.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function hashConsentText(tsxSource: string): string {
  return createHash('sha256').update(extractConsentText(tsxSource)).digest('hex');
}
