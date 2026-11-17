// Production dependency audit gate (Decision Log #423, B-250).
//
// Runs `npm audit --omit=dev --workspace=<ws> --json` for each workspace and fails
// if any HIGH or CRITICAL advisory remains after removing the time-boxed entries in
// .github/audit-allowlist.json. An allow-list entry stops counting on its `expires`
// date, so a temporary exception cannot become permanent by being forgotten.
//
// Usage: node .github/scripts/audit-gate.mjs <workspace> [<workspace> ...]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BLOCKING = new Set(["high", "critical"]);

export function advisoryId(url) {
  const m = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(url || "");
  return m ? m[0].toLowerCase() : null;
}

// Root-cause advisories are the `via` entries that are objects; string entries only
// point at another vulnerable package, so they never add an advisory of their own.
export function collectAdvisories(auditJson) {
  const found = new Map();
  for (const vuln of Object.values(auditJson.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (typeof via !== "object" || !via) continue;
      if (!BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via.url) || `source-${via.source}`;
      found.set(id, { id, name: via.name, title: via.title, severity: via.severity, url: via.url });
    }
  }
  return [...found.values()];
}

export function activeAllowlist(entries, today) {
  const active = new Map();
  const expired = [];
  for (const e of entries) {
    if (e.expires && e.expires < today) expired.push(e);
    else active.set(String(e.id).toLowerCase(), e);
  }
  return { active, expired };
}

export function evaluate(auditJson, entries, today) {
  const { active, expired } = activeAllowlist(entries, today);
  const advisories = collectAdvisories(auditJson);
  const allowed = advisories.filter((a) => active.has(a.id));
  const blocking = advisories.filter((a) => !active.has(a.id));
  return { blocking, allowed, expired };
}

function runAudit(workspace) {
  try {
    return JSON.parse(
      execFileSync(
        "npm",
        ["audit", "--omit=dev", `--workspace=${workspace}`, "--json"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" },
      ),
    );
  } catch (err) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function main() {
  const workspaces = process.argv.slice(2);
  if (workspaces.length === 0) {
    console.error("usage: audit-gate.mjs <workspace> [<workspace> ...]");
    process.exit(2);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entries = JSON.parse(readFileSync(path.join(here, "..", "audit-allowlist.json"), "utf8"));
  const today = new Date().toISOString().slice(0, 10);

  let failed = false;
  for (const ws of workspaces) {
    console.log(`::group::npm audit --omit=dev --workspace=${ws} (High and above, allow-list applied)`);
    const { blocking, allowed, expired } = evaluate(runAudit(ws), entries, today);
    for (const a of allowed) {
      console.log(`allowed (temporary, see .github/audit-allowlist.json): ${a.id} ${a.name} - ${a.title}`);
    }
    for (const e of expired) {
      console.log(`allow-list entry EXPIRED on ${e.expires} and no longer applies: ${e.id}`);
    }
    for (const a of blocking) {
      console.log(`::error::${a.severity} advisory in ${ws}: ${a.id} ${a.name} - ${a.title} ${a.url}`);
      failed = true;
    }
    if (blocking.length === 0) console.log(`no blocking advisories in ${ws}`);
    console.log("::endgroup::");
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
