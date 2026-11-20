// Release gate: fails when the literal [COPY PENDING LEGAL REVIEW] tag would
// ship in a user-visible string of apps/web or apps/admin.
//
//   npm run build --workspace=apps/web --workspace=apps/admin
//   npm run check:pending-copy
//
// This is a RELEASE gate, not a pull-request gate. It is expected to FAIL
// today: several strings (guardian-consent, Age Gate, Register, the admin DOB
// correction) are still draft wording that counsel has not approved. It is
// therefore NOT part of `npm run build` or CI's normal run. It belongs in the
// production deploy path (build register B-090 / B-124), where a failure is the
// point.
//
// The allow-list (scripts/pending-copy/dist-allowlist.json) STAYS EMPTY. When
// counsel approves a string, strip the tag from the source string and delete
// its row from docs/pending-copy-manifest.md -- do not add it to the allow-list.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPendingCopyInDist } from "./pending-copy/distScan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirs = ["apps/web/dist", "apps/admin/dist"].map((d) => path.join(root, d));

const missing = distDirs.filter((d) => !fs.existsSync(d));
if (missing.length > 0) {
  console.error("Build output not found, so nothing could be checked:");
  for (const d of missing) console.error(`  ${path.relative(root, d)}`);
  console.error("Run the production builds first (npm run build --workspace=apps/web --workspace=apps/admin).");
  process.exit(2);
}

const allowlist = JSON.parse(fs.readFileSync(path.join(root, "scripts/pending-copy/dist-allowlist.json"), "utf8"));
if (!Array.isArray(allowlist) || allowlist.length > 0) {
  console.error("scripts/pending-copy/dist-allowlist.json must stay an EMPTY array.");
  console.error("Strip the tag from approved strings in source instead of allow-listing them.");
  process.exit(2);
}

process.chdir(root);
const violations = findPendingCopyInDist(distDirs, allowlist);

if (violations.length === 0) {
  console.log("OK: no [COPY PENDING LEGAL REVIEW] text in the production builds.");
  process.exit(0);
}

console.error(`FAIL: ${violations.length} place(s) where [COPY PENDING LEGAL REVIEW] would ship to users:\n`);
for (const v of violations) console.error(`  ${v.file}\n    ...${v.snippet}\n`);
console.error(
  "These strings are draft wording awaiting counsel. When counsel approves a string, strip the tag from the\n" +
    "source string and delete its row from docs/pending-copy-manifest.md. Do not add it to the allow-list\n" +
    "(scripts/pending-copy/dist-allowlist.json), which must stay empty.",
);
process.exit(1);
