// B-284 (Decision Log #465): the admin's one copy of the report reason categories must not drift from the
// backend's list, and the label helper must say "Not categorised" for a report that carries none.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REASON_CATEGORY_NOT_SET_LABEL,
  REPORT_REASON_CATEGORIES,
  REPORT_REASON_CATEGORY_LABELS,
  reasonCategoryLabel,
} from "./moderation";

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_CONSTANTS = path.resolve(
  here,
  "..",
  "..",
  "..",
  "..",
  "services",
  "api",
  "src",
  "modules",
  "moderation",
  "moderation.constants.ts",
);

function backendSource(): string {
  return fs.readFileSync(BACKEND_CONSTANTS, "utf8");
}

/** The keys of `export const REPORT_REASON_CATEGORIES = [ ... ] as const;` in the backend, in order. */
function backendCategories(source: string): string[] {
  const block = /export const REPORT_REASON_CATEGORIES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error("REPORT_REASON_CATEGORIES not found in the backend constants file");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The label map of `export const REPORT_REASON_CATEGORY_LABELS` in the backend. */
function backendLabels(source: string): Record<string, string> {
  const block = /export const REPORT_REASON_CATEGORY_LABELS[^=]*= \{([\s\S]*?)\};/.exec(source);
  if (!block) throw new Error("REPORT_REASON_CATEGORY_LABELS not found in the backend constants file");
  const labels: Record<string, string> = {};
  for (const m of block[1].matchAll(/([a-z_]+): '([^']*)'/g)) labels[m[1]] = m[2];
  return labels;
}

describe("report reason categories: the admin copy matches the backend", () => {
  const source = backendSource();

  it("covers every category the backend lists, in the same order, and nothing else", () => {
    const fromBackend = backendCategories(source);
    expect(fromBackend.length).toBe(9);
    expect([...REPORT_REASON_CATEGORIES]).toEqual(fromBackend);
  });

  it("has a label for every category, equal to the backend's label", () => {
    const fromBackend = backendLabels(source);
    for (const key of REPORT_REASON_CATEGORIES) {
      expect(REPORT_REASON_CATEGORY_LABELS[key], key).toBeTruthy();
      expect(REPORT_REASON_CATEGORY_LABELS[key], key).toBe(fromBackend[key]);
    }
    expect(Object.keys(REPORT_REASON_CATEGORY_LABELS).sort()).toEqual([...REPORT_REASON_CATEGORIES].sort());
  });
});

describe("reasonCategoryLabel", () => {
  it("returns the label for each known key", () => {
    expect(reasonCategoryLabel("harassment_or_bullying")).toBe("Harassment or bullying");
    expect(reasonCategoryLabel("other")).toBe("Other");
  });

  it("says 'Not categorised' for null, undefined and an empty string", () => {
    expect(REASON_CATEGORY_NOT_SET_LABEL).toBe("Not categorised");
    expect(reasonCategoryLabel(null)).toBe("Not categorised");
    expect(reasonCategoryLabel(undefined)).toBe("Not categorised");
    expect(reasonCategoryLabel("")).toBe("Not categorised");
  });

  it("shows a key it does not know as it came (the server added one), never a guess", () => {
    expect(reasonCategoryLabel("a_new_category")).toBe("a_new_category");
  });
});
