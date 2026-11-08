// Same conventions as ClubFanPage.test.tsx: plain DOM assertions, mocks
// src/api/banter.ts, session seeded into the in-memory session store. GET
// /banter-rooms/:id, GET /banter-rooms/:id/posts and POST
// /banter-rooms/:id/posts are all real merged endpoints
// (sprint-3/banter-rooms-backend) -- exercising them live is services/
// api's e2e layer's job.
//
// B-117 (Decision Log #404 item 10): Bants is an open forum -- the tests
// below that used to pin "join to post" now pin the opposite.
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

import { getRoomById, getRoomFeed, postToRoom, joinRoom, leaveRoom } from "../api/banter";
import { seedSession, clearSession } from "../test/session";

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
    status: "active",
    createdAt: "2026-10-01T12:00:00.000Z",
    memberCount: 5230,
    joined: false,
    ...overrides,
  };
}

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "author-1",
    author: { id: "author-1", publicName: "Marcus Obi", isFollowing: false },
    contentText: "Big win tonight!",
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: "room-1",
    likeCount: 3,
    commentCount: 1,
    viewCount: 0,
    createdAt: "2026-09-13T00:00:00.000Z",
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

function createdPost(contentText: string): Awaited<ReturnType<typeof postToRoom>> {
  return {
    id: "new-post",
    authorId: "user-1",
    author: { id: "user-1", publicName: "You" },
    contentText,
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: "room-1",
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    createdAt: "2026-09-13T01:00:00.000Z",
  };
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(getRoomById).mockReset();
  vi.mocked(getRoomFeed).mockReset();
  vi.mocked(postToRoom).mockReset();
  vi.mocked(joinRoom).mockReset();
  vi.mocked(leaveRoom).mockReset();
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

function emptyFeed() {
  vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
}

describe("BanterRoomPage", () => {
  it("shows a log-in prompt and never calls GET /banter-rooms/:id with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this room/i)).not.toBeNull();
    expect(getRoomById).not.toHaveBeenCalled();
  });

  it("renders the real room header and feed", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [post()], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByText(/5,230 members/)).not.toBeNull();
    expect(await screen.findByText("Big win tonight!")).not.toBeNull();
  });

  it("renders an honest 'Room not found' state on a 404", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockRejectedValueOnce(new BanterApiError("not found", { status: 404 }));

    renderPage();

    expect(await screen.findByText(/room not found/i)).not.toBeNull();
  });

  it("B-117: a non-member sees the open composer and no 'join to post' prompt anywhere", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();

    renderPage();

    expect(await screen.findByPlaceholderText(/say something/i)).not.toBeNull();
    expect(screen.queryByText(/join this room/i)).toBeNull();
    expect(screen.queryByText(/must join/i)).toBeNull();
  });

  it("posts via the real POST /banter-rooms/:id/posts when the caller has bookmarked the room, and prepends it to the feed", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: true }));
    emptyFeed();
    vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Great atmosphere"));

    renderPage();
    await screen.findByPlaceholderText(/say something/i);

    fireEvent.change(screen.getByPlaceholderText(/say something/i), { target: { value: "Great atmosphere" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", { contentText: "Great atmosphere" }),
    );
    expect(await screen.findByText("Great atmosphere")).not.toBeNull();
  });

  it("B-117: a non-member posts through POST /banter-rooms/:id/posts without joining first", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();
    vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Hello from outside the room"));

    renderPage();
    fireEvent.change(await screen.findByPlaceholderText(/say something/i), {
      target: { value: "Hello from outside the room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", {
        contentText: "Hello from outside the room",
      }),
    );
    expect(joinRoom).not.toHaveBeenCalled();
    expect(await screen.findByText("Hello from outside the room")).not.toBeNull();
    // Still a non-member: the bookmark did not flip.
    expect(screen.getByRole("button", { name: "Add to My Bants" })).not.toBeNull();
  });

  it("shows the server's own message when a post is refused (e.g. guardian consent)", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    emptyFeed();
    vi.mocked(postToRoom).mockRejectedValueOnce(new BanterApiError("Guardian consent is pending", { status: 403 }));

    renderPage();
    fireEvent.change(await screen.findByPlaceholderText(/say something/i), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText("Guardian consent is pending")).not.toBeNull();
  });

  it("B-117: 'Add to My Bants' bookmarks the room via the join endpoint and reads 'In My Bants' afterwards", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false, memberCount: 5 }));
    emptyFeed();
    vi.mocked(joinRoom).mockResolvedValueOnce({ roomId: "room-1", joined: true, memberCount: 6 });

    renderPage();
    await screen.findByPlaceholderText(/say something/i);
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add to My Bants" }));

    expect(await screen.findByRole("button", { name: "In My Bants" })).not.toBeNull();
    expect(screen.getByText(/6 members/)).not.toBeNull();
    // The composer was never hidden, before or after.
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  it("B-117: a bookmarked room reads 'In My Bants'; clicking it removes the bookmark and the composer stays open", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: true, memberCount: 6 }));
    emptyFeed();
    vi.mocked(leaveRoom).mockResolvedValueOnce({ roomId: "room-1", joined: false, memberCount: 5 });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "In My Bants" }));

    expect(await screen.findByRole("button", { name: "Add to My Bants" })).not.toBeNull();
    expect(screen.getByText(/5 members/)).not.toBeNull();
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  it("shows a bookmark-worded error when the bookmark call fails", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();
    vi.mocked(joinRoom).mockRejectedValueOnce(new Error("network"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to My Bants" }));

    expect(await screen.findByText("Couldn't add this room to My Bants.")).not.toBeNull();
  });

  it("keeps the photo/video attach button disabled", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    emptyFeed();

    renderPage();

    const attach = await screen.findByRole("button", { name: /attach photo\/video/i });
    expect((attach as HTMLButtonElement).disabled).toBe(true);
  });

  it("an active room shows the active dot and no 'Inactive' pill", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ status: "active" }));
    emptyFeed();

    renderPage();

    expect(await screen.findByRole("img", { name: "Active room" })).not.toBeNull();
    expect(screen.queryByText("Inactive")).toBeNull();
  });

  it("an inactive room shows the grey dot and the 'Inactive' pill, and can still be posted in", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ status: "inactive" }));
    emptyFeed();

    renderPage();

    expect(await screen.findByRole("img", { name: "Inactive room" })).not.toBeNull();
    expect(screen.getByText("Inactive")).not.toBeNull();
    // Nothing else reads the status server-side (Figma notes, SCOPE OPEN 3).
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  // B-071: this test used to seed the room's CREATOR and assert no control existed. The creator now gets
  // controls (BanterRoomCreatorControls.test.tsx), so the read-only guarantee is asserted for a viewer who is
  // NOT the creator: the same assertions, a different person.
  it("renders topic chips read-only: no add, remove or status control, for anyone but the room's creator", async () => {
    seedSession(fakeAccessToken("viewer-1"));
    vi.mocked(getRoomById).mockResolvedValueOnce(
      room({
        createdBy: "creator-1",
        topics: [
          { id: "t1", name: "Premier League" },
          { id: "t2", name: "Arsenal" },
        ],
      }),
    );
    emptyFeed();

    renderPage();

    expect(await screen.findByText("Premier League")).not.toBeNull();
    expect(screen.getByText("Arsenal")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /add topic/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /deactivate|reactivate/i })).toBeNull();
  });

  it("renders no topic list when the room has no topics", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ topics: [] }));
    emptyFeed();

    renderPage();
    await screen.findByPlaceholderText(/say something/i);

    expect(screen.queryByRole("list", { name: "Topics" })).toBeNull();
  });
});
