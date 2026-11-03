// MatchCentrePage -- the Sports Hub match drill-down. Mocks
// src/api/sports.ts, same convention as GrassrootsTeamPage.test.tsx. No
// session gate to seed -- every SportsService route is public. Every
// tab's data is fetched LAZILY (see MatchCentrePage.tsx's own header
// comment) -- these tests exercise that directly by asserting a given
// resource fetch has NOT fired until its own tab is activated.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  type MatchBoxScore,
  type StandingRow,
} from "../../api/sports";
import FieldAvailabilityGate from "./FieldAvailabilityGate";

vi.mock("../../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../../api/sports")>("../../api/sports");
  return {
    ...actual,
    getMatchById: vi.fn(),
    getMatchStatistics: vi.fn(),
    getMatchBoxScore: vi.fn(),
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
  getMatchBoxScore,
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
const STATS_NOT_AVAILABLE: MatchAvailability = {
  pressureIndex: "not_available_from_provider",
  shotMaps: "not_available_from_provider",
};
const BOX_SCORE_NOT_AVAILABLE: MatchBoxScore["availability"] = {
  playerRatings: "not_available_from_provider",
  expectedGoals: "not_available_from_provider",
};
const EMPTY_BOX_SCORE: MatchBoxScore = { home: null, away: null, updatedAt: null, availability: BOX_SCORE_NOT_AVAILABLE };
const EMPTY_STATS: MatchStatistics = { home: null, away: null, updatedAt: null, availability: STATS_NOT_AVAILABLE };
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
  vi.mocked(getMatchBoxScore).mockReset().mockResolvedValue(EMPTY_BOX_SCORE);
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
      availability: STATS_NOT_AVAILABLE,
    });

    renderPage();
    await screen.findByText("Liverpool");
    expect(getMatchStatistics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText("58%")).not.toBeNull();
    expect(screen.getByText("42%")).not.toBeNull();
    expect(screen.getByText("Ball Possession")).not.toBeNull();
    // The old pointer to the (now hidden) ratings / xG sections is gone.
    expect(screen.queryByText(/shown below/i)).toBeNull();
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

    expect(await screen.findByRole("table")).not.toBeNull();
    // Highlightly sends no form: no FORM column, and no notice explaining its absence.
    expect(screen.queryByRole("columnheader", { name: "Form" })).toBeNull();
    expect(screen.queryByText(/recent-form data/i)).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
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
        availability: STATS_NOT_AVAILABLE,
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

