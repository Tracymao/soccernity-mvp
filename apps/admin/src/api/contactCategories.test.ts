// B-298 (Decision Log #492): the admin's one copy of the Contact Us categories must not drift from the
// backend's list (order included), and the label helper must name the seventh, "Appeal a suspension".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, contactCategoryLabel } from "./contactEnquiries";

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_CONSTANTS = path.resolve(
  here, "..", "..", "..", "..", "services", "api", "src", "modules", "contact", "contact.constants.ts",
);

function backendSource(): string {
  return fs.readFileSync(BACKEND_CONSTANTS, "utf8");
}

describe("Contact Us categories: the admin copy matches the backend", () => {
  const source = backendSource();

  it("has the same keys in the same order", () => {
    const block = /export const CONTACT_CATEGORIES = \[([\s\S]*?)\] as const;/.exec(source);
    if (!block) throw new Error("CONTACT_CATEGORIES not found in the backend constants file");
    const keys = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...CONTACT_CATEGORIES]).toEqual(keys);
    expect(keys[keys.length - 1]).toBe("suspension_appeal");
  });

  it("has the same labels", () => {
    const block = /export const CONTACT_CATEGORY_LABELS[^=]*= \{([\s\S]*?)\};/.exec(source);
    if (!block) throw new Error("CONTACT_CATEGORY_LABELS not found in the backend constants file");
    const labels: Record<string, string> = {};
    for (const m of block[1].matchAll(/([a-z_]+): '([^']*)'/g)) labels[m[1]] = m[2];
    expect(CONTACT_CATEGORY_LABELS).toEqual(labels);
  });

  it("labels suspension_appeal and passes an unknown key through unchanged", () => {
    expect(contactCategoryLabel("suspension_appeal")).toBe("Appeal a suspension");
    expect(contactCategoryLabel("something_new")).toBe("something_new");
  });
});
