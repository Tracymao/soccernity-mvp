// CH-H21 -- the four tabs that follow the Figma desktop frames: lineup pitch, summary by half,
// standings zones and two-sided statistics. jsdom applies no CSS, so the single-column-on-mobile rule is
// asserted on the stylesheet itself.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import MatchCentrePage from "./MatchCentrePage";
import {
  getMatchBoxScore,
  getMatchById,
  getMatchEvents,
  getMatchLineups,
  getMatchStatistics,
  getStandings,
  getTopScorers,
  type LineupPlayer,
  type MatchEvent,
  type MatchSummary,
  type Standings,
  type TeamLineup,
} from "../../api/sports";

vi.mock("../../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../../api/sports")>("../../api/sports");
  return {
    ...actual,
    getMatchById: vi.fn(),
    getMatchEvents: vi.fn(),
    getMatchStatistics: vi.fn(),
    getMatchBoxScore: vi.fn(),
    getMatchLineups: vi.fn(),
    getStandings: vi.fn(),
    getTopScorers: vi.fn(),
  };
});

const team = (id: string, name: string) => ({ id, name, logo: null });
const HOME = team("h", "Liverpool");
const AWAY = team("a", "Chelsea");

const MATCH: MatchSummary = {
  id: "m1",
  competition: "Premier League",
  league: { id: "39", name: "Premier League", season: "2026", round: null },
  venue: "Anfield",
  kickoffTime: "2026-09-16T15:00:00.000Z",
  status: "finished",
  statusDetail: "Finished",
  homeTeam: HOME,
  awayTeam: AWAY,
  homeScore: 2,
  awayScore: 1,
  score: "2 - 1",
};

function event(minute: number, type: string, side: "home" | "away", player: string, extra: Partial<MatchEvent> = {}): MatchEvent {
  return { minute, addedTime: 0, displayMinute: `${minute}'`, type, side, player, assist: null, detail: null, ...extra };
}

// Newest first, as the API sends them.
const EVENTS: MatchEvent[] = [
  event(90, "Full Time", "home", ""),
  event(80, "VAR Penalty Cancelled", "away", "Palmer"),
  event(70, "Substitution", "home", "Gakpo", { detail: "Replaced Salah" }),
  event(60, "Goal", "home", "Salah", { assist: "Szoboszlai" }),
  event(45, "Half Time", "home", ""),
  event(40, "Red Card", "away", "Caicedo"),
  event(30, "Goal", "away", "Jackson"),
  event(20, "Yellow Card", "home", "Konate"),
  event(10, "Goal", "home", "Diaz"),
];

const players = (prefix: string, count: number): LineupPlayer[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: `A. ${prefix}${i}`, number: i + 1, position: null }));

function lineup(t: typeof HOME, formation: string, shape: number[], prefix: string, withRows = true): TeamLineup {
  const all = players(prefix, 11);
  let at = 0;
  const rows = withRows ? shape.map((size) => all.slice(at, (at += size))) : [];
  return { team: t, formation, rows, startingXI: all, substitutes: players(`${prefix}Sub`, 2), missingPlayers: [], coach: `${prefix}Coach` };
}

const lineups = (withRows: boolean) => ({
  home: lineup(HOME, "4-4-2", [1, 4, 4, 2], "Home", withRows),
  away: lineup(AWAY, "4-3-3", [1, 4, 3, 3], "Away", withRows),
  substitutions: [],
  expectedLineups: "not_available_from_provider" as const,
  updatedAt: null,
});

function standings(withZones: boolean): Standings {
  const zone = (position: number) =>
    position <= 4 ? "champions-league" : position === 5 ? "europa-league" : position >= 18 ? "relegation" : undefined;
  return {
    leagueId: "39",
    season: "2026",
    updatedAt: null,
    groups: [
      {
        name: null,
        rows: Array.from({ length: 20 }, (_, i) => ({
          position: i + 1,
          team: team(`t${i}`, `Team ${i + 1}`),
          points: 40 - i,
          played: 9,
          won: 8,
          drawn: 0,
          lost: 1,
          goalsFor: 23,
          goalsAgainst: 10,
          goalDifference: 13,
          ...(withZones && zone(i + 1) ? { zone: zone(i + 1) } : {}),
        })),
      },
    ],
    ...(withZones
      ? {
          zones: [
            { zone: "champions-league", label: "UEFA Champions League" },
            { zone: "europa-league", label: "UEFA Europa League" },
            { zone: "relegation", label: "Relegation" },
          ],
        }
      : {}),
  };
}

