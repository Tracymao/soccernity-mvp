// MatchCentrePage -- the Sports Hub match drill-down. Mocks
// src/api/sports.ts, same convention as GrassrootsTeamPage.test.tsx. No
// session gate to seed -- every SportsService route is public. Every
// tab's data is fetched LAZILY (see MatchCentrePage.tsx's own header
// comment) -- these tests exercise that directly by asserting a given
// resource fetch has NOT fired until its own tab is activated.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import MatchCentrePage from "./MatchCentrePage";
import {
  SportsApiError,
  type MatchSummary,
  type MatchStatistics,
  type Lineups,
  type MatchEvents,
  type Momentum,
  type HeadToHead,
  type Highlights,
  type MatchAvailability,
} from "../../api/sports";
import FieldAvailabilityGate from "./FieldAvailabilityGate";

vi.mock("../../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../../api/sports")>("../../api/sports");
  return {
    ...actual,
    getMatchById: vi.fn(),
    getMatchStatistics: vi.fn(),
    getMatchLineups: vi.fn(),
    getMatchEvents: vi.fn(),
    getMatchMomentum: vi.fn(),
    getHeadToHead: vi.fn(),
    getStandings: vi.fn(),
    getHighlights: vi.fn(),
    getTopScorers: vi.fn(),
  };
});

import {
  getMatchById,
  getMatchStatistics,
  getMatchLineups,
  getMatchEvents,
  getMatchMomentum,
  getHeadToHead,
  getStandings,
  getHighlights,
  getTopScorers,
} from "../../api/sports";

function team(id: string, name: string) {
  return { id, name, logo: null };
}

const LIVERPOOL_V_CHELSEA: MatchSummary = {
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
};

const EMPTY_EVENTS: MatchEvents = { items: [], updatedAt: null };
const ALL_NOT_AVAILABLE: MatchAvailability = {
  playerRatings: "not_available_from_provider",
  expectedGoals: "not_available_from_provider",
  pressureIndex: "not_available_from_provider",
  shotMaps: "not_available_from_provider",
};
const EMPTY_STATS: MatchStatistics = { home: null, away: null, updatedAt: null, availability: ALL_NOT_AVAILABLE };
const EMPTY_MOMENTUM: Momentum = { bars: [], markers: [], updatedAt: null };
const EMPTY_H2H: HeadToHead = {
  meetings: [],
  aggregate: { played: 0, homeTeamWins: 0, awayTeamWins: 0, draws: 0, homeTeamGoals: 0, awayTeamGoals: 0 },
  updatedAt: null,
};
const EMPTY_HIGHLIGHTS: Highlights = { items: [], updatedAt: null };
const EMPTY_LINEUPS: Lineups = {
  home: { team: team("hp1", "Liverpool"), formation: null, rows: [], startingXI: [], substitutes: [], missingPlayers: [], coach: null },
  away: { team: team("ap1", "Chelsea"), formation: null, rows: [], startingXI: [], substitutes: [], missingPlayers: [], coach: null },
  substitutions: [],
  expectedLineups: "not_available_from_provider",
  updatedAt: null,
};

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getMatchById).mockReset();
  vi.mocked(getMatchStatistics).mockReset().mockResolvedValue(EMPTY_STATS);
  vi.mocked(getMatchLineups).mockReset().mockResolvedValue(EMPTY_LINEUPS);
  vi.mocked(getMatchEvents).mockReset().mockResolvedValue(EMPTY_EVENTS);
  vi.mocked(getMatchMomentum).mockReset().mockResolvedValue(EMPTY_MOMENTUM);
  vi.mocked(getHeadToHead).mockReset().mockResolvedValue(EMPTY_H2H);
  vi.mocked(getStandings).mockReset().mockResolvedValue({ leagueId: "39", season: "2026", groups: [], updatedAt: null });
  vi.mocked(getHighlights).mockReset().mockResolvedValue(EMPTY_HIGHLIGHTS);
  vi.mocked(getTopScorers)
    .mockReset()
    .mockResolvedValue({ leagueId: "39", season: "2026", availability: "not_available_from_provider", items: [] });
});

