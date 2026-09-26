// VideosCarousel: real view counts, click-to-play view recording (never on
// render/scroll), video-only filtering, paging, empty/error/no-session.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideosCarousel from "./VideosCarousel";
import { FeedApiError, type FeedPost } from "../../api/feed";

vi.mock("../../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../../api/feed")>("../../api/feed");
  return { ...actual, getFeed: vi.fn(), recordPostView: vi.fn() };
});

import { getFeed, recordPostView } from "../../api/feed";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "user-1", role: "fan" })}.sig`;

function post(id: string, mediaUrls: string[], viewCount: number, name = "Ada"): FeedPost {
  return {
    id,
    authorId: `a-${id}`,
    author: { id: `a-${id}`, displayName: name, isFollowing: false },
    contentText: `caption ${id}`,
    mediaUrls,
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    viewCount,
    createdAt: "2026-09-01T00:00:00.000Z",
    isLiked: false,
    isSaved: false,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("sn_access_token", TOKEN);
  vi.mocked(getFeed).mockReset();
  vi.mocked(recordPostView).mockReset();
  // jsdom does not implement HTMLMediaElement.play/load.
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.load = vi.fn();
});

afterEach(() => cleanup());

describe("VideosCarousel", () => {
  it("shows only posts with a video, with the real viewCount (0 stays '0 views', 1 is singular)", async () => {
    vi.mocked(getFeed).mockResolvedValue({
      items: [
        post("p1", ["https://cdn/x/a.mp4"], 0, "Ada"),
        post("p2", ["https://cdn/x/photo.jpg"], 99, "Bo"),
        post("p3", ["https://cdn/x/b.webm"], 1, "Cy"),
        post("p4", ["https://cdn/x/c.mov"], 2000, "Di"),
      ],
      nextCursor: null,
    });
    render(<VideosCarousel />);

    expect(await screen.findByText("0 views")).not.toBeNull();
    expect(screen.getByText("1 view")).not.toBeNull();
    expect(screen.getByText("2000 views")).not.toBeNull();
    expect(screen.queryByText("99 views")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Play video by/ })).toHaveLength(3);
  });

  it("does NOT record a view on render or scroll, only on click-to-play", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [post("p1", ["https://cdn/x/a.mp4"], 5)], nextCursor: null });
    render(<VideosCarousel />);
    await screen.findByText("5 views");

    fireEvent.scroll(document.querySelector(".videos-card__track")!);
    expect(recordPostView).not.toHaveBeenCalled();
  });

  it("records exactly one view on click and shows the server-returned count", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [post("p1", ["https://cdn/x/a.mp4"], 5)], nextCursor: null });
    vi.mocked(recordPostView).mockResolvedValue({ postId: "p1", viewCount: 6 });
    render(<VideosCarousel />);

    fireEvent.click(await screen.findByRole("button", { name: "Play video by Ada" }));

    expect(screen.getByRole("dialog", { name: "Video by Ada" })).not.toBeNull();
    await waitFor(() => expect(screen.getAllByText("6 views").length).toBeGreaterThan(0));
    expect(recordPostView).toHaveBeenCalledTimes(1);
    expect(recordPostView).toHaveBeenCalledWith(TOKEN, "p1");
    expect(screen.queryByText("5 views")).toBeNull();
  });

  it("keeps the last real count (no local increment) when the view call fails", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [post("p1", ["https://cdn/x/a.mp4"], 5)], nextCursor: null });
    vi.mocked(recordPostView).mockRejectedValue(new FeedApiError("nope", { status: 500 }));
    render(<VideosCarousel />);

    fireEvent.click(await screen.findByRole("button", { name: "Play video by Ada" }));
    await waitFor(() => expect(recordPostView).toHaveBeenCalled());

    expect(screen.getAllByText("5 views").length).toBeGreaterThan(0);
    expect(screen.queryByText("6 views")).toBeNull();
  });

  it("closes the player on Escape", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [post("p1", ["https://cdn/x/a.mp4"], 0)], nextCursor: null });
    vi.mocked(recordPostView).mockResolvedValue({ postId: "p1", viewCount: 1 });
    render(<VideosCarousel />);

    fireEvent.click(await screen.findByRole("button", { name: "Play video by Ada" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pages the feed until it finds videos or runs out of pages", async () => {
    vi.mocked(getFeed)
      .mockResolvedValueOnce({ items: [post("p1", ["https://cdn/x/a.jpg"], 0)], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [post("p2", ["https://cdn/x/b.mp4"], 3)], nextCursor: null });
    render(<VideosCarousel />);

    expect(await screen.findByText("3 views")).not.toBeNull();
    expect(getFeed).toHaveBeenCalledTimes(2);
    expect(getFeed).toHaveBeenLastCalledWith(TOKEN, "c1");
  });

  it("shows an honest empty state when the feed has no videos", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [post("p1", [], 0)], nextCursor: null });
    render(<VideosCarousel />);
    expect(await screen.findByText("No videos in your feed yet.")).not.toBeNull();
  });

  it("shows an error with retry when the feed fails", async () => {
    vi.mocked(getFeed).mockRejectedValueOnce(new FeedApiError("Could not load your feed (500)."));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [post("p1", ["https://cdn/x/a.mp4"], 0)], nextCursor: null });
    render(<VideosCarousel />);

    expect(await screen.findByText(/Could not load your feed/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("0 views")).not.toBeNull();
  });

  it("makes no API calls without a session", async () => {
    window.sessionStorage.clear();
    render(<VideosCarousel />);
    expect(await screen.findByText("No videos in your feed yet.")).not.toBeNull();
    expect(getFeed).not.toHaveBeenCalled();
  });
});
