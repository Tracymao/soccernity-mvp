// The Saved tab of the own profile (B-064): every state, load more, unsave from the card, and the
// self-only route. API calls are mocked; PostCard is the real card.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SavedPostsTab from "./SavedPostsTab";
import type { SavedPostEntry } from "../../api/feed";
import { getSavedPosts, unsavePost, savePost, FeedApiError } from "../../api/feed";

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return {
    ...actual,
    getSavedPosts: vi.fn(),
    unsavePost: vi.fn(),
    savePost: vi.fn(),
    getComments: vi.fn(),
    recordViewHeartbeat: vi.fn(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getSavedPosts).mockReset();
  vi.mocked(unsavePost).mockReset();
  vi.mocked(savePost).mockReset();
});

function entry(id: string, text: string, authorId = "user-2"): SavedPostEntry {
  return {
    postId: id,
    savedAt: "2026-11-01T10:00:00.000Z",
    post: {
      id,
      authorId,
      author: { id: authorId, publicName: authorId === "user-1" ? "Me Myself" : "Emeka John" },
      contentText: text,
      mediaUrls: [],
      media: [],
      clubPageId: null,
      banterRoomId: null,
      likeCount: 3,
      commentCount: 1,
      viewCount: 0,
      createdAt: new Date().toISOString(),
    },
  };
}

function renderTab() {
  return render(
    <MemoryRouter>
      <SavedPostsTab accessToken="tok" userId="user-1" />
    </MemoryRouter>,
  );
}

describe("SavedPostsTab", () => {
  it("shows a loading state while the first page is in flight", () => {
    vi.mocked(getSavedPosts).mockReturnValueOnce(new Promise(() => {}));
    renderTab();
    expect(screen.getByRole("status").textContent).toMatch(/loading your saved posts/i);
  });

  it("asks the server for the caller's own saved posts and draws each as a post card already marked Saved", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({
      items: [entry("p1", "Great thread on set pieces"), entry("p2", "Rowe Park pitch is re-turfed")],
      nextCursor: null,
    });
    renderTab();
    expect(await screen.findByText("Great thread on set pieces")).not.toBeNull();
    expect(screen.getByText("Rowe Park pitch is re-turfed")).not.toBeNull();
    expect(getSavedPosts).toHaveBeenCalledWith("tok", "user-1");
    // Both cards offer the pressed "Saved" button, so a card can be unsaved from here.
    expect(screen.getAllByRole("button", { name: /Saved/ })).toHaveLength(2);
    // No "Load more" without a next page.
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an empty state when nothing is saved", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [], nextCursor: null });
    renderTab();
    expect((await screen.findByRole("status")).textContent).toMatch(/haven.t saved any posts yet/i);
  });

  it("shows an error with a retry that loads the list when the first request fails", async () => {
    vi.mocked(getSavedPosts).mockRejectedValueOnce(new FeedApiError("boom", { status: 500 }));
    renderTab();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t load your saved posts/i);

    vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [entry("p1", "Back again")], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back again")).not.toBeNull();
    expect(getSavedPosts).toHaveBeenCalledTimes(2);
  });

  it("loads the next page with the cursor and appends it, never repeating a post", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [entry("p1", "First saved")], nextCursor: "c1" });
    renderTab();
    await screen.findByText("First saved");

    vi.mocked(getSavedPosts).mockResolvedValueOnce({
      items: [entry("p1", "First saved"), entry("p2", "Second saved")],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second saved")).not.toBeNull();
    expect(getSavedPosts).toHaveBeenLastCalledWith("tok", "user-1", "c1");
    expect(screen.getAllByText("First saved")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the list on screen and says so when loading more fails", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [entry("p1", "First saved")], nextCursor: "c1" });
    renderTab();
    await screen.findByText("First saved");

    vi.mocked(getSavedPosts).mockRejectedValueOnce(new FeedApiError("boom", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t load more saved posts/i);
    expect(screen.getByText("First saved")).not.toBeNull();
    // The button is still there to try again.
    expect(screen.getByRole("button", { name: "Load more" })).not.toBeNull();
  });

  it("drops a card when it is unsaved, and shows the empty state after the last one goes", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({
      items: [entry("p1", "Keep this one"), entry("p2", "Drop this one")],
      nextCursor: null,
    });
    renderTab();
    await screen.findByText("Drop this one");

    vi.mocked(unsavePost).mockResolvedValueOnce({ postId: "p2", saved: false });
    const dropCard = screen.getByText("Drop this one").closest("article") as HTMLElement;
    fireEvent.click(within(dropCard).getByRole("button", { name: /Saved/ }));
    await waitFor(() => expect(screen.queryByText("Drop this one")).toBeNull());
    expect(unsavePost).toHaveBeenCalledWith("tok", "p2");
    expect(screen.getByText("Keep this one")).not.toBeNull();

    vi.mocked(unsavePost).mockResolvedValueOnce({ postId: "p1", saved: false });
    fireEvent.click(screen.getByRole("button", { name: /Saved/ }));
    expect((await screen.findByRole("status")).textContent).toMatch(/haven.t saved any posts yet/i);
  });

  it("keeps a card when the unsave request fails", async () => {
    vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [entry("p1", "Stays put")], nextCursor: null });
    renderTab();
    await screen.findByText("Stays put");

    vi.mocked(unsavePost).mockRejectedValueOnce(new FeedApiError("nope", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: /Saved/ }));
    expect(await screen.findByText("nope")).not.toBeNull();
    expect(screen.getByText("Stays put")).not.toBeNull();
  });

  it("ignores an answer that arrives after the tab was left", async () => {
    let resolve!: (v: { items: SavedPostEntry[]; nextCursor: string | null }) => void;
    vi.mocked(getSavedPosts).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = renderTab();
    unmount();
    resolve({ items: [entry("p1", "Late")], nextCursor: null });
    // Nothing to assert on screen; the point is that no state update on an unmounted tab throws.
    await Promise.resolve();
    expect(screen.queryByText("Late")).toBeNull();
  });
});
