// GrassrootsTeamPage (Grassroots — Public Team Page). Same conventions as
// ClubFanPage.test.tsx: plain DOM assertions, mocks src/api/grassroots.ts,
// session seeded into sessionStorage. GET /teams/:id and
// GET /teams/:id/fixtures are real merged endpoints — exercising them
// live is services/api's e2e layer's job (test/grassroots.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import GrassrootsTeamPage from "./GrassrootsTeamPage";
import { GrassrootsApiError, type Fixture, type GrassrootsTeam } from "../api/grassroots";

vi.mock("../api/grassroots", async () => {
  const actual = await vi.importActual<typeof import("../api/grassroots")>("../api/grassroots");
  return { ...actual, getTeamById: vi.fn(), getTeamFixtures: vi.fn() };
});

import { getTeamById, getTeamFixtures } from "../api/grassroots";

// A decodable fake JWT so the organiser check (team.createdById === the
// token's `sub`) can run. A plain "test-token" is not decodable, so with
// it the page always renders as a non-organiser (no toolbar).
function tokenFor(sub: string): string {
  return `x.${btoa(JSON.stringify({ sub, role: "user" }))}.y`;
}

const SURULERE: GrassrootsTeam = {
  id: "team-s",
  name: "Surulere United",
  city: "Lagos",
  leagueType: "informal",
  createdById: "org-1",
  verified: true,
};

function team(overrides: Partial<GrassrootsTeam> = {}): GrassrootsTeam {
  return { ...SURULERE, ...overrides };
}

function fixtureTeam(id: string, name: string) {
  return { id, name, city: "Lagos", verified: false };
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "fx-1",
    teamAId: "team-s",
    teamBId: "team-ik",
    opponentName: null,
    scheduledAt: "2026-09-12T15:00:00.000Z",
    venue: "Teslim Balogun Stadium",
    status: "scheduled",
    teamA: fixtureTeam("team-s", "Surulere United"),
    teamB: fixtureTeam("team-ik", "Ikorodu Rangers"),
    result: null,
    ...overrides,
  };
}

const EMPTY_PAGE = { items: [], nextCursor: null };

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getTeamById).mockReset();
  vi.mocked(getTeamFixtures).mockReset().mockResolvedValue(EMPTY_PAGE);
});

function renderPage(id = "team-s") {
  render(
    <MemoryRouter initialEntries={[`/grassroots/${id}`]}>
      <Routes>
        <Route path="/grassroots/:teamId" element={<GrassrootsTeamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GrassrootsTeamPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this team/i)).not.toBeNull();
    expect(getTeamById).not.toHaveBeenCalled();
    expect(getTeamFixtures).not.toHaveBeenCalled();
  });

  it("renders the team header — name, city • type, verified badge", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getByText("Lagos • Informal team")).not.toBeNull();
    expect(screen.getByText(/verified team/i)).not.toBeNull();
    expect(getTeamById).toHaveBeenCalledWith("test-token", "team-s");
    expect(getTeamFixtures).toHaveBeenCalledWith("test-token", "team-s");
  });

  it("shows the unverified badge for a non-verified team", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(team({ verified: false }));

    renderPage();

    expect(await screen.findByText(/community team · unverified/i)).not.toBeNull();
    expect(screen.queryByText(/verified team/i)).toBeNull();
  });

  it("splits fixtures into Upcoming and Results, with the score from this team's perspective", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockResolvedValueOnce({
      items: [
        // Upcoming — registered opponent.
        fixture({ id: "u1", scheduledAt: "2026-09-12T15:00:00.000Z" }),
        // Result where THIS team is the away side (teamB): won 2–1, so
        // "our" score (scoreB) must render first.
        fixture({
          id: "r1",
          teamAId: "team-ik",
          teamBId: "team-s",
          scheduledAt: "2026-09-05T15:00:00.000Z",
          status: "full_time",
          teamA: fixtureTeam("team-ik", "Ikorodu Rangers"),
          teamB: fixtureTeam("team-s", "Surulere United"),
          result: { id: "res-1", scoreA: 1, scoreB: 2, enteredById: "org-1", enteredAt: "x" },
        }),
      ],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Upcoming fixtures" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Results" })).not.toBeNull();
    // Opponent is Ikorodu Rangers in both rows (the not-this-team side).
    expect(screen.getAllByText(/Ikorodu Rangers/).length).toBe(2);
    // Score is "our – theirs" → 2 – 1, outcome "Won".
    expect(screen.getByText(/2\s*–\s*1/)).not.toBeNull();
    expect(screen.getByText("Won")).not.toBeNull();
  });

  it("renders 'Opponent TBC' when a fixture has neither a registered teamB nor an opponentName", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockResolvedValueOnce({
      items: [fixture({ id: "u2", teamBId: null, teamB: null, opponentName: null })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText(/v\s+Opponent TBC/)).not.toBeNull();
  });

  it("renders the free-text opponentName when there is no registered teamB", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockResolvedValueOnce({
      items: [fixture({ id: "u3", teamBId: null, teamB: null, opponentName: "Riverside FC" })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText(/v\s+Riverside FC/)).not.toBeNull();
  });

  it("shows the 'No fixtures yet' empty state", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);

    renderPage();

    expect(await screen.findByText("No fixtures yet")).not.toBeNull();
  });

  it("keeps the page working when fixtures fail to load (header still renders)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockRejectedValueOnce(new GrassrootsApiError("boom", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getByText(/couldn.t load this team.s fixtures/i)).not.toBeNull();
  });

  it("renders an honest 'Team not found' state on a 404, with a link back to /grassroots", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockRejectedValueOnce(
      new GrassrootsApiError("Couldn't load that team (404).", { status: 404 }),
    );

    renderPage("does-not-exist");

    expect(await screen.findByText(/team not found/i)).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /teams/i }).length).toBeGreaterThan(0);
    expect(getTeamFixtures).not.toHaveBeenCalled();
  });

  it("shows a generic error (not 'not found') on a non-404 team failure", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getTeamById).mockRejectedValueOnce(
      new GrassrootsApiError("Couldn't load that team (500).", { status: 500 }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load this team/i);
  });

  it("shows the organiser a 'Schedule a fixture' link and per-fixture 'Manage' links", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("org-1")); // === createdById
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockResolvedValueOnce({
      items: [fixture({ id: "u1" })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Schedule a fixture" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Schedule a fixture" })[0].getAttribute("href")).toBe(
      "/grassroots/team-s/fixtures/new",
    );
    expect(screen.getByRole("link", { name: "Manage" }).getAttribute("href")).toBe(
      "/grassroots/fixtures/u1",
    );
  });

  it("does NOT show organiser affordances to a non-organiser viewer", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("someone-else"));
    vi.mocked(getTeamById).mockResolvedValueOnce(SURULERE);
    vi.mocked(getTeamFixtures).mockReset().mockResolvedValueOnce({
      items: [fixture({ id: "u1" })],
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Schedule a fixture" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
  });
});