async function open(tab?: string) {
  render(
    <MemoryRouter initialEntries={["/sports-hub/matches/m1"]}>
      <Routes>
        <Route path="/sports-hub/matches/:matchId" element={<MatchCentrePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("link", { name: /sports hub/i });
  await screen.findByRole("button", { name: "Match" });
  if (tab) fireEvent.click(screen.getByRole("button", { name: tab }));
}

const halves = () => Array.from(document.querySelectorAll<HTMLElement>(".mc-half"));

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getMatchById).mockReset().mockResolvedValue(MATCH);
  vi.mocked(getMatchEvents).mockReset().mockResolvedValue({ items: EVENTS, updatedAt: null });
  vi.mocked(getMatchLineups).mockReset().mockResolvedValue(lineups(true));
  vi.mocked(getStandings).mockReset().mockResolvedValue(standings(true));
  vi.mocked(getTopScorers)
    .mockReset()
    .mockResolvedValue({ leagueId: "39", season: "2026", availability: "not_available_from_provider", items: [] });
  vi.mocked(getMatchStatistics)
    .mockReset()
    .mockResolvedValue({
      home: {
        team: HOME,
        statistics: [
          { label: "Provider Extra", value: 3 },
          { label: "Fouls", value: null },
          { label: "Possession", value: "60%" },
        ],
      },
      away: {
        team: AWAY,
        statistics: [
          { label: "Possession", value: "40%" },
          { label: "Fouls", value: 7 },
          { label: "Provider Extra", value: 1 },
        ],
      },
      updatedAt: null,
      availability: { pressureIndex: "not_available_from_provider", shotMaps: "not_available_from_provider" },
    });
  const player = (id: string, name: string, isSubstitute: boolean, extra = {}) => ({
    id,
    name,
    shirtNumber: null,
    position: null,
    isSubstitute,
    minutesPlayed: 90,
    rating: null,
    expectedGoals: null,
    expectedAssists: null,
    ...extra,
  });
  vi.mocked(getMatchBoxScore)
    .mockReset()
    .mockResolvedValue({
      home: {
        team: HOME,
        expectedGoals: null,
        players: [player("1", "Alisson", false, { passes: 24, passAccuracy: 87.5 }), player("2", "Elliott", true)],
      },
      away: { team: AWAY, expectedGoals: null, players: [player("3", "Palmer", false, { passes: 40 })] },
      updatedAt: null,
      availability: { playerRatings: "not_available_from_provider", expectedGoals: "not_available_from_provider" },
    });
});

