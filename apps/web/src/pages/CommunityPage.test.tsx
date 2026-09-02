// Following ProfilePage.test.tsx's pattern -- plain DOM assertions, mocks
// src/api/feed.ts and src/api/users.ts rather than hitting the network,
// session seeded directly into sessionStorage.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import CommunityPage from "./CommunityPage";
import type { FeedPost } from "../api/feed";

vi.mock("../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../api/feed")>("../api/feed");
  return {
    ...actual,
    getFeed: vi.fn(),
    createPost: vi.fn(),
    likePost: vi.fn(),
    unlikePost: vi.fn(),
    savePost: vi.fn(),
    unsavePost: vi.fn(),
    getComments: vi.fn(),
    addComment: vi.fn(),
  };
});

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return {
    ...actual,
    getUser: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
  };
});

import { getFeed, createPost, likePost } from "../api/feed";
import { getUser } from "../api/users";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "user-2",
    author: { id: "user-2", displayName: "Emeka John" },
    contentText: "First goal of the season, what a feeling",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 3,
    commentCount: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getFeed).mockReset();
  vi.mocked(createPost).mockReset();
  vi.mocked(likePost).mockReset();
  vi.mocked(getUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/community"]}>
      <CommunityPage />
    </MemoryRouter>,
  );
}

describe("CommunityPage", () => {
  it("shows a log-in prompt and never calls GET /posts/feed when there is no session", () => {
    renderPage();
    expect(screen.getByText(/log in to see your community feed/i)).not.toBeNull();
    expect(getFeed).not.toHaveBeenCalled();
  });

  it("loads and renders the feed via GET /posts/feed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [post()], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);

    renderPage();

    expect(await screen.findByText(/first goal of the season/i)).not.toBeNull();
    expect(getFeed).toHaveBeenCalledWith(expect.any(String));
  });

  it("publishes a post via POST /posts and prepends it to the feed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);
    vi.mocked(createPost).mockResolvedValueOnce(
      post({ id: "new-post", authorId: "user-1", author: { id: "user-1", displayName: "Ada Player" }, contentText: "Just posted this" }),
    );

    renderPage();
    await screen.findByText(/your feed is quiet/i);

    fireEvent.change(screen.getByLabelText("What's happening?"), { target: { value: "Just posted this" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.any(String), { contentText: "Just posted this" }));
    expect(await screen.findByText("Just posted this")).not.toBeNull();
  });

  it("likes a post via POST /posts/:id/like and reflects the server's fresh count", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [post({ likeCount: 3 })], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);
    vi.mocked(likePost).mockResolvedValueOnce({ postId: "post-1", liked: true, likeCount: 4 });

    renderPage();
    const likeBtn = await screen.findByRole("button", { name: /3 likes/i });
    fireEvent.click(likeBtn);

    await waitFor(() => expect(likePost).toHaveBeenCalledWith(expect.any(String), "post-1"));
    expect(await screen.findByRole("button", { name: /4 likes/i })).not.toBeNull();
  });

  it("does not render a Follow button on the caller's own post", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({
      items: [post({ authorId: "user-1", author: { id: "user-1", displayName: "Ada Player" } })],
      nextCursor: null,
    });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);

    renderPage();
    await screen.findByText(/first goal of the season/i);
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });
});