describe("MatchCentrePage — vendor-absent fields are hidden", () => {
  const TEAM_STATS = {
    home: { team: team("hp1", "Liverpool"), statistics: [{ label: "Ball Possession", value: "58%" }] },
    away: { team: team("ap1", "Chelsea"), statistics: [{ label: "Ball Possession", value: "42%" }] },
    updatedAt: null,
  };

  it("renders nothing for each vendor-absent Statistics metric: no title, no notice, no disabled section", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ ...TEAM_STATS, availability: STATS_NOT_AVAILABLE });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText("Ball Possession")).not.toBeNull();
    await waitFor(() => expect(getMatchBoxScore).toHaveBeenCalled());
    expect(screen.queryByText("Player box score · RATING")).toBeNull();
    expect(screen.queryByText("Expected goals (xG)")).toBeNull();
    expect(screen.queryByText("Pressure index")).toBeNull();
    expect(screen.queryByText("Shot map")).toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
    expect(screen.queryByText("No data for this match yet")).toBeNull();
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    expect(document.querySelectorAll(".mc-disabled")).toHaveLength(0);
  });

  it("tells 'no data for this match' apart from 'not available from provider' on the same tab", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({
      ...TEAM_STATS,
      availability: {
        pressureIndex: "no_data",
        shotMaps: "not_available_from_provider",
      },
    });
    vi.mocked(getMatchBoxScore).mockResolvedValueOnce({
      home: null,
      away: null,
      updatedAt: null,
      availability: { playerRatings: "no_data", expectedGoals: "not_available_from_provider" },
    });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findAllByText("No data for this match yet")).toHaveLength(2);
    // The vendor-absent half is hidden outright, only the vendor-can-supply half shows.
    expect(screen.queryByText("Shot map")).toBeNull();
    expect(screen.queryByText("Expected goals (xG)")).toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
  });

  it("renders real player ratings and team xG from the box score when the provider supplies them", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ ...TEAM_STATS, availability: STATS_NOT_AVAILABLE });
    vi.mocked(getMatchBoxScore).mockResolvedValueOnce({
      home: {
        team: team("hp1", "Liverpool"),
        expectedGoals: 1.14,
        players: [
          { id: "10", name: "Salah", shirtNumber: 11, position: "Forward", isSubstitute: false, minutesPlayed: 90, rating: 8.2, expectedGoals: 0.89, expectedAssists: null },
          { id: "11", name: "Bench", shirtNumber: 30, position: "Goalkeeper", isSubstitute: true, minutesPlayed: 0, rating: null, expectedGoals: null, expectedAssists: null },
        ],
      },
      away: {
        team: team("ap1", "Chelsea"),
        expectedGoals: 0.25,
        players: [{ id: "20", name: "Palmer", shirtNumber: 10, position: "Midfield", isSubstitute: false, minutesPlayed: 90, rating: 6.4, expectedGoals: 0.25, expectedAssists: null }],
      },
      updatedAt: null,
      availability: { playerRatings: "available", expectedGoals: "available" },
    });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText("Salah")).not.toBeNull();
    expect(screen.getByText("8.2")).not.toBeNull();
    expect(screen.getByText("1.14")).not.toBeNull();
    expect(screen.getByText("0.25")).not.toBeNull();
    // Only the metrics with no source at all stay hidden.
    expect(screen.queryByText("Player box score · RATING")).toBeNull();
    expect(screen.queryByText("Pressure index")).toBeNull();
    expect(screen.queryByText("Shot map")).toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it("does not fetch the box score until the Statistics tab is opened", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");

    expect(getMatchBoxScore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    await waitFor(() => expect(getMatchBoxScore).toHaveBeenCalledWith("m1"));
  });

  it("keeps the existing empty state, and no placeholder, when team totals are missing and every advanced metric is vendor-absent", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ home: null, away: null, updatedAt: null, availability: STATS_NOT_AVAILABLE });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(await screen.findByText(/team statistics aren.t available for this match yet/i)).not.toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
    expect(document.querySelectorAll(".mc-section")).toHaveLength(0);
  });

  it("hides 'Expected lineups' on the Lineups tab, leaving only the existing empty message, when no XI is available yet", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchLineups).mockResolvedValueOnce({ ...EMPTY_LINEUPS, expectedLineups: "not_available_from_provider" });

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Lineups" }));

    expect(await screen.findByText(/Lineups aren.t available for this match yet/)).not.toBeNull();
    expect(screen.queryByText("Expected lineups")).toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
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

  it("hides top scorers entirely when the provider cannot supply them", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);

    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));

    await waitFor(() => expect(getTopScorers).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading top scorers…")).toBeNull());
    expect(screen.queryByText("Top scorers")).toBeNull();
    expect(screen.queryByText("Not available from current data provider")).toBeNull();
    expect(document.querySelectorAll(".mc-disabled")).toHaveLength(0);
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

describe("MatchCentrePage — Standings FORM column", () => {
  const ROWS: StandingRow[] = [
    { position: 1, team: team("hp1", "Liverpool"), points: 20, played: 8, won: 6, drawn: 2, lost: 0, goalsFor: 18, goalsAgainst: 6, goalDifference: 12 },
    { position: 2, team: team("ap1", "Chelsea"), points: 18, played: 8, won: 6, drawn: 0, lost: 2, goalsFor: 15, goalsAgainst: 8, goalDifference: 7 },
  ];

  async function openStandings(rows: StandingRow[]) {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getStandings).mockResolvedValueOnce({ leagueId: "39", season: "2026", groups: [{ name: null, rows }], updatedAt: null });
    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Standings" }));
    await screen.findByRole("table");
  }

  it("without form: no FORM header or cell, 10 columns on every row", async () => {
    await openStandings(ROWS);
    expect(screen.queryByRole("columnheader", { name: "Form" })).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
    for (const row of screen.getAllByRole("row").slice(1)) {
      expect(row.querySelectorAll("td")).toHaveLength(10);
    }
    expect(document.querySelectorAll(".mc-form-chip")).toHaveLength(0);
  });

  it("with form on the rows (a provider that supplies it): FORM column drawn, header and cells aligned", async () => {
    await openStandings([
      { ...ROWS[0], form: ["W", "W", "D"] },
      { ...ROWS[1], form: ["L", "W"] },
    ]);
    expect(screen.getByRole("columnheader", { name: "Form" })).not.toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(11);
    for (const row of screen.getAllByRole("row").slice(1)) {
      expect(row.querySelectorAll("td")).toHaveLength(11);
    }
    expect(document.querySelectorAll(".mc-form-chip")).toHaveLength(5);
  });

  it("an empty form array on every row counts as absent: still no column", async () => {
    await openStandings([
      { ...ROWS[0], form: [] },
      { ...ROWS[1], form: [] },
    ]);
    expect(screen.queryByRole("columnheader", { name: "Form" })).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
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

  it("renders nothing at all for a vendor-absent field: empty DOM, no label, no notice", () => {
    const { container } = render(
      <FieldAvailabilityGate label="Shot map" availability="not_available_from_provider">
        <p>should not appear</p>
      </FieldAvailabilityGate>,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("should not appear")).toBeNull();
    expect(screen.queryByText("Shot map")).toBeNull();
  });

  it("keeps the 'no data for this match yet' state: the vendor can supply it, nothing is cached", () => {
    render(
      <FieldAvailabilityGate label="Shot map" availability="no_data">
        <p>should not appear</p>
      </FieldAvailabilityGate>,
    );
    expect(screen.queryByText("should not appear")).toBeNull();
    expect(screen.getByText("Shot map")).not.toBeNull();
    expect(screen.getByText("No data for this match yet")).not.toBeNull();
  });
});

// One test per vendor-dependent field: the backend availability signal (derived from the
// capability registry) maps to "hidden" in the Match Centre. Registry contents themselves are
// tested in services/api (sports-data-provider.constants.spec.ts); this pins the web side.
describe("MatchCentrePage — each vendor-absent field is hidden", () => {
  const TEAM_STATS = {
    home: { team: team("hp1", "Liverpool"), statistics: [{ label: "Ball Possession", value: "58%" }] },
    away: { team: team("ap1", "Chelsea"), statistics: [{ label: "Ball Possession", value: "42%" }] },
    updatedAt: null,
  };
  const ABSENT = "not_available_from_provider" as const;

  it.each([
    ["Pressure index", { pressureIndex: ABSENT, shotMaps: "available" as const }],
    ["Shot map", { pressureIndex: "available" as const, shotMaps: ABSENT }],
  ])("%s is hidden when the signal is not_available_from_provider", async (label, availability) => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ ...TEAM_STATS, availability });
    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    await screen.findByText("Ball Possession");
    expect(screen.queryByText(label)).toBeNull();
  });

  it.each([
    ["Player box score · RATING", { playerRatings: ABSENT, expectedGoals: "no_data" as const }, "Expected goals (xG)"],
    ["Expected goals (xG)", { playerRatings: "no_data" as const, expectedGoals: ABSENT }, "Player box score · RATING"],
  ])("%s is hidden when the box-score signal is not_available_from_provider", async (label, availability, visibleLabel) => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchStatistics).mockResolvedValueOnce({ ...TEAM_STATS, availability: STATS_NOT_AVAILABLE });
    vi.mocked(getMatchBoxScore).mockResolvedValueOnce({ home: null, away: null, updatedAt: null, availability });
    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    // the sibling field (vendor can supply it, no data yet) still shows, the absent one does not
    expect(await screen.findByText(visibleLabel)).not.toBeNull();
    expect(screen.queryByText(label)).toBeNull();
  });

  it("Expected lineups is hidden when the lineups signal is not_available_from_provider, even with a full XI", async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(LIVERPOOL_V_CHELSEA);
    vi.mocked(getMatchLineups).mockResolvedValueOnce({
      ...EMPTY_LINEUPS,
      home: { ...EMPTY_LINEUPS.home, startingXI: [{ id: "1", name: "Alisson", number: 1, position: "GK" }] },
      expectedLineups: ABSENT,
    });
    renderPage();
    await screen.findByText("Liverpool");
    fireEvent.click(screen.getByRole("button", { name: "Lineups" }));
    expect(await screen.findByText("Alisson")).not.toBeNull();
    expect(screen.queryByText("Expected lineups")).toBeNull();
  });
});

// The removed wording must not creep back anywhere in the web sources.
describe("removed vendor-absent wording", () => {
  it("appears in no non-test web source file", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (/Not available from current data provider|Recent-form data isn/i.test(text)) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
