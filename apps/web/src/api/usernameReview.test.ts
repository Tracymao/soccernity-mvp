// Username-review client (B-139 part (c)): request shapes, error codes and the empty-message rule.
import { describe, it, expect, vi, afterEach } from "vitest";
import { getUsernameReviewStatus, requestUsernameReview, UsernameReviewApiError } from "./usernameReview";

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("getUsernameReviewStatus", () => {
  it("GETs /users/me/username-review with the bearer token and returns the server's state as it is", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { state: "can_request", requestableUntil: "2026-12-01T23:59:59.999Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const status = await getUsernameReviewStatus("tok");
    expect(status).toEqual({ state: "can_request", requestableUntil: "2026-12-01T23:59:59.999Z" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/users\/me\/username-review$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.method).toBeUndefined();
  });

  it("throws an error carrying status and code on a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(403, { code: "username_review_not_available", message: "x" })));
    await expect(getUsernameReviewStatus("tok")).rejects.toMatchObject({ status: 403, code: "username_review_not_available" });
  });

  it("maps a network failure to a UsernameReviewApiError without a status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const err = await getUsernameReviewStatus("tok").catch((e) => e);
    expect(err).toBeInstanceOf(UsernameReviewApiError);
    expect(err.status).toBeUndefined();
  });
});

describe("requestUsernameReview", () => {
  it("POSTs the trimmed message as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(201, { state: "pending", requestableUntil: null }));
    vi.stubGlobal("fetch", fetchMock);
    await requestUsernameReview("tok", "  it was my name  ");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ message: "it was my name" });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends no message at all when it is empty or only spaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(201, { state: "pending", requestableUntil: null }));
    vi.stubGlobal("fetch", fetchMock);
    await requestUsernameReview("tok", "   ");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it.each([
    [409, "username_review_already_requested"],
    [403, "username_review_window_closed"],
    [400, "username_review_message_invalid"],
  ])("keeps the server's code on a %i", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, { code, message: "m" })));
    await expect(requestUsernameReview("tok", "")).rejects.toMatchObject({ status, code, message: "m" });
  });
});