function renderPage(id = "m1") {
  render(
    <MemoryRouter initialEntries={[`/sports-hub/matches/${id}`]}>
      <Routes>
        <Route path="/sports-hub/matches/:matchId" element={<MatchCentrePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MatchCentrePage", () => {
  it("renders the match header -- teams, score, competition -- once loaded", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();

    expect(await screen.findByText("Liverpool")).not.toBeNull();
    expect(screen.getByText("Chelsea")).not.toBeNull();
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
    // "Premier League" appears both in the header and in the Summary
    // tab's own facts list (both real, both fed by the same match).
    expect(screen.getAllByText(/Premier League/).length).toBeGreaterThan(0);
  });

  it("renders an honest 'Match not found' state on a 404, with a back link", async () => {
    vi.mocked(getMatchById).mockRejectedValueOnce(new SportsApiError("Couldn't load that (404).", { status: 404 }));

    renderPage("does-not-exist");

    expect(await screen.findByText("Match not found.")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Sports Hub/i })).not.toBeNull();
  });

  it("shows a generic error (not 'not found') on a non-404 match failure", async () => {
    vi.mocked(getMatchById).mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByText("Match not found.")).toBeNull();
  });

  it("defaults to the Match / Summary tab and lazily fetches events for the goal list", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchEvents).mockResolvedValueOnce({
      items: [
        { minute: 23, addedTime: 0, displayMinute: "23'", type: "Goal", side: "home", player: "Salah", assist: "Alexander-Arnold", detail: null },
      ],
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Chelsea"); // header renders (the goal list also mentions "Liverpool")

    expect(await screen.findByText(/Salah/)).not.toBeNull();
    expect(getMatchEvents).toHaveBeenCalledWith("m1");
    // Nothing else was fetched just from landing on Summary.
    expect(getMatchStatistics).not.toHaveBeenCalled();
    expect(getMatchLineups).not.toHaveBeenCalled();
    expect(getMatchMomentum).not.toHaveBeenCalled();
    expect(getHeadToHead).not.toHaveBeenCalled();
    expect(getHighlights).not.toHaveBeenCalled();
  });

  it("shows 'No goals yet.' when the events feed has no Goal-type entries", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();

    expect(await screen.findByText("No goals yet.")).not.toBeNull();
  });

  it("switching to Statistics lazily fetches team stats and renders the honest team-level-only disclosure", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({
      home: { team: team("hp1", "Liverpool"), statistics: [{ label: "Ball Possession", value: "58%" }] },
      away: { team: team("ap1", "Chelsea"), statistics: [{ label: "Ball Possession", value: "42%" }] },
      updatedAt: null,
      availability: ALL_NOT_AVAILABLE,
    });

    renderPage();
    await screen.findByText("Liverpool");
    expect(getMatchStatistics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText("58%")).not.toBeNull();
    expect(screen.getByText("42%")).not.toBeNull();
    expect(screen.getByText("Ball Possession")).not.toBeNull();
    expect(screen.getByText(/per-player statistics aren.t available/i)).not.toBeNull();
    expect(getMatchStatistics).toHaveBeenCalledWith("m1");
  });

  it("shows an honest 'not available' message when Highlightly has no team stats for this match", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText(/team statistics aren.t available for this match yet/i)).not.toBeNull();
  });

  it("switching to Lineups lazily fetches lineups and renders starting XI + substitutions", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchLineups).mockResolvedValueOnce({
      home: {
        team: team("hp1", "Liverpool"),
        formation: "4-3-3",
        rows: [],
        startingXI: [{ id: "p1", name: "Alisson", number: 1, position: "GK" }],
        substitutes: [],
        missingPlayers: [],
        coach: "Arne Slot",
      },
      away: EMPTY_LINEUPS.away,
      substitutions: [{ minute: 62, side: "home", playerOff: "Salah", playerOn: "Gakpo" }],
      expectedLineups: "not_available_from_provider",
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: "Lineups" }));

    expect(await screen.findByText("Alisson")).not.toBeNull();
    expect(screen.getByText("4-3-3")).not.toBeNull();
    expect(screen.getByText("Arne Slot", { exact: false })).not.toBeNull();
    expect(screen.getByText(/Salah/)).not.toBeNull();
    expect(getMatchLineups).toHaveBeenCalledWith("m1");
  });

  it("switching to Momentum lazily fetches momentum data and renders markers + the derived-metric disclosure", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchMomentum).mockResolvedValueOnce({
      bars: [{ minute: 1, home: 5, away: 0 }],
      markers: [{ minute: 23, side: "home", type: "Goal", label: "Goal — Salah" }],
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: "Statistics" })); // switch away first
    fireEvent.click(screen.getByRole("button", { name: "Momentum" }));

    expect(await screen.findByText(/Goal — Salah/)).not.toBeNull();
    expect(screen.getByText(/derived estimate based on goals and cards/i)).not.toBeNull();
    expect(getMatchMomentum).toHaveBeenCalledWith("m1");
  });

  it("Commentary reuses the events already fetched for Summary -- no second call", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchEvents).mockResolvedValueOnce({
      items: [{ minute: 41, addedTime: 0, displayMinute: "41'", type: "Yellow Card", side: "away", player: "Caicedo", assist: null, detail: null }],
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool"); // Summary tab -> events fetched once
    expect(getMatchEvents).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Commentary" }));

    expect(await screen.findByText(/Caicedo/)).not.toBeNull();
    expect(screen.getByText(/automated match-event feed, not written commentary/i)).not.toBeNull();
    expect(getMatchEvents).toHaveBeenCalledTimes(1);
  });

  it("switching to H2H lazily fetches head-to-head and links each meeting to its own Match Centre page", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getHeadToHead).mockResolvedValueOnce({
      meetings: [{ ...LIVERPOOL_V_CHELSEA, id: "old-m1", status: "finished", statusDetail: "Finished" }],
      aggregate: { played: 1, homeTeamWins: 1, awayTeamWins: 0, draws: 0, homeTeamGoals: 3, awayTeamGoals: 1 },
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool");
    expect(getHeadToHead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "H2H" }));

    await screen.findByText("Head to head");
    const link = screen.getByRole("link", { name: /Liverpool.*Chelsea/s });
    expect(link.getAttribute("href")).toBe("/sports-hub/matches/old-m1");
    expect(getHeadToHead).toHaveBeenCalledWith("m1");
  });

  it("shows an honest empty state when two teams have never met before", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "H2H" }));

    expect(await screen.findByText(/no previous meetings between these two teams yet/i)).not.toBeNull();
  });

  it("switching to Standings calls getStandings with the match's own league + season, and highlights both competing teams", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getStandings).mockResolvedValueOnce({
      leagueId: "39",
      season: "2026",
      groups: [
        {
          name: null,
          rows: [
            { position: 1, team: team("hp1", "Liverpool"), points: 20, played: 8, won: 6, drawn: 2, lost: 0, goalsFor: 18, goalsAgainst: 6, goalDifference: 12 },
            { position: 2, team: team("ap1", "Chelsea"), points: 18, played: 8, won: 6, drawn: 0, lost: 2, goalsFor: 15, goalsAgainst: 8, goalDifference: 7 },
          ],
        },
      ],
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    expect(await screen.findByText(/recent-form data isn.t available/i)).not.toBeNull();
    expect(getStandings).toHaveBeenCalledWith("39", "2026");
    // Both rows render inside the standings table (team names appear
    // twice on screen now -- once in the header, once in the table).
    expect(screen.getAllByText("Liverpool").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Chelsea").length).toBeGreaterThan(1);
  });

  it("shows an honest message and never calls getStandings when the match has no league id", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce({
      ...LIVERPOOL_V_CHELSEA,
      league: { id: null, name: null, season: null, round: null },
    });

    renderPage();
    await screen.findByText("Liverpool");

    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    expect(await screen.findByText(/Standings aren.t available for this match/)).not.toBeNull();
    expect(await screen.findByText(/Top scorers aren.t available for this match/)).not.toBeNull();
    expect(getStandings).not.toHaveBeenCalled();
    expect(getTopScorers).not.toHaveBeenCalled();
  });

  it("switching to Video lazily fetches highlights and renders clip cards", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getHighlights).mockResolvedValueOnce({
      items: [
        { id: "h1", type: "Goal", title: "Salah opens the scoring", description: null, thumbnailUrl: null, url: "https://example.com/clip", embedUrl: null, source: "Highlightly", category: "Goal" },
      ],
      updatedAt: null,
    });

    renderPage();
    await screen.findByText("Liverpool");
    expect(getHighlights).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Video" }));

    expect(await screen.findByText("Salah opens the scoring")).not.toBeNull();
    expect(getHighlights).toHaveBeenCalledWith("m1");
  });

  it("shows an honest empty state when a match has no highlight clips yet", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Video" }));

    expect(await screen.findByText(/no video clips for this match yet/i)).not.toBeNull();
  });

  it("offers a retry button on a tab-level fetch failure, which re-fetches on click", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics)
      .mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }))
      .mockResolvedValueOnce({
        home: { team: team("hp1", "Liverpool"), statistics: [{ label: "Shots", value: 10 }] },
        away: { team: team("ap1", "Chelsea"), statistics: [{ label: "Shots", value: 8 }] },
        updatedAt: null,
        availability: ALL_NOT_AVAILABLE,
      });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Shots")).not.toBeNull();
    expect(getMatchStatistics).toHaveBeenCalledTimes(2);
  });
});

