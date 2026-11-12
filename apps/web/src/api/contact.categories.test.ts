/* global process */
// B-298 (Decision Log #492): the web's one copy of the Contact Us category keys must not drift from the
// backend's list (order included). The labels live in ContactPage.tsx and are asserted in its own test.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT_CATEGORIES } from "./contact";

// vitest runs with cwd = apps/web.
const BACKEND_CONSTANTS = path.resolve(
  process.cwd(), "..", "..", "services", "api", "src", "modules", "contact", "contact.constants.ts",
);

describe("Contact Us categories: the web copy matches the backend", () => {
  it("has the same keys in the same order, with suspension_appeal last", () => {
    const source = fs.readFileSync(BACKEND_CONSTANTS, "utf8");
    const block = /export const CONTACT_CATEGORIES = \[([\s\S]*?)\] as const;/.exec(source);
    if (!block) throw new Error("CONTACT_CATEGORIES not found in the backend constants file");
    const keys = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...CONTACT_CATEGORIES]).toEqual(keys);
    expect(CONTACT_CATEGORIES[CONTACT_CATEGORIES.length - 1]).toBe("suspension_appeal");
  });
});
