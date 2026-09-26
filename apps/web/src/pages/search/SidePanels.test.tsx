// TrendingNewsPanel + FixturesPanel. Same conventions as
// TrendsForYou.test.tsx: mock the api modules, plain DOM assertions.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TrendingNewsPanel from "./TrendingNewsPanel";
import FixturesPanel from "./FixturesPanel";
import { BlogApiError, type ArticleSummary } from "../../api/blog";
import { SportsApiError, type MatchSummary } from "../../api/sports";

vi.mock("../../api/blog", async () => {
  const actual = await vi.importActual<typeof import("../../api/blog")>("../../api/blog");
  return { ...actual, listArticles: vi.fn() };
});
vi.mock("../../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../../api/sports")>("../../api/sports");
  return { ...actual, listFixtures: vi.fn() };
});

import { listArticles } from "../../api/blog";
import { listFixtures } from "../../api/sports";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listArticles).mockReset();
  vi.mocked(listFixtures).mockReset();
});

function article(n: number): ArticleSummary {
  return {
    id: `a${n}`,
    title: `Headline ${n}`,
    excerpt: `Excerpt ${n}`,
    publishedAt: "2026-09-20T10:00:00.000Z",
    category: { id: "c1", name: "Premier League", slug: "premier-league" },
    author: "Admin",
  };
}

function match(n: number, over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: `m${n}`,
    competition: "Premier League",
    league: { id: "l1", name: "Premier League", season: "2026", round: null },
    venue: null,
    kickoffTime: "2026-09-26T15:30:00.000Z",
    status: "scheduled",
    statusDetail: null,
    homeTeam: { id: `h${n}`, name: `Home ${n}`, logo: null },
    awayTeam: { id: `w${n}`, name: `Away ${n}`, logo: null },
    homeScore: null,
    awayScore: null,
    score: null,
    ...over,
  };
}

describe("TrendingNewsPanel", () => {
  it("shows the 3 most recent articles in API order, linked to their detail page", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [1, 2, 3, 4, 5].map(article), nextCursor: "x" });
    render(
      <MemoryRouter>
        <TrendingNewsPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Headline 1")).not.toBeNull());
    expect(screen.getByText("Headline 3")).not.toBeNull();
    expect(screen.queryByText("Headline 4")).toBeNull();
    expect(screen.getByText("Excerpt 1")).not.toBeNull();
    expect(screen.getByText("Headline 1").closest("a")?.getAttribute("href")).toBe("/blog/a1");
  });

  it("shows an empty state when there are no published articles", async () => {
    vi.mocked(listArticles).mockResolvedValue({ items: [], nextCursor: null });
    render(
      <MemoryRouter>
        <TrendingNewsPanel />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("No news yet.")).not.toBeNull());
  });

  it("shows the error and refetches on refresh", async () => {
    vi.mocked(listArticles).mockRejectedValueOnce(new BlogApiError("Load failed (500).", { status: 500 }));
    render(
      <MemoryRouter>
        <TrendingNewsPanel />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("500"));

    vi.mocked(listArticles).mockResolvedValueOnce({ items: [article(1)], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Refresh news" }));
    await waitFor(() => expect(screen.getByText("Headline 1")).not.toBeNull());
    expect(listArticles).toHaveBeenCalledTimes(2);
  });
});

describe("FixturesPanel", () => {
  it("requests today's fixtures (YYYY-MM-DD) and shows at most 7 rows linked to the match centre", async () => {
    vi.mocked(listFixtures).mockResolvedValue({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => match(n)),
      nextCursor: null,
    });
    render(
      <MemoryRouter>
        <FixturesPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Home 1")).not.toBeNull());
    expect(vi.mocked(listFixtures).mock.calls[0][0]).toBe(new Date().toISOString().slice(0, 10));
    expect(screen.getByText("Home 7")).not.toBeNull();
    expect(screen.queryByText("Home 8")).toBeNull();
    expect(screen.getByText("Home 1").closest("a")?.getAttribute("href")).toBe("/sports-hub/matches/m1");
  });

  it("shows the score for a live match and the kickoff time otherwise", async () => {
    vi.mocked(listFixtures).mockResolvedValue({
      items: [match(1, { status: "live", homeScore: 3, awayScore: 1 }), match(2, { status: "scheduled" })],
      nextCursor: null,
    });
    render(
      <MemoryRouter>
        <FixturesPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("3 - 1")).not.toBeNull());
    expect(screen.getByText("Home 2").closest("a")?.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it("shows an empty state for a day with no fixtures", async () => {
    vi.mocked(listFixtures).mockResolvedValue({ items: [], nextCursor: null });
    render(
      <MemoryRouter>
        <FixturesPanel />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("No fixtures today.")).not.toBeNull());
  });

  it("shows the error and refetches on refresh", async () => {
    vi.mocked(listFixtures).mockRejectedValueOnce(new SportsApiError("Load failed (500).", { status: 500 }));
    render(
      <MemoryRouter>
        <FixturesPanel />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("500"));

    vi.mocked(listFixtures).mockResolvedValueOnce({ items: [match(1)], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Refresh fixtures" }));
    await waitFor(() => expect(screen.getByText("Home 1")).not.toBeNull());
    expect(listFixtures).toHaveBeenCalledTimes(2);
  });
});
