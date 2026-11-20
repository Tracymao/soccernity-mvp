// B-037: the media review client encodes a profile picture's id (it contains ":") in every path it builds, and
// recognises the two decision failures the screens react to.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./adminClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./adminClient")>();
  return { ...actual, adminFetch: vi.fn().mockResolvedValue({}) };
});
import { AdminApiError, adminFetch } from "./adminClient";
import {
  approveMedia,
  getMediaReviewItem,
  isAlreadyDecided,
  isProfileItem,
  isProfileItemId,
  isPublishFailed,
  mediaReviewItemPath,
  rejectMedia,
} from "./mediaReview";

const fetchMock = vi.mocked(adminFetch);
beforeEach(() => fetchMock.mockClear());

const PROFILE_ID = "avatar:6f1c2b8e-0d5a-4b8a-9f43-1c2d3e4f5a6b:77aa.jpg";

describe("media review client", () => {
  it("encodes a profile picture's id in the item, approve and reject paths", async () => {
    await getMediaReviewItem(PROFILE_ID);
    await approveMedia(PROFILE_ID);
    await rejectMedia(PROFILE_ID, "No");
    const enc = encodeURIComponent(PROFILE_ID);
    expect(enc).toContain("%3A");
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/admin/media-review/${enc}`);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/admin/media-review/${enc}/approve`, { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/admin/media-review/${enc}/reject`, { method: "POST", body: { reason: "No" } });
  });

  it("leaves a post media UUID unchanged", async () => {
    await getMediaReviewItem("0b9a6e1c-1111-4222-8333-444455556666");
    expect(fetchMock).toHaveBeenCalledWith("/admin/media-review/0b9a6e1c-1111-4222-8333-444455556666");
  });

  it("builds the review path with the id encoded", () => {
    expect(mediaReviewItemPath(PROFILE_ID)).toBe(`/moderation/media/${encodeURIComponent(PROFILE_ID)}`);
  });

  it("tells profile items from post media by type, and a bare id by its prefix", () => {
    expect(isProfileItem({ type: "profile_avatar" })).toBe(true);
    expect(isProfileItem({ type: "profile_cover" })).toBe(true);
    expect(isProfileItem({ type: "post_media" })).toBe(false);
    expect(isProfileItemId("cover:u:f.png")).toBe(true);
    expect(isProfileItemId("0b9a6e1c-1111-4222-8333-444455556666")).toBe(false);
  });

  it("recognises 409 already_decided and the retryable 503 media_publish_failed by code, not message", () => {
    expect(isAlreadyDecided(new AdminApiError(409, "anything", { code: "already_decided" }))).toBe(true);
    expect(isAlreadyDecided(new AdminApiError(409, "already_decided", { code: "not_in_queue" }))).toBe(false);
    expect(isPublishFailed(new AdminApiError(503, "x", { code: "media_publish_failed" }))).toBe(true);
    expect(isPublishFailed(new AdminApiError(503, "media_publish_failed", {}))).toBe(false);
    expect(isPublishFailed(new AdminApiError(500, "x", { code: "media_publish_failed" }))).toBe(false);
  });
});
