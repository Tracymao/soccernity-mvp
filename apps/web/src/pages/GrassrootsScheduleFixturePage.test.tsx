// GrassrootsScheduleFixturePage. Mocks src/api/grassroots.ts; session
// seeded into sessionStorage as a decodable fake JWT so the organiser
// guard (team.createdById === token `sub`) can run. GET /teams/:id,
// GET /teams?city= and POST /fixtures are real merged endpoints —
// exercised live by services/api's e2e layer.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import GrassrootsScheduleFixturePage from "./GrassrootsScheduleFixturePage";
import { GrassrootsApiError, type Fixture, type GrassrootsTeam } from "../api/grassroots";

vi.mock("../api/grassroots", async () => {
  const actual = await vi.importActual<typeof import("../api/grassroots")>("../api/grassroots");
  return { ...actual, getTeamById: vi.fn(), listTeams: vi.fn(), createFixture: vi.fn() };
});

import { getTeamById, listTeams, createFixture } from "../api/grassroots";

function tokenFor(sub: string): string {
  return `x.${btoa(JSON.stringify({ sub, role: "user" }))}.y`;
}

const MY_TEAM: GrassrootsTeam = {
  id: "team-s",
  name: "Surulere United",
  city: "Lagos",
  leagueType: "informal",
  createdById: "me",
  verified: false,
};

function fixtureTeam(id: string, name: string) {
  return { id, name, city: "Lagos", verified: false };
}

function scheduledFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "fx-new",
    teamAId: "team-s",
    teamBId: null,
    opponentName: "Riverside FC",
    scheduledAt: "2026-10-01T15:00:00.000Z",
    venue: null,
    status: "scheduled",
    teamA: fixtureTeam("team-s", "Surulere United"),
    teamB: null,
    result: null,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getTeamById).mockReset().mockResolvedValue(MY_TEAM);
  vi.mocked(listTeams).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(createFixture).mockReset();
});

function renderPage(teamId = "team-s") {
  render(
    <MemoryRouter initialEntries={[`/grassroots/${teamId}/fixtures/new`]}>
      <Routes>
        <Route path="/grassroots/:teamId/fixtures/new" element={<GrassrootsScheduleFixturePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GrassrootsScheduleFixturePage", () => {
  it("shows a log-in prompt with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to schedule a fixture/i)).not.toBeNull();
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it("blocks a non-organiser with a clear message", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("someone-else"));
    renderPage();
    expect(await screen.findByText(/only schedule fixtures for a team you registered/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule fixture" })).toBeNull();
  });

  it("schedules a free-text opponent and shows the confirmation", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("me"));
    vi.mocked(createFixture).mockResolvedValueOnce(scheduledFixture());

    renderPage();
    await screen.findByRole("heading", { name: "Schedule a fixture" });

    fireEvent.click(screen.getByRole("radio", { name: "Other team" }));
    fireEvent.change(screen.getByLabelText("Opponent name"), { target: { value: "Riverside FC" } });
    fireEvent.change(screen.getByLabelText("Match date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Kick-off time"), { target: { value: "15:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Schedule fixture" }));

    await waitFor(() => expect(createFixture).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(createFixture).mock.calls[0][1];
    expect(arg.teamAId).toBe("team-s");
    expect(arg.opponentName).toBe("Riverside FC");
    expect(arg.teamBId).toBeUndefined();

    expect(await screen.findByRole("heading", { name: "Fixture scheduled" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Manage this fixture" }).getAttribute("href")).toBe(
      "/grassroots/fixtures/fx-new",
    );
  });

  it("schedules a 'decide later' fixture (neither teamBId nor opponentName)", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("me"));
    vi.mocked(createFixture).mockResolvedValueOnce(scheduledFixture({ opponentName: null }));

    renderPage();
    await screen.findByRole("heading", { name: "Schedule a fixture" });

    fireEvent.click(screen.getByRole("radio", { name: "Decide later" }));
    fireEvent.change(screen.getByLabelText("Match date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Kick-off time"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule fixture" }));

    await waitFor(() => expect(createFixture).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(createFixture).mock.calls[0][1];
    expect(arg.teamBId).toBeUndefined();
    expect(arg.opponentName).toBeUndefined();
  });

  it("keeps Schedule disabled until date and time are set", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("me"));
    renderPage();
    await screen.findByRole("heading", { name: "Schedule a fixture" });

    const btn = () => screen.getByRole("button", { name: "Schedule fixture" }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Match date"), { target: { value: "2026-10-01" } });
    expect(btn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Kick-off time"), { target: { value: "15:00" } });
    expect(btn().disabled).toBe(false);
  });

  it("surfaces a guardian-consent 403 with a link to /guardian-consent", async () => {
    window.sessionStorage.setItem("sn_access_token", tokenFor("me"));
    vi.mocked(createFixture).mockRejectedValueOnce(
      new GrassrootsApiError("This account is awaiting guardian consent and cannot access this feature yet.", {
        status: 403,
      }),
    );

    renderPage();
    await screen.findByRole("heading", { name: "Schedule a fixture" });
    fireEvent.click(screen.getByRole("radio", { name: "Decide later" }));
    fireEvent.change(screen.getByLabelText("Match date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Kick-off time"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule fixture" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("link", { name: /consent status/i }).getAttribute("href")).toBe("/guardian-consent");
  });
});
