// SportsHubPage -- real data as of sprint-4/sports-hub-frontend-wiring.
// Mocks src/api/sports.ts, same convention as GrassrootsPage.test.tsx.
// No session gate to seed -- every SportsService route is public.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SportsHubPage from "./SportsHubPage";
import { SportsApiError, type MatchSummary, type MatchesPage } from "../api/sports";

vi.mock("../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../api/sports")>("../api/sports");
  return { ...actual, listLiveScores: vi.fn(), listFixtures: vi.fn() };
});

import { listLiveScores, listFixtures } from "../api/sports";

function team(id: string, name: string) {
  return { id, name, logo: null };
}

function match(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "m1",
    competition: "Premier League",
    league: { id: "39", name: "Premier League", season: "2026", round: "Matchday 5" },
    venue: "Anfield",
    kickoffTime: "2026-09-16T15:00:00.000Z",
    status: "live",
    statusDetail: "Second half",
    homeTeam: team("hp1", "Liverpool"),
    awayTeam: team("ap1", "Chelsea"),
    homeScore: 1,
    awayScore: 3,
    score: "1 - 3",
    ...overrides,
  };
}

function page(items: MatchSummary[], nextCursor: string | null = null): MatchesPage {
  return { items, nextCursor };
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listLiveScores).mockReset().mockResolvedValue(page([]));
  vi.mocked(listFixtures).mockReset().mockResolvedValue(page([]));
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/sports-hub"]}>
      <SportsHubPage />
    </MemoryRouter>,
  );
}

describe("SportsHubPage", () => {
  it("renders with no session at all -- no login gate on this page", async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([match()]));

    renderPage();

    expect(screen.getByText("Livescores")).not.toBeNull();
    expect(await screen.findAllByText("Chelsea")).not.toHaveLength(0);
    expect(listLiveScores).toHaveBeenCalled();
  });

  it("defaults to the Live view and calls GET /sports/live-scores", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([match()]));

    renderPage();

    await screen.findByText("Liverpool");
    expect(listLiveScores).toHaveBeenCalledWith(undefined);
    expect(listFixtures).not.toHaveBeenCalled();
  });

  it("switching to Today calls GET /sports/fixtures?date=", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([match()]));
    vi.mocked(listFixtures).mockResolvedValueOnce(page([match({ id: "m2", status: "scheduled", statusDetail: null })]));

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    await screen.findByText("Liverpool");
    expect(listFixtures).toHaveBeenCalledTimes(1);
    const [dateArg] = vi.mocked(listFixtures).mock.calls[0];
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows an honest empty state when there are no live matches", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([]));

    renderPage();

    expect(await screen.findByText(/no live matches right now/i)).not.toBeNull();
  });

  it("shows an error state when the load fails", async () => {
    vi.mocked(listLiveScores).mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
  });

  it("derives the league sidebar from loaded matches and filters by clicking one", async () => {
    vi.mocked(listLiveScores)
      .mockResolvedValueOnce(
        page([
          match({ id: "m1", league: { id: "39", name: "Premier League", season: "2026", round: null } }),
          match({
            id: "m2",
            league: { id: "61", name: "Ligue 1", season: "2026", round: null },
            homeTeam: team("hp2", "PSG"),
            awayTeam: team("ap2", "Marseille"),
          }),
        ]),
      )
      .mockResolvedValueOnce(page([match({ id: "m1", league: { id: "39", name: "Premier League", season: "2026", round: null } })]));

    renderPage();
    await screen.findByText("Liverpool");

    expect(screen.getByRole("button", { name: "Premier League" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Ligue 1" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ligue 1" }));

    await screen.findByText("Ligue 1", { selector: "p.sh-section-title" });
    expect(listLiveScores).toHaveBeenLastCalledWith({ league: "61" });
    // The sidebar itself still lists BOTH leagues (accumulated), even
    // though the visible match list is now filtered to just one.
    expect(screen.getByRole("button", { name: "Premier League" })).not.toBeNull();
  });

  it("filters the league sidebar itself by the search box (client-side)", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(
      page([
        match({ id: "m1", league: { id: "39", name: "Premier League", season: "2026", round: null } }),
        match({
          id: "m2",
          league: { id: "78", name: "Bundesliga", season: "2026", round: null },
          homeTeam: team("hp2", "Bayern"),
          awayTeam: team("ap2", "Dortmund"),
        }),
      ]),
    );

    renderPage();
    await screen.findByRole("button", { name: "Bundesliga" });

    fireEvent.change(screen.getByLabelText(/search league/i), { target: { value: "bundes" } });

    expect(screen.queryByRole("button", { name: "Premier League" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bundesliga" })).not.toBeNull();
  });

  it("each match row links to its own Match Centre page", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([match({ id: "match-77" })]));

    renderPage();

    const link = await screen.findByRole("link", { name: /Liverpool.*Chelsea/s });
    expect(link.getAttribute("href")).toBe("/sports-hub/matches/match-77");
  });

  it("supports Load more via the returned cursor", async () => {
    vi.mocked(listLiveScores)
      .mockResolvedValueOnce(page([match({ id: "m1" })], "cursor-1"))
      .mockResolvedValueOnce(page([match({ id: "m2", homeTeam: team("hp2", "Arsenal"), awayTeam: team("ap2", "Fulham") })]));

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await screen.findByText("Arsenal");
    expect(listLiveScores).toHaveBeenLastCalledWith({ cursor: "cursor-1" });
    // Original row is still there -- Load More appends, not replaces.
    expect(screen.getByText("Liverpool")).not.toBeNull();
  });

  it("shows the illustrative caption is gone -- Recent Stories is unlabelled sample content, no vendor disclosure line", async () => {
    vi.mocked(listLiveScores).mockResolvedValueOnce(page([]));

    renderPage();
    await screen.findByText(/no live matches right now/i);

    expect(screen.queryByText(/has not yet selected a sports-data vendor/i)).toBeNull();
    expect(screen.getByText("Most Recent Stories")).not.toBeNull();
  });
});
