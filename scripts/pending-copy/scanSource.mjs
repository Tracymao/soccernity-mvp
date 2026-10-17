// FC2 pending-copy guard (B-124, Decision Log #405): finds every
// user-visible string in apps/web and apps/admin that carries the
// [COPY PENDING LEGAL REVIEW] tag, using the TypeScript AST so that comments
// (which mention the tag a lot) are NOT counted -- only text that can reach a
// screen: JSX text, string literals, template literals.
//
// A "tagged string" is identified by (file, normalised text):
//   - a string / template literal  -> its value
//   - JSX text                     -> the text of the nearest JSX element that
//     holds it, flattened (child elements contribute their text, a
//     `{expression}` contributes `{…}`, `{" "}` contributes a space). If that
//     text is nothing but the tag, the PARENT element's text is used instead,
//     so the manifest says what the tag is attached to.
// Whitespace is collapsed and the common JSX entities are decoded, so a tag
// wrapped across two source lines still matches its manifest row.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const TAG_PATTERN = /COPY\s+PENDING\s+LEGAL\s+REVIEW/;

const ENTITIES = {
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&mdash;": "—",
  "&ndash;": "–",
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&hellip;": "…",
};

function decodeEntities(text) {
  return text.replace(/&[a-z#0-9]+;/gi, (match) => ENTITIES[match] ?? match);
}

export function normalise(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function isTestFile(file) {
  return /\.test\.(ts|tsx)$/.test(file) || /\.spec\.(ts|tsx)$/.test(file);
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") && !isTestFile(entry.name)) {
      out.push(full);
    }
  }
}

function flatten(node) {
  switch (node.kind) {
    case ts.SyntaxKind.JsxText:
      // `.text`, not getText(): getText() drops the leading whitespace, which
      // would glue `{expr}` to the word after it.
      return node.text;
    case ts.SyntaxKind.JsxExpression: {
      const expr = node.expression;
      if (expr && (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))) return expr.text;
      return expr ? "{…}" : "";
    }
    case ts.SyntaxKind.JsxElement:
      return node.children.map(flatten).join("");
    case ts.SyntaxKind.JsxFragment:
      return node.children.map(flatten).join("");
    default:
      return "";
  }
}

function withoutTag(text) {
  return normalise(text.replace(/\[?\s*COPY\s+PENDING\s+LEGAL\s+REVIEW[^\]]*\]?/g, ""));
}

/**
 * @param {string} file absolute path
 * @param {string} root repo root (for the relative path in results)
 * @returns {{ file: string, text: string }[]}
 */
export function scanFile(file, root) {
  const source = fs.readFileSync(file, "utf8");
  if (!TAG_PATTERN.test(source)) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const rel = path.relative(root, file).split(path.sep).join("/");
  const found = [];

  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // JSX attribute values and ordinary string literals.
      if (TAG_PATTERN.test(node.text)) found.push({ file: rel, text: normalise(node.text) });
    } else if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      for (const span of node.templateSpans) text += "{…}" + span.literal.text;
      if (TAG_PATTERN.test(text)) found.push({ file: rel, text: normalise(text) });
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      if (TAG_PATTERN.test(node.text)) {
        let holder = node.parent;
        let text = flatten(holder);
        while (withoutTag(text) === "" && holder.parent && holder.parent.kind === ts.SyntaxKind.JsxElement) {
          holder = holder.parent;
          text = flatten(holder);
        }
        found.push({ file: rel, text: normalise(text) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

/** Every tagged string under the given app source directories. */
export function scanApps(root, appDirs = ["apps/web/src", "apps/admin/src"]) {
  const files = [];
  for (const dir of appDirs) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  files.sort();
  return files.flatMap((f) => scanFile(f, root));
}

/**
 * Parses docs/pending-copy-manifest.md. Rows look like
 *   | `apps/web/src/pages/X.tsx` | the string | Figma frame |
 * Anything else (headings, prose, the header and divider rows) is ignored.
 * @returns {{ file: string, text: string, frame: string }[]}
 */
export function parseManifest(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|(.*)\|([^|]*)\|\s*$/);
    if (!m) continue;
    rows.push({ file: m[1].trim(), text: normalise(m[2]), frame: m[3].trim() });
  }
  return rows;
}

function key(entry) {
  return `${entry.file}\u0000${entry.text}`;
}

/**
 * Multiset comparison. Returns what is in the source but not the manifest
 * (a new, unrecorded tagged string) and what is in the manifest but not the
 * source (a stale row, usually because counsel approved the wording and the
 * tag was removed).
 */
export function compareToManifest(scanned, manifest) {
  const remaining = new Map();
  for (const row of manifest) remaining.set(key(row), (remaining.get(key(row)) ?? 0) + 1);
  const unlisted = [];
  for (const hit of scanned) {
    const k = key(hit);
    const n = remaining.get(k) ?? 0;
    if (n > 0) remaining.set(k, n - 1);
    else unlisted.push(hit);
  }
  const stale = [];
  for (const row of manifest) {
    const k = key(row);
    const n = remaining.get(k) ?? 0;
    if (n > 0) {
      stale.push(row);
      remaining.set(k, n - 1);
    }
  }
  return { unlisted, stale };
}
