// B-206: validation rules, the filing request body, error messages by code, and a drift guard on the receiving
// bodies the filing form offers (they must match the backend's table, which is "pending counsel").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AdminApiError } from "./adminClient";
import {
  BODY_OTHER_MAX,
  NOTE_MAX,
  NOT_FILED_REASON_MAX,
  OTHER_BODY_KEY,
  RECEIVING_BODY_OPTIONS,
  REFERENCE_MAX,
  SET_ASIDE_REASON_MAX,
  SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE,
  SUSPECTED_ILLEGAL_ALREADY_RECORDED_CODE,
  SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE,
  SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE,
  SUSPECTED_ILLEGAL_STATUSES,
  describeWriteError,
  receivingBodyLabel,
  statusLabel,
  toFiledInput,
  validateFiledForm,
  validateNotFiledReason,
  validateSetAsideReason,
  type FiledFormValues,
} from "./suspectedIllegal";

const NOW = new Date("2026-11-16T12:00:00");

function values(over: Partial<FiledFormValues> = {}): FiledFormValues {
  return { bodyKey: "iwf", bodyOther: "", reference: "IWF-2026-0042", filedAt: "", note: "", ...over };
}

describe("set-aside reason", () => {
  it("is required, trimmed, 10 to 500 characters", () => {
    expect(validateSetAsideReason("")).toBe("Enter a reason to continue.");
    expect(validateSetAsideReason("          ")).toBe("Enter a reason to continue.");
    expect(validateSetAsideReason("too short")).toBe("Enter at least 10 characters.");
    expect(validateSetAsideReason("  nine char  ".trim().slice(0, 9))).toBe("Enter at least 10 characters.");
    expect(validateSetAsideReason("a".repeat(10))).toBeNull();
    expect(validateSetAsideReason("  " + "a".repeat(10) + "  ")).toBeNull();
    expect(validateSetAsideReason("a".repeat(SET_ASIDE_REASON_MAX))).toBeNull();
    expect(validateSetAsideReason("a".repeat(SET_ASIDE_REASON_MAX + 1))).toBe("Use at most 500 characters.");
  });
});

describe("decision not to file: reason", () => {
  it("is required, trimmed, 10 to 1000 characters", () => {
    expect(validateNotFiledReason("")).toBe("Enter a reason to continue.");
    expect(validateNotFiledReason("short")).toBe("Enter at least 10 characters.");
    expect(validateNotFiledReason("a".repeat(10))).toBeNull();
    expect(validateNotFiledReason("a".repeat(NOT_FILED_REASON_MAX))).toBeNull();
    expect(validateNotFiledReason("a".repeat(NOT_FILED_REASON_MAX + 1))).toBe("Use at most 1000 characters.");
  });
});

describe("filing form", () => {
  it("accepts a named body with a reference and no time", () => {
    expect(validateFiledForm(values(), NOW)).toEqual({});
  });

  it("needs a body and a reference", () => {
    expect(validateFiledForm(values({ bodyKey: "", reference: "  " }), NOW)).toEqual({
      bodyKey: "Choose a receiving body.",
      reference: "Enter the reference you were given.",
    });
  });

  it("needs the body's name only for Other", () => {
    expect(validateFiledForm(values({ bodyKey: OTHER_BODY_KEY, bodyOther: " " }), NOW)).toEqual({ bodyOther: "Name the body." });
    expect(validateFiledForm(values({ bodyKey: OTHER_BODY_KEY, bodyOther: "Local police" }), NOW)).toEqual({});
    expect(validateFiledForm(values({ bodyKey: "iwf", bodyOther: "ignored for a named body" }), NOW)).toEqual({});
    expect(
      validateFiledForm(values({ bodyKey: OTHER_BODY_KEY, bodyOther: "x".repeat(BODY_OTHER_MAX + 1) }), NOW).bodyOther,
    ).toBe("Use at most 200 characters.");
  });

  it("refuses a filing time in the future or one that is not a date, and allows a past or blank time", () => {
    expect(validateFiledForm(values({ filedAt: "2026-11-16T12:01" }), NOW).filedAt).toBe("The filing time cannot be in the future.");
    expect(validateFiledForm(values({ filedAt: "not a date" }), NOW).filedAt).toBe("Enter a valid date and time.");
    expect(validateFiledForm(values({ filedAt: "2026-11-16T11:59" }), NOW)).toEqual({});
    expect(validateFiledForm(values({ filedAt: "" }), NOW)).toEqual({});
  });

  it("limits the reference and the note", () => {
    expect(validateFiledForm(values({ reference: "r".repeat(REFERENCE_MAX + 1) }), NOW).reference).toBe("Use at most 200 characters.");
    expect(validateFiledForm(values({ note: "n".repeat(NOTE_MAX + 1) }), NOW).note).toBe("Use at most 1000 characters.");
    expect(validateFiledForm(values({ note: "n".repeat(NOTE_MAX) }), NOW)).toEqual({});
  });

  it("builds the request with trimmed text, the name only for Other, the time as ISO, and blanks left out", () => {
    expect(toFiledInput(values({ reference: "  REF-1  ", note: "   " }))).toEqual({ bodyKey: "iwf", reference: "REF-1" });
    expect(toFiledInput(values({ bodyKey: OTHER_BODY_KEY, bodyOther: " Local police ", note: " done by phone " }))).toEqual({
      bodyKey: OTHER_BODY_KEY,
      bodyOther: "Local police",
      reference: "IWF-2026-0042",
      note: "done by phone",
    });
    const withTime = toFiledInput(values({ filedAt: "2026-11-16T09:30" }));
    expect(withTime.filedAt).toBe(new Date("2026-11-16T09:30").toISOString());
  });
});

