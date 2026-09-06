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

vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return {
    ...actual,
    getCurrentContest: vi.fn(),
    submitContestEntry: vi.fn(),
  };
});

import { getFeed, createPost, likePost } from "../api/feed";
import { getUser } from "../api/users";
import { getCurrentContest, submitContestEntry, type CurrentContestResponse } from "../api/contest";

function noContest(): CurrentContestResponse {
  return {
    cycle: null,
    phase: null,
    isAcceptingEntries: false,
    activeRound: null,
    rounds: [],
    weeklyWinners: [],
    monthlyStandings: [],
    callerEntry: null,
  };
}

function openContest(overrides: Partial<CurrentContestResponse> = {}): CurrentContestResponse {
  return {
    cycle: {
      id: "cycle-1",
      title: "September Contest",
      status: "active",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      finalOpenedAt: null,
      crownedAt: null,
    },
    phase: "week_1",
    isAcceptingEntries: true,
    activeRound: {
      id: "round-2",
      weekNumber: 2,
      status: "open",
      opensAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      judgedAt: null,
    },
    rounds: [],
    weeklyWinners: [],
    monthlyStandings: [],
    callerEntry: null,
    ...overrides,
  };
}

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
    author: { id: "user-2", displayName: "Emeka John", isFollowing: false },
    contentText: "First goal of the season, what a feeling",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 3,
    commentCount: 1,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
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
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(getCurrentContest).mockResolvedValue(noContest());
  vi.mocked(submitContestEntry).mockReset();
});

function renderPage(path = "/community") {
  render(
    <MemoryRouter initialEntries={[path]}>
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
      post({
        id: "new-post",
        authorId: "user-1",
        author: { id: "user-1", displayName: "Ada Player", isFollowing: false },
        contentText: "Just posted this",
      }),
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
      items: [post({ authorId: "user-1", author: { id: "user-1", displayName: "Ada Player", isFollowing: false } })],
      nextCursor: null,
    });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);

    renderPage();
    await screen.findByText(/first goal of the season/i);
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("shows no Contest tab in the composer when no contest is accepting entries", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);
    vi.mocked(getCurrentContest).mockResolvedValue(noContest());

    renderPage();
    await screen.findByText(/your feed is quiet/i);

    expect(screen.queryByRole("tab", { name: /contest/i })).toBeNull();
  });

  it("submits a contest entry: POST /posts then POST /contest/entries with the new post's id", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);
    vi.mocked(getCurrentContest).mockResolvedValue(openContest());
    vi.mocked(createPost).mockResolvedValueOnce(
      post({ id: "entry-post", authorId: "user-1", contentText: "my skill clip caption" }) as never,
    );
    vi.mocked(submitContestEntry).mockResolvedValueOnce({
      id: "ce-1",
      cycleId: "cycle-1",
      roundId: "round-2",
      weekNumber: 2,
      postId: "entry-post",
      submittedAt: new Date().toISOString(),
    });

    renderPage("/community?compose=contest");
    await screen.findByText(/your feed is quiet/i);

    // Deep-linked into contest mode (GET /contest/current resolves after the feed).
    const caption = await screen.findByLabelText(/caption for your contest entry/i);
    expect(screen.getByRole("tab", { name: /contest/i }).getAttribute("aria-selected")).toBe("true");

    fireEvent.change(caption, { target: { value: "my skill clip caption" } });
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));

    await waitFor(() =>
      expect(createPost).toHaveBeenCalledWith(expect.any(String), { contentText: "my skill clip caption" }),
    );
    await waitFor(() => expect(submitContestEntry).toHaveBeenCalledWith(expect.any(String), "entry-post"));
    // The entry post is also prepended to the normal feed.
    expect(await screen.findByText("my skill clip caption")).not.toBeNull();
    expect(await screen.findByText(/your entry is in for this week/i)).not.toBeNull();
  });

  it("shows an 'already entered' state in contest mode when callerEntry is set", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);
    vi.mocked(getCurrentContest).mockResolvedValue(
      openContest({ callerEntry: { roundId: "round-2", weekNumber: 2, postId: "p9" } }),
    );

    renderPage("/community?compose=contest");
    await screen.findByText(/your feed is quiet/i);

    fireEvent.click(await screen.findByRole("tab", { name: /contest/i }));
    expect(await screen.findByText(/entered this week.s contest \(week 2\)/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /submit entry/i })).toBeNull();
  });

  it("renders like / save / follow in their already-acted state on initial load from the API's per-caller fields (Decision Log #153)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getFeed).mockResolvedValueOnce({
      items: [
        post({
          likeCount: 7,
          isLiked: true,
          isSaved: true,
          author: { id: "user-2", displayName: "Emeka John", isFollowing: true },
        }),
      ],
      nextCursor: null,
    });
    vi.mocked(getUser).mockResolvedValueOnce({ displayName: "Ada Player" } as never);

    renderPage();

    // No clicks -- this is the initial render straight from GET /posts/feed.
    const likeBtn = await screen.findByRole("button", { name: /7 likes/i });
    expect(likeBtn.getAttribute("aria-pressed")).toBe("true");

    const saveBtn = screen.getByRole("button", { name: /saved/i });
    expect(saveBtn.getAttribute("aria-pressed")).toBe("true");

    expect(screen.getByRole("button", { name: "Following" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(likePost).not.toHaveBeenCalled();
  });
});
