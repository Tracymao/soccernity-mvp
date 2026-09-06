// ClubFanPage (Club — Fan Page). Same conventions as ClubsPage.test.tsx:
// plain DOM assertions, mocks src/api/clubs.ts + src/api/users.ts,
// session seeded into sessionStorage. GET /clubs/:id, GET /clubs/:id/feed,
// GET /clubs/:id/members and POST/DELETE /users/:id/follow are all real
// merged endpoints — exercising them live is services/api's e2e layer's
// job (test/clubs.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ClubFanPage from "./ClubFanPage";
import { ClubsApiError, type ClubSummary } from "../api/clubs";
import type { FeedPost } from "../api/feed";

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return {
    ...actual,
    getClubById: vi.fn(),
    getClubFeed: vi.fn(),
    getClubMembers: vi.fn(),
    joinClub: vi.fn(),
    leaveClub: vi.fn(),
  };
});

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, followUser: vi.fn(), unfollowUser: vi.fn() };
});

import { getClubById, getClubFeed, getClubMembers, joinClub, leaveClub } from "../api/clubs";
import { followUser, unfollowUser } from "../api/users";

const SURULERE: ClubSummary = {
  id: "club-s",
  name: "Surulere United",
  league: "Lagos Island Amateur",
  country: "Nigeria",
  logoUrl: null,
  memberCount: 2106,
  joined: false,
};

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "author-1",
    author: { id: "author-1", displayName: "Marcus Obi", isFollowing: false },
    contentText: "Massive win at the weekend — 3–1 and up to 2nd in the league.",
    mediaUrls: [],
    clubPageId: "club-s",
    banterRoomId: null,
    likeCount: 124,
    commentCount: 25,
    createdAt: "2026-09-04T00:00:00.000Z",
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

const EMPTY_PAGE = { items: [], nextCursor: null };

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getClubById).mockReset();
  vi.mocked(getClubFeed).mockReset().mockResolvedValue(EMPTY_PAGE);
  vi.mocked(getClubMembers).mockReset().mockResolvedValue(EMPTY_PAGE);
  vi.mocked(joinClub).mockReset();
  vi.mocked(leaveClub).mockReset();
  vi.mocked(followUser).mockReset();
  vi.mocked(unfollowUser).mockReset();
});

function renderPage(id = "club-s") {
  render(
    <MemoryRouter initialEntries={[`/clubs/${id}`]}>
      <Routes>
        <Route path="/clubs/:id" element={<ClubFanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClubFanPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this club/i)).not.toBeNull();
    expect(getClubById).not.toHaveBeenCalled();
    expect(getClubFeed).not.toHaveBeenCalled();
    expect(getClubMembers).not.toHaveBeenCalled();
  });

  it("renders a club's real header data and no longer shows the old scope note", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getByText("Lagos Island Amateur • Nigeria")).not.toBeNull();
    // memberLine appears both in the header and the Members section header.
    expect(screen.getAllByText("2,106 members").length).toBeGreaterThanOrEqual(1);
    expect(getClubById).toHaveBeenCalledWith("test-token", "club-s");
    expect(getClubFeed).toHaveBeenCalledWith("test-token", "club-s");
    expect(getClubMembers).toHaveBeenCalledWith("test-token", "club-s");
    expect(screen.queryByText(/aren.t part of club pages yet/i)).toBeNull();
  });

  it("renders the club feed from GET /clubs/:id/feed", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getClubFeed).mockReset().mockResolvedValueOnce({
      items: [
        post({ id: "p1", author: { id: "a1", displayName: "Marcus Obi", isFollowing: false } }),
        post({
          id: "p2",
          contentText: "Anyone driving to the away match on Sunday with a spare seat?",
          author: { id: "a2", displayName: "Tunde Adeyemi", isFollowing: false },
        }),
      ],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText(/Massive win at the weekend/)).not.toBeNull();
    expect(screen.getByText(/Anyone driving to the away match/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Club feed" })).not.toBeNull();
  });

  it("shows an empty-feed message when the club has no posts", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);

    renderPage();

    expect(await screen.findByText(/no posts in this club.s feed yet/i)).not.toBeNull();
  });

  it("keeps the page working when the feed fails to load (club header still renders)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getClubFeed).mockReset().mockRejectedValueOnce(new ClubsApiError("boom", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getByText(/couldn.t load this club.s feed/i)).not.toBeNull();
  });

  it("renders the member roster and paginates it with 'Load more members'", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getClubMembers)
      .mockReset()
      .mockResolvedValueOnce({ items: [{ id: "m1", displayName: "Marcus Obi" }], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [{ id: "m2", displayName: "Tunde Adeyemi" }], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Marcus Obi")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /load more members/i }));

    await waitFor(() => expect(getClubMembers).toHaveBeenCalledWith("test-token", "club-s", "cursor-1"));
    expect(await screen.findByText("Tunde Adeyemi")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /load more members/i })).toBeNull();
  });

  it("follows a member via POST /users/:id/follow and flips the button to Following", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getClubMembers).mockReset().mockResolvedValueOnce({
      items: [{ id: "m1", displayName: "Marcus Obi" }],
      nextCursor: null,
    });
    vi.mocked(followUser).mockResolvedValueOnce({ following: true });

    renderPage();

    const followBtn = await screen.findByRole("button", { name: "Follow" });
    fireEvent.click(followBtn);

    await waitFor(() => expect(followUser).toHaveBeenCalledWith("test-token", "m1"));
    expect(await screen.findByRole("button", { name: "Following" })).not.toBeNull();
  });

  it("toggles the club Join button to Leave (header action unchanged)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(joinClub).mockResolvedValueOnce({ clubId: SURULERE.id, joined: true, memberCount: 2107 });

    renderPage();
    await screen.findByRole("heading", { name: "Surulere United" });

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(joinClub).toHaveBeenCalledWith("test-token", "club-s"));
    expect(await screen.findByRole("button", { name: "Leave" })).not.toBeNull();
    expect(leaveClub).not.toHaveBeenCalled();
  });

  it("renders an honest 'Club not found' state on a 404, with a link back to /clubs", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockRejectedValueOnce(new ClubsApiError("Couldn't load that club (404).", { status: 404 }));

    renderPage("does-not-exist");

    expect(await screen.findByText(/club not found/i)).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /clubs/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /join|leave/i })).toBeNull();
    // Feed / members are never fetched when the club itself 404s.
    expect(getClubFeed).not.toHaveBeenCalled();
    expect(getClubMembers).not.toHaveBeenCalled();
  });

  it("shows a generic error (not 'not found') on a non-404 club failure", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockRejectedValueOnce(new ClubsApiError("Couldn't load that club (500).", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load this club/i);
  });
});