describe("MatchCentrePage — vendor-dependent field placeholders", () => {
  const TEAM_STATS = {
    home: { team: team("hp1", "Liverpool"), statistics: [{ label: "Ball Possession", value: "58%" }] },
    away: { team: team("ap1", "Chelsea"), statistics: [{ label: "Ball Possession", value: "42%" }] },
    updatedAt: null,
  };

  it("renders each vendor-only Statistics metric as a disabled 'not available from provider' placeholder, with no value shown", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ ...TEAM_STATS, availability: ALL_NOT_AVAILABLE });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText("Player box score · RATING")).not.toBeNull();
    expect(screen.getByText("Expected goals (xG)")).not.toBeNull();
    expect(screen.getByText("Pressure index")).not.toBeNull();
    expect(screen.getByText("Shot map")).not.toBeNull();
    expect(screen.getAllByText("Not available from current data provider")).toHaveLength(4);
    expect(screen.queryByText("No data for this match yet")).toBeNull();
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(4);
  });

  it("tells 'no data for this match' apart from 'not available from provider' on the same tab", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({
      ...TEAM_STATS,
      availability: {
        playerRatings: "no_data",
        expectedGoals: "not_available_from_provider",
        pressureIndex: "no_data",
        shotMaps: "not_available_from_provider",
      },
    });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findAllByText("No data for this match yet")).toHaveLength(2);
    expect(screen.getAllByText("Not available from current data provider")).toHaveLength(2);
  });

  it("still shows the advanced-metric placeholders when team totals are missing entirely", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ home: null, away: null, updatedAt: null, availability: ALL_NOT_AVAILABLE });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText(/team statistics aren.t available for this match yet/i)).not.toBeNull();
    expect(screen.getAllByText("Not available from current data provider")).toHaveLength(4);
  });

  it("shows an 'Expected lineups' placeholder on the Lineups tab, even when no XI is available yet", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchLineups).mockResolvedValueOnce({ ...EMPTY_LINEUPS, expectedLineups: "not_available_from_provider" });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Lineups" }));

    expect(await screen.findByText("Expected lineups")).not.toBeNull();
    expect(screen.getByText("Not available from current data provider")).not.toBeNull();
  });

  it("a top-scorers failure does not hide the standings table beneath which it renders", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getStandings).mockResolvedValueOnce({
      leagueId: "39",
      season: "2026",
      groups: [
        {
          name: null,
          rows: [{ position: 1, team: team("hp1", "Liverpool"), points: 20, played: 8, won: 6, drawn: 2, lost: 0, goalsFor: 18, goalsAgainst: 6, goalDifference: 12 }],
        },
      ],
      updatedAt: null,
    });
    vi.mocked(getTopScorers).mockRejectedValueOnce(new Error("boom"));

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    expect(await screen.findByText("Couldn't load top scorers.")).not.toBeNull();
    expect(screen.getByRole("table")).not.toBeNull();
    expect(getTopScorers).toHaveBeenCalledWith("39", "2026");
  });

  it("renders top scorers as a disabled placeholder when the provider cannot supply them", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    expect(await screen.findByText("Top scorers")).not.toBeNull();
    expect(await screen.findByText("Not available from current data provider")).not.toBeNull();
  });

  it("renders top scorers as real rows only when the provider supports them", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getTopScorers).mockResolvedValueOnce({
      leagueId: "39",
      season: "2026",
      availability: "available",
      items: [{ rank: 1, player: { id: "p9", name: "Haaland" }, team: team("mc", "Man City"), goals: 14, assists: 3 }],
    });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    expect(await screen.findByText("Haaland")).not.toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
  });
});

describe("FieldAvailabilityGate", () => {
  it("renders children, and no placeholder, only when the signal is 'available'", () => {
    render(
      <FieldAvailabilityGate label="Shot map" availability="available">
        <p>real shot map</p>
      </FieldAvailabilityGate>,
    );
    expect(screen.getByText("real shot map")).not.toBeNull();
    expect(screen.queryByText("Shot map")).toBeNull();
  });

  it("never renders children for an unavailable state", () => {
    render(
      <FieldAvailabilityGate label="Shot map" availability="no_data">
        <p>should not appear</p>
      </FieldAvailabilityGate>,
    );
    expect(screen.queryByText("should not appear")).toBeNull();
    expect(screen.getByText("No data for this match yet")).not.toBeNull();
  });
});
