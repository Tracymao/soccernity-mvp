// B-303: the admin's copy of the audit-log action kinds must not fall behind the backend's list
// (services/api ADMIN_ACTION_LOG_ACTIONS). A key with no entry in ACTION_KINDS shows as its raw key on a row and
// cannot be picked in the Action filter. Reads the backend constants file by path, as contactCategories.test.ts does.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTION_KINDS, actionLabel } from "./adminActionLog";

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_CONSTANTS = path.resolve(
  here, "..", "..", "..", "..", "services", "api", "src", "modules", "admin-action-log", "admin-action-log.constants.ts",
);

function backendKeys(): string[] {
  const source = fs.readFileSync(BACKEND_CONSTANTS, "utf8");
  const block = /export const ADMIN_ACTION_LOG_ACTIONS = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (!block) throw new Error("ADMIN_ACTION_LOG_ACTIONS not found in the backend constants file");
  // Drop // comments first: they mention other action strings in quotes.
  const code = block[1].replace(/\/\/[^\n]*/g, "");
  return [...code.matchAll(/^\s*[A-Z_]+:\s*'([a-z_.]+)'/gm)].map((m) => m[1]);
}

describe("audit-log action kinds: the admin copy matches the backend", () => {
  it("reads a plausible number of keys from the backend file", () => {
    expect(backendKeys().length).toBeGreaterThanOrEqual(29);
  });

  it("has a label for every action key the backend can write", () => {
    const have = new Set(ACTION_KINDS.map((kind) => kind.value));
    const missing = backendKeys().filter((key) => !have.has(key));
    expect(
      missing,
      `Add these action keys to ACTION_KINDS in apps/admin/src/api/adminActionLog.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the same order as the backend list", () => {
    const backend = backendKeys();
    const admin = ACTION_KINDS.map((kind) => kind.value).filter((key) => backend.includes(key));
    expect(admin).toEqual(backend);
  });

  it("offers no action key the backend does not know", () => {
    const backend = new Set(backendKeys());
    const extra = ACTION_KINDS.map((kind) => kind.value).filter((key) => !backend.has(key));
    expect(extra).toEqual([]);
  });

  it("labels the two keys B-303 added, and passes an unknown key through", () => {
    expect(actionLabel("report.appeal_recorded")).toBe("Appeal recorded");
    expect(actionLabel("user.username_review_decided")).toBe("Username review decided");
    expect(actionLabel("something.new")).toBe("something.new");
  });
});
