// SearchTrendingPage (Community — Search & Trending). Same conventions as
// GrassrootsPage.test.tsx / NewConversationPage.test.tsx: plain DOM
// assertions, mocks src/api/search.ts, session seeded into
// sessionStorage. GET /search is a real merged endpoint — exercising it
// live is services/api's own e2e layer's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SearchTrendingPage from "./SearchTrendingPage";
import { SearchApiError, type SearchAllResult } from "../api/search";

vi.mock("../api/trending", async () => {
  const actual = await vi.importActual<typeof import("../api/trending")>("../api/trending");
  return { ...actual, getTrending: vi.fn() };
});

import { getTrending } from "../api/trending";

vi.mock("../api/search", async () => {
  const actual = await vi.importActual<typeof import("../api/search")>("../api/search");
  return { ...actual, searchAll: vi.fn(), searchUsers: vi.fn(), searchClubs: vi.fn(), searchPosts: vi.fn() };
});

import { searchAll, searchUsers, searchClubs, searchPosts } from "../api/search";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function emptyResults(): SearchAllResult {
  return {
    users: { items: [], nextCursor: null },
    clubs: { items: [], nextCursor: null },
    posts: { items: [], nextCursor: null },
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setViewport(1200);
  vi.mocked(searchAll).mockReset();
  vi.mocked(searchUsers).mockReset();
  vi.mocked(searchClubs).mockReset();
  vi.mocked(searchPosts).mockReset();
  vi.mocked(getTrending).mockReset();
  vi.mocked(getTrending).mockResolvedValue({ items: [] });
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/search"]}>
      <SearchTrendingPage />
    </MemoryRouter>,
  );
}

describe("SearchTrendingPage", () => {
  it("shows a log-in prompt and never calls GET /search with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to search soccernity/i)).not.toBeNull();
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("shows the desktop filter chip set (For you/Trending/News/Sport)", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    setViewport(1200);
    renderPage();

    expect(screen.getByRole("tab", { name: "For you" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Trending" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "News" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Sport" })).not.toBeNull();
  });

  it("shows the mobile filter chip set (For you/Trending/News, no Sport) — genuinely different, not reconciled", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    setViewport(400);
    renderPage();

    expect(screen.getByRole("tab", { name: "For you" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Trending" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "News" })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: "Sport" })).toBeNull();
  });

  it("clicking a filter chip only changes which one is highlighted — no network call (visual-only in this PR)", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    renderPage();

    const trendingTab = screen.getByRole("tab", { name: "Trending" });
    expect(trendingTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(trendingTab);

    expect(trendingTab.getAttribute("aria-selected")).toBe("true");
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("renders the 4 still-unbuilt regions as honest, empty placeholders on desktop — never fabricated content", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    setViewport(1200);
    renderPage();

    expect(screen.getByText("Trending News")).not.toBeNull();
    expect(screen.getByText("Suggested")).not.toBeNull();
    expect(screen.getByText("Videos from Leaderboard")).not.toBeNull();
    expect(screen.getByText("Fixtures")).not.toBeNull();
    expect(screen.getAllByText("Not built yet — coming in a follow-up PR.").length).toBe(4);
    // ...and the Trends for you card is real, not a placeholder.
    expect(screen.getByRole("heading", { name: "Trends for you" })).not.toBeNull();
  });

  it("does not render the placeholder sidebars/carousel on mobile — they aren't in that Figma frame", () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    setViewport(400);
    renderPage();

    expect(screen.queryByText("Trending News")).toBeNull();
    expect(screen.queryByText("Suggested")).toBeNull();
    expect(screen.queryByText("Videos from Leaderboard")).toBeNull();
    expect(screen.queryByText("Fixtures")).toBeNull();
    // No trends sidebar in the mobile Figma frame (5780:8581): not rendered, and GET /trending is never called.
    expect(screen.queryByText("Trends for you")).toBeNull();
    expect(getTrending).not.toHaveBeenCalled();
  });

  it("does not call GET /search for a query under 2 trimmed characters", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    renderPage();

    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: " a " } });

    await new Promise((r) => setTimeout(r, 350));
    expect(searchAll).not.toHaveBeenCalled();
    expect(screen.getByText(/search for players, clubs, or posts above/i)).not.toBeNull();
  });

  it("debounces (300ms) then calls the real GET /search and renders grouped results", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchAll).mockResolvedValueOnce({
      users: { items: [{ id: "u1", displayName: "Ada Obi" }], nextCursor: null },
      clubs: {
        items: [{ id: "c1", name: "Ikoyi Rovers FC", league: "Lagos Sunday League", country: "Nigeria", logoUrl: null, memberCount: 42 }],
        nextCursor: null,
      },
      posts: {
        items: [
          {
            id: "p1",
            contentText: "Great match today!",
            author: { id: "u2", displayName: "Bola Ade" },
            createdAt: new Date().toISOString(),
            likeCount: 5,
            commentCount: 2,
          },
        ],
        nextCursor: null,
      },
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: "chelsea" } });

    await waitFor(() => expect(searchAll).toHaveBeenCalledWith("chelsea"));

    expect(await screen.findByText("Ada Obi")).not.toBeNull();
    expect(screen.getByText("Ikoyi Rovers FC")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Ikoyi Rovers FC/ }).getAttribute("href")).toBe("/clubs/c1");
    expect(screen.getByText("Great match today!")).not.toBeNull();
    expect(screen.getByText("Bola Ade")).not.toBeNull();
  });

  it("shows an empty-group message for a group with no matches, alongside another group's real results", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchAll).mockResolvedValueOnce({
      ...emptyResults(),
      users: { items: [{ id: "u1", displayName: "Ada Obi" }], nextCursor: null },
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: "ada" } });

    expect(await screen.findByText("Ada Obi")).not.toBeNull();
    expect(screen.getByText("No clubs found.")).not.toBeNull();
    expect(screen.getByText("No posts found.")).not.toBeNull();
  });

  it("shows a single 'no results' message when all three groups are empty", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchAll).mockResolvedValueOnce(emptyResults());

    renderPage();
    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: "zzzzz" } });

    expect(await screen.findByText(/no results for/i)).not.toBeNull();
  });

  it("fetches the next page for a single group when its own Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchAll).mockResolvedValueOnce({
      ...emptyResults(),
      users: { items: [{ id: "u1", displayName: "Ada Obi" }], nextCursor: "cursor-1" },
    });
    vi.mocked(searchUsers).mockResolvedValueOnce({ items: [{ id: "u2", displayName: "Bola Ade" }], nextCursor: null });

    renderPage();
    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: "ad" } });

    await screen.findByText("Ada Obi");
    fireEvent.click(screen.getByRole("button", { name: /load more people/i }));

    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("ad", "cursor-1"));
    expect(await screen.findByText("Bola Ade")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /load more people/i })).toBeNull();
  });

  it("shows the server's own error message rather than a generic failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(searchAll).mockRejectedValueOnce(new SearchApiError("q must be at least 2 characters", { status: 400 }));

    renderPage();
    fireEvent.change(screen.getByLabelText(/search players, clubs, posts/i), { target: { value: "ok" } });

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/q must be at least 2 characters/i);
  });
});
