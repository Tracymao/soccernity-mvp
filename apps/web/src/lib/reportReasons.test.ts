import { describe, expect, it } from "vitest";
import { REPORT_REASON_CATEGORIES } from "../api/moderation";
import {
  REPORT_REASON_LABELS,
  REPORT_REASON_OPTIONS,
  canSubmitReport,
  detailsRequired,
  detailsToSend,
} from "./reportReasons";

describe("report reason labels", () => {
  it("has exactly one label for each of the nine categories, in the server's order", () => {
    expect(REPORT_REASON_OPTIONS.map((o) => o.value)).toEqual([...REPORT_REASON_CATEGORIES]);
    expect(Object.keys(REPORT_REASON_LABELS).sort()).toEqual([...REPORT_REASON_CATEGORIES].sort());
    for (const option of REPORT_REASON_OPTIONS) expect(option.label.trim().length).toBeGreaterThan(0);
  });

  it("labels are the ones drawn in Figma", () => {
    expect(REPORT_REASON_OPTIONS.map((o) => o.label)).toEqual([
      "Harassment or bullying",
      "Hate or abusive language",
      "Threats or violence",
      "Child safety concern",
      "Sexual or inappropriate content",
      "Impersonation or fake account",
      "Spam or scam",
      "Privacy or image misuse",
      "Other",
    ]);
  });
});

describe("the description rule", () => {
  it("only Other requires a description", () => {
    for (const category of REPORT_REASON_CATEGORIES) {
      expect(detailsRequired(category)).toBe(category === "other");
    }
    expect(detailsRequired(null)).toBe(false);
  });

  it("a report can be sent once a category is chosen, and for Other once a description is written", () => {
    expect(canSubmitReport(null, "anything")).toBe(false);
    expect(canSubmitReport("spam_or_scam", "")).toBe(true);
    expect(canSubmitReport("other", "")).toBe(false);
    expect(canSubmitReport("other", "   ")).toBe(false);
    expect(canSubmitReport("other", " x ")).toBe(true);
  });

  it("sends the trimmed description, or nothing", () => {
    expect(detailsToSend("  hello ")).toBe("hello");
    expect(detailsToSend("")).toBeUndefined();
    expect(detailsToSend("   ")).toBeUndefined();
  });
});
