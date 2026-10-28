import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import PostPage from "./PostPage";
import { FeedApiError, type FeedPost } from "../api/feed";

vi.mock("../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../api/feed")>("../api/feed");
  return { ...actual, getPostById: vi.fn(), getComments: vi.fn() };
});
import { getComments, getPostById } from "../api/feed";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function entry(over: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-7",
    authorId: "sarah",
    author: { id: "sarah", publicName: "Sarah Bello", isFollowing: false },
    contentText: "My final-week entry: first-touch passing drill.",
    mediaUrls: ["https://cdn.example.com/final.mp4"],
    media: [{ id: "media-1", kind: "video" }],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 31,
    commentCount: 8,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
    contest: { entryId: "e7", kind: "final", weekNumber: 4, pinned: true, label: "Contest post" },
    ...over,
  };
}

function renderAt(path = "/posts/post-7") {
  return render(
    <MemoryRouter initialEntries={["/community", path]} initialIndex={1}>
      <Routes>
        <Route path="/posts/:postId" element={<PostPage />} />
        <Route path="/community" element={<p>Community feed</p>} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("sn_access_token", TOKEN);
  vi.mocked(getPostById).mockReset();
  vi.mocked(getComments).mockReset();
  vi.mocked(getComments).mockResolvedValue({
    items: [
      {
        id: "c1",
        postId: "post-7",
        authorId: "emeka",
        author: { id: "emeka", publicName: "Emeka John", isFollowing: false },
        contentText: "Clean first touch.",
        createdAt: new Date().toISOString(),
      },
    ],
    nextCursor: null,
  });
});

describe("PostPage (where a Final week tile opens)", () => {
  it("shows the entry, its Contest post label, the video and the open comment thread", async () => {
    vi.mocked(getPostById).mockResolvedValue(entry());
    const { container } = renderAt();

    expect(await screen.findByText("My final-week entry: first-touch passing drill.")).not.toBeNull();
    expect(getPostById).toHaveBeenCalledWith(TOKEN, "post-7");
    expect(screen.getByRole("heading", { name: "Post" })).not.toBeNull();
    expect(screen.getByText("Contest post")).not.toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
    expect(await screen.findByText("Clean first touch.")).not.toBeNull();
    // After the reveal it is an ordinary, unlocked card.
    expect(screen.queryByTestId("engagement-locked")).toBeNull();
  });

  it("Back returns to where the person came from", async () => {
    vi.mocked(getPostById).mockResolvedValue(entry());
    renderAt();
    await screen.findByText("My final-week entry: first-touch passing drill.");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Community feed")).not.toBeNull();
  });

  it("a hidden or missing post is one generic 'Post not found'", async () => {
    vi.mocked(getPostById).mockRejectedValue(new FeedApiError("Post not found", { status: 404 }));
    renderAt();
    expect(await screen.findByText(/Post not found/)).not.toBeNull();
    expect(screen.queryByText("Contest post")).toBeNull();
  });

  it("any other failure is an honest error, not a crash", async () => {
    vi.mocked(getPostById).mockRejectedValue(new FeedApiError("boom", { status: 500 }));
    renderAt();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn.t load this post/);
  });

  it("asks a signed-out visitor to log in and never calls the API", () => {
    window.sessionStorage.clear();
    renderAt();
    expect(screen.getByText(/Log in to see this post/)).not.toBeNull();
    expect(getPostById).not.toHaveBeenCalled();
  });
});