describe("error messages are chosen by code, never by the server's wording", () => {
  const fallback = "FALLBACK";
  it("maps each known code", () => {
    expect(describeWriteError(new AdminApiError(409, "x", { code: SUSPECTED_ILLEGAL_ALREADY_RECORDED_CODE }), fallback)).toBe(
      "This file has already been set aside.",
    );
    expect(describeWriteError(new AdminApiError(409, "x", { code: SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE }), fallback)).toBe(
      "This record has already been decided.",
    );
    expect(describeWriteError(new AdminApiError(400, "x", { code: SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE }), fallback)).toBe(
      "Name the body when you choose “Other”.",
    );
    expect(describeWriteError(new AdminApiError(400, "x", { code: SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE }), fallback)).toBe(
      "The filing time cannot be in the future.",
    );
  });

  it("ignores the English message and falls back for an unknown code or none", () => {
    expect(describeWriteError(new AdminApiError(409, "This file has already been set aside.", { code: "something_else" }), fallback)).toBe(fallback);
    expect(describeWriteError(new AdminApiError(500, "boom"), fallback)).toBe(fallback);
    expect(describeWriteError(new Error("network"), fallback)).toBe(fallback);
  });
});

describe("labels", () => {
  it("names the three statuses and passes an unknown one through", () => {
    expect(statusLabel("set_aside")).toBe("Not filed");
    expect(statusLabel("filed")).toBe("Filed");
    expect(statusLabel("not_filed")).toBe("Decided not to file");
    expect(statusLabel("mystery")).toBe("mystery");
    expect([...SUSPECTED_ILLEGAL_STATUSES]).toEqual(["set_aside", "filed", "not_filed"]);
  });

  it("names a receiving body, Other with its name, and a missing one as a dash", () => {
    expect(receivingBodyLabel("ncmec", null)).toBe("National Center for Missing & Exploited Children (NCMEC)");
    expect(receivingBodyLabel(OTHER_BODY_KEY, "Local police")).toBe("Other: Local police");
    expect(receivingBodyLabel(OTHER_BODY_KEY, null)).toBe("Other");
    expect(receivingBodyLabel(null, null)).toBe("—");
    expect(receivingBodyLabel("unknown_body", null)).toBe("unknown_body");
  });
});

describe("receiving bodies: the form's list matches the backend's table", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.resolve(here, "..", "..", "..", "..", "services", "api", "src", "modules", "suspected-illegal-media", "receiving-bodies.constants.ts"),
    "utf8",
  );

  it("offers the same keys and labels, in the same order, as RECEIVING_BODIES", () => {
    const block = /export const RECEIVING_BODIES[^=]*= \[([\s\S]*?)\n\];/.exec(source);
    if (!block) throw new Error("RECEIVING_BODIES not found in the backend constants file");
    const entries = [...block[1].matchAll(/key: '([a-z_]+)',\s*label: '([^']*)'/g)].map((m) => ({ key: m[1], label: m[2] }));
    expect(entries.length).toBeGreaterThan(0);
    expect([...RECEIVING_BODY_OPTIONS]).toEqual(entries);
  });

  it("uses the same key for Other", () => {
    expect(source).toContain(`OTHER_BODY_KEY = '${OTHER_BODY_KEY}'`);
  });
});
