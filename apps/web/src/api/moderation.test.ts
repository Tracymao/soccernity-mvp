// Moderation client: what a report submission puts on the wire, and how the server's answers become a sentence
// (B-284, Decision Log #465). The routes' own behaviour is services/api's test suite's job.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicReport,
  createReport,
  ModerationApiError,
  reportSubmitErrorMessage,
} from "./moderation";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("createReport", () => {
  it("sends the category, and no `reason` key when there is no description", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "r1" }));
    vi.stubGlobal("fetch", fetchMock);
    await createReport("tok", { targetType: "post", targetId: "p1", reasonCategory: "spam_or_scam" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/reports$/);
    expect(JSON.parse(init.body)).toEqual({ targetType: "post", targetId: "p1", reasonCategory: "spam_or_scam" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("sends the description when there is one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "r1" }));
    vi.stubGlobal("fetch", fetchMock);
    await createReport("tok", { targetType: "user", targetId: "u1", reasonCategory: "other", reason: "Because" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      targetType: "user",
      targetId: "u1",
      reasonCategory: "other",
      reason: "Because",
    });
  });

  it("carries the server's status, message and code on the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          statusCode: 400,
          code: "report_reason_required",
          message: "Please describe the problem in a few words.",
        }),
      ),
    );
    const err = await createReport("tok", { targetType: "post", targetId: "p1", reasonCategory: "other" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ModerationApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("report_reason_required");
    expect(err.message).toBe("Please describe the problem in a few words.");
  });

  it("reads the first message of a validation array, with no code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { statusCode: 400, message: ["reasonCategory must be one of"] })),
    );
    const err = await createReport("tok", { targetType: "post", targetId: "p1", reasonCategory: "spam_or_scam" }).catch(
      (e) => e,
    );
    expect(err.message).toBe("reasonCategory must be one of");
    expect(err.code).toBeUndefined();
  });

  it("a network failure is an error with no status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await createReport("tok", { targetType: "post", targetId: "p1", reasonCategory: "spam_or_scam" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ModerationApiError);
    expect(err.status).toBeUndefined();
  });
});

describe("createPublicReport", () => {
  it("sends the category, the contact email and concernsMinor, with no Authorization header and no empty reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "r1" }));
    vi.stubGlobal("fetch", fetchMock);
    await createPublicReport({
      reporterContactEmail: "a@b.com",
      targetType: "comment",
      targetId: "c1",
      reasonCategory: "child_safety_concern",
      concernsMinor: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/reports\/public$/);
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init.body)).toEqual({
      reporterContactEmail: "a@b.com",
      targetType: "comment",
      targetId: "c1",
      reasonCategory: "child_safety_concern",
      concernsMinor: true,
    });
  });

  it("carries the server's code on the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { code: "report_reason_required", message: "Describe it." })),
    );
    const err = await createPublicReport({
      reporterContactEmail: "a@b.com",
      targetType: "post",
      targetId: "p1",
      reasonCategory: "other",
      concernsMinor: false,
    }).catch((e) => e);
    expect(err.code).toBe("report_reason_required");
    expect(err.status).toBe(400);
  });
});

describe("reportSubmitErrorMessage", () => {
  const msg = (status: number | undefined, message: string, code?: string) =>
    reportSubmitErrorMessage(new ModerationApiError(message, { status, code }));

  it.each([
    [400, "Please describe the problem in a few words.", "report_reason_required", "Please describe the problem in a few words."],
    [400, "reasonCategory must be one of", undefined, "Couldn't submit that report. Check your choices and try again."],
    [401, "Unauthorized", undefined, "Please log in again to send a report."],
    [404, "User not found", undefined, "User not found"],
    [429, "ThrottlerException: Too Many Requests", undefined, "You're sending reports too quickly. Please wait a moment and try again."],
    [500, "Couldn't submit that report (500).", undefined, "Couldn't submit that report (500)."],
    [undefined, "Couldn't reach the Soccernity server.", undefined, "Couldn't reach the Soccernity server."],
  ])("status %s %s -> the sentence shown", (status, message, code, expected) => {
    expect(msg(status as number | undefined, message as string, code as string | undefined)).toBe(expected);
  });

  it("anything that is not a ModerationApiError gets a generic sentence", () => {
    expect(reportSubmitErrorMessage(new Error("boom"))).toBe("Couldn't submit that report. Please try again.");
    expect(reportSubmitErrorMessage("nope")).toBe("Couldn't submit that report. Please try again.");
  });
});
