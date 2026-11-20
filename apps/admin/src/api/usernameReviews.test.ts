// B-139 part (c): the Username reviews client -- request shapes, the bounded fallback finder and the error-code reader.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./adminClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./adminClient")>();
  return { ...actual, adminFetch: vi.fn() };
});

import { adminFetch, AdminApiError } from "./adminClient";
import {
  decideUsernameReview,
  errorCode,
  findUsernameReviewById,
  listUsernameReviews,
  type UsernameReviewListItem,
} from "./usernameReviews";

function row(id: string): UsernameReviewListItem {
  return {
    id,
    status: "pending",
    createdAt: "2026-11-02T10:00:00.000Z",
    message: null,
    removedUsername: "adab",
    revokedAt: "2026-10-28T09:00:00.000Z",
    userId: "u",
    userDisplayName: "Ada",
    revokedBy: null,
  };
}

beforeEach(() => vi.mocked(adminFetch).mockReset());

describe("listUsernameReviews", () => {
  it("asks for the list with no query string by default", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ items: [], nextCursor: null });
    await listUsernameReviews();
    expect(adminFetch).toHaveBeenCalledWith("/admin/username-reviews");
  });

  it("sends the status, cursor and limit as query parameters", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ items: [], nextCursor: null });
    await listUsernameReviews({ status: "declined", cursor: "c 1", limit: 50 });
    expect(adminFetch).toHaveBeenCalledWith("/admin/username-reviews?status=declined&cursor=c+1&limit=50");
  });
});

describe("decideUsernameReview", () => {
  it("posts the decision and the reason to the request's decide route", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ id: "a b", status: "declined", decidedAt: "x" });
    await decideUsernameReview("a b", { decision: "decline", reason: "Not the person's own name." });
    expect(adminFetch).toHaveBeenCalledWith("/admin/username-reviews/a%20b/decide", {
      method: "POST",
      body: { decision: "decline", reason: "Not the person's own name." },
    });
  });
});

describe("findUsernameReviewById", () => {
  it("finds a request on the first page", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ items: [row("a"), row("b")], nextCursor: null });
    expect((await findUsernameReviewById("b"))?.id).toBe("b");
    expect(adminFetch).toHaveBeenCalledTimes(1);
    expect(adminFetch).toHaveBeenCalledWith("/admin/username-reviews?limit=50");
  });

  it("follows the cursor to later pages", async () => {
    vi.mocked(adminFetch)
      .mockResolvedValueOnce({ items: [row("a")], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [row("b")], nextCursor: null });
    expect((await findUsernameReviewById("b"))?.id).toBe("b");
    expect(adminFetch).toHaveBeenLastCalledWith("/admin/username-reviews?cursor=c1&limit=50");
  });

  it("returns null when the list ends without it", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ items: [row("a")], nextCursor: null });
    expect(await findUsernameReviewById("zzz")).toBeNull();
  });

  it("gives up after five pages rather than crawling without end", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ items: [row("a")], nextCursor: "more" });
    expect(await findUsernameReviewById("zzz")).toBeNull();
    expect(adminFetch).toHaveBeenCalledTimes(5);
  });

  it("lets a failed read through", async () => {
    vi.mocked(adminFetch).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    await expect(findUsernameReviewById("a")).rejects.toBeInstanceOf(AdminApiError);
  });
});

describe("errorCode", () => {
  it("reads the code from an API error body", () => {
    expect(errorCode(new AdminApiError(409, "x", { code: "username_review_not_pending" }))).toBe("username_review_not_pending");
  });

  it("returns null for anything without a string code", () => {
    expect(errorCode(new AdminApiError(500, "x", { message: "x" }))).toBeNull();
    expect(errorCode(new AdminApiError(500, "x", { code: 5 }))).toBeNull();
    expect(errorCode(new AdminApiError(500, "x"))).toBeNull();
    expect(errorCode(new TypeError("Failed to fetch"))).toBeNull();
    expect(errorCode(null)).toBeNull();
  });
});