describe("Match Centre -- lineups pitch", () => {
  it("draws both formations from the rows, then the paired rows", async () => {
    await open("Lineups");
    await screen.findByText("Starting lineups");
    const halfLines = (side: string) =>
      Array.from(document.querySelectorAll(`.mc-pitch__half--${side} .mc-pitch__line`)).map(
        (line) => line.querySelectorAll(".mc-pitch__player").length,
      );
    expect(halfLines("home")).toEqual([1, 4, 4, 2]);
    expect(halfLines("away")).toEqual([1, 4, 3, 3]);
    expect(document.querySelector(".mc-band--formation")?.textContent).toContain("4-4-2");
    expect(document.querySelector(".mc-band--formation")?.textContent).toContain("4-3-3");
    expect(screen.getByText("Substitutes")).not.toBeNull();
    expect(screen.getByText("Coaches")).not.toBeNull();
    // No missing players, so no band for them.
    expect(screen.queryByText("Missing players")).toBeNull();
    expect(document.querySelector(".mc-lineup-card")).toBeNull();
  });

  it("falls back to the list view when the rows are empty", async () => {
    vi.mocked(getMatchLineups).mockResolvedValue(lineups(false));
    await open("Lineups");
    await screen.findByText("A. Home0");
    expect(document.querySelector(".mc-pitch")).toBeNull();
    expect(document.querySelectorAll(".mc-lineup-card")).toHaveLength(2);
  });

  it("is a single column below 700px and two sides from 700px", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "MatchCentrePage.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/\n\.mc-pitch \{\n {2}display: flex;\n {2}flex-direction: column;/);
    expect(css).toMatch(/@media \(min-width: 700px\) \{\n {2}\.mc-pitch \{\n {4}flex-direction: row;/);
  });
});

describe("Match Centre -- summary by half", () => {
  it("groups events by half in minute order, with half scores, cards, a substitution and an unknown type", async () => {
    await open();
    await screen.findByText("Diaz");
    const [first, second] = halves();
    expect(within(first).getByRole("heading").textContent).toBe("First half1 - 1");
    expect(within(second).getByRole("heading").textContent).toBe("Second half1 - 0");
    const names = (half: HTMLElement) => Array.from(half.querySelectorAll(".mc-event__player")).map((n) => n.textContent);
    expect(names(first)).toEqual(["Diaz", "Konate", "Jackson", "Caicedo"]);
    expect(names(second)).toEqual(["Salah", "Gakpo", "Palmer"]);
    expect(within(first).getByRole("img", { name: "Yellow card" })).not.toBeNull();
    expect(within(first).getByRole("img", { name: "Red card" })).not.toBeNull();
    expect(within(second).getByRole("img", { name: "Substitution" })).not.toBeNull();
    expect(within(second).getByText("Salah", { selector: ".mc-event__secondary" })).not.toBeNull();
    expect(within(second).getByText("(Szoboszlai)")).not.toBeNull();
    expect(within(second).getByText("VAR Penalty Cancelled")).not.toBeNull();
    expect(screen.queryByText("Half Time")).toBeNull();
    expect(screen.getByText("Match information")).not.toBeNull();
    expect(screen.getByText("Anfield")).not.toBeNull();
    expect(screen.queryByText(/referee/i)).toBeNull();
  });

  it("hides the half scores when the goal events do not add up to the match score", async () => {
    vi.mocked(getMatchById).mockResolvedValue({ ...MATCH, homeScore: 3 });
    await open();
    await screen.findByText("Diaz");
    expect(halves().map((h) => within(h).getByRole("heading").textContent)).toEqual(["First half", "Second half"]);
    expect(document.querySelector(".mc-event__score")).toBeNull();
  });

  it("credits an own goal to whichever side the match score supports", async () => {
    vi.mocked(getMatchById).mockResolvedValue({ ...MATCH, homeScore: 1, awayScore: 0 });
    vi.mocked(getMatchEvents).mockResolvedValue({ items: [event(12, "Own Goal", "away", "Colwill")], updatedAt: null });
    await open();
    await screen.findByText("Colwill (OG)");
    expect(within(halves()[0]).getByRole("heading").textContent).toBe("First half1 - 0");
  });
});

describe("Match Centre -- standings zones", () => {
  it("colours the badges, labels them for screen readers and draws the legend", async () => {
    await open("Standings");
    await screen.findByText("Team 20");
    expect(document.querySelectorAll("td .mc-zone--champions-league")).toHaveLength(4);
    expect(document.querySelectorAll("td .mc-zone--europa-league")).toHaveLength(1);
    expect(document.querySelectorAll("td .mc-zone--relegation")).toHaveLength(3);
    expect(screen.getAllByText(/Champions League place/)).toHaveLength(4);
    expect(screen.getAllByText(/Relegation place/)).toHaveLength(3);
    expect(screen.getByText("UEFA Champions League")).not.toBeNull();
    expect(screen.getByText("UEFA Europa League")).not.toBeNull();
    expect(screen.getByText("Relegation")).not.toBeNull();
  });

  it("draws no colour and no legend for a league without a rule", async () => {
    vi.mocked(getStandings).mockResolvedValue(standings(false));
    await open("Standings");
    await screen.findByText("Team 20");
    expect(document.querySelector(".mc-zone")).toBeNull();
    expect(document.querySelector(".mc-zone-legend")).toBeNull();
  });
});

describe("Match Centre -- statistics", () => {
  it("draws two-sided bars in Figma order, keeps the dash and shows no half tabs", async () => {
    await open("Statistics");
    await screen.findByText("Provider Extra");
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".mc-compare > li"));
    expect(rows.map((r) => r.querySelector(".mc-compare__label")?.textContent)).toEqual(["Possession", "Fouls", "Provider Extra"]);
    const fills = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>(".mc-compare__fill"));
    expect(fills(rows[0]).map((f) => f.style.width)).toEqual(["60%", "40%"]);
    expect(fills(rows[0])[0].classList.contains("mc-compare__fill--lead")).toBe(true);
    expect(fills(rows[0])[1].classList.contains("mc-compare__fill--lead")).toBe(false);
    expect(within(rows[1]).getByText("—")).not.toBeNull();
    expect(screen.queryByText(/first half/i)).toBeNull();
  });

  it("draws the player table with only the columns that have data, a substitutes divider and a team toggle", async () => {
    await open("Statistics");
    const table = await screen.findByRole("table");
    expect(Array.from(table.querySelectorAll("thead th")).map((h) => h.textContent)).toEqual(["Player", "Min", "Passes", "Pass %"]);
    expect(within(table).getByText("88%")).not.toBeNull();
    expect(within(table).getByText("Substitutes")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chelsea" }));
    expect(within(table).getByText("Palmer")).not.toBeNull();
    expect(within(table).queryByText("Alisson")).toBeNull();
  });
});
