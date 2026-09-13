// Same conventions as ClubFanPage.test.tsx: plain DOM assertions, mocks
// src/api/banter.ts, session seeded into sessionStorage. GET
// /banter-rooms/:id, GET /banter-rooms/:id/posts and POST
// /banter-rooms/:id/posts are all real merged endpoints
// (sprint-3/banter-rooms-backend) -- exercising them live is services/
// api's e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import BanterRoomPage from "./BanterRoomPage";
import { BanterApiError, type BanterRoom } from "../api/banter";
import type { FeedPost } from "../api/feed";

vi.mock("../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../api/banter")>("../api/banter");
  return {
    ...actual,
    getRoomById: vi.fn(),
    getRoomFeed: vi.fn(),
    postToRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
  };
});

import { getRoomById, getRoomFeed, postToRoom, joinRoom } from "../api/banter";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "room-1",
    name: "Chelsea vs Arsenal — Matchday Chat",
    scopeType: "club",
    createdBy: "someone-else",
    memberCount: 5230,
    joined: false,
    ...overrides,
  };
}

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "author-1",
    author: { id: "author-1", displayName: "Marcus Obi", isFollowing: false },
    contentText: "Big win tonight!",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: "room-1",
    likeCount: 3,
    commentCount: 1,
    createdAt: "2026-09-13T00:00:00.000Z",
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getRoomById).mockReset();
  vi.mocked(getRoomFeed).mockReset();
  vi.mocked(postToRoom).mockReset();
  vi.mocked(joinRoom).mockReset();
});

function renderPage(roomId = "room-1") {
  render(
    <MemoryRouter initialEntries={[`/banter/${roomId}`]}>
      <Routes>
        <Route path="/banter/:roomId" element={<BanterRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BanterRoomPage", () => {
  it("shows a log-in prompt and never calls GET /banter-rooms/:id with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this room/i)).not.toBeNull();
    expect(getRoomById).not.toHaveBeenCalled();
  });

  it("renders the real room header and feed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [post()], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByText(/5,230 members/)).not.toBeNull();
    expect(await screen.findByText("Big win tonight!")).not.toBeNull();
  });

  it("renders an honest 'Room not found' state on a 404", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getRoomById).mockRejectedValueOnce(new BanterApiError("not found", { status: 404 }));

    renderPage();

    expect(await screen.findByText(/room not found/i)).not.toBeNull();
  });

  it("shows a 'join to post' prompt instead of a composer when the caller isn't a member", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText(/join this room to post in it/i)).not.toBeNull();
    expect(screen.queryByPlaceholderText(/say something/i)).toBeNull();
  });

  it("posts via the real POST /banter-rooms/:id/posts when the caller is a member, and prepends it to the feed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: true }));
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(postToRoom).mockResolvedValueOnce({
      id: "new-post",
      authorId: "user-1",
      author: { id: "user-1", displayName: "You" },
      contentText: "Great atmosphere",
      mediaUrls: [],
      clubPageId: null,
      banterRoomId: "room-1",
      likeCount: 0,
      commentCount: 0,
      createdAt: "2026-09-13T01:00:00.000Z",
    });

    renderPage();
    await screen.findByPlaceholderText(/say something/i);

    fireEvent.change(screen.getByPlaceholderText(/say something/i), { target: { value: "Great atmosphere" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", { contentText: "Great atmosphere" }),
    );
    expect(await screen.findByText("Great atmosphere")).not.toBeNull();
  });

  it("joins the room via BanterJoinButton, which reveals the composer without a reload", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false, memberCount: 5 }));
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(joinRoom).mockResolvedValueOnce({ roomId: "room-1", joined: true, memberCount: 6 });

    renderPage();
    await screen.findByText(/join this room to post in it/i);

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByPlaceholderText(/say something/i)).not.toBeNull();
    expect(screen.getByText(/6 members/)).not.toBeNull();
  });
});
