// GrassrootsFixturePage — the status-driven manage / log-result screen
// (frames 6/7/8). Mocks src/api/grassroots.ts; session seeded into
// sessionStorage. GET /fixtures/:id, PATCH /fixtures/:id/status and
// POST /fixtures/:id/result are real merged endpoints — the status
// machine and the "first write is final" race are exercised live by
// services/api's e2e layer (test/grassroots.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import GrassrootsFixturePage from "./GrassrootsFixturePage";
import { GrassrootsApiError, type Fixture } from "../api/grassroots";

vi.mock("../api/grassroots", async () => {
  const actual = await vi.importActual<typeof import("../api/grassroots")>("../api/grassroots");
  return {
    ...actual,
    getFixtureById: vi.fn(),
    updateFixtureStatus: vi.fn(),
    logResult: vi.fn(),
  };
});

import { getFixtureById, updateFixtureStatus, logResult } from "../api/grassroots";

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

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getFixtureById).mockReset();
  vi.mocked(updateFixtureStatus).mockReset();
  vi.mocked(logResult).mockReset();
});

function renderPage(id = "fx-1") {
  render(
    <MemoryRouter initialEntries={[`/grassroots/fixtures/${id}`]}>
      <Routes>
        <Route path="/grassroots/fixtures/:fixtureId" element={<GrassrootsFixturePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GrassrootsFixturePage", () => {
  it("shows a log-in prompt with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to manage this fixture/i)).not.toBeNull();
    expect(getFixtureById).not.toHaveBeenCalled();
  });

  it("scheduled: starts the match via PATCH status -> live", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById).mockResolvedValueOnce(fixture({ status: "scheduled" }));
    vi.mocked(updateFixtureStatus).mockResolvedValueOnce(fixture({ status: "live" }));

    renderPage();
    expect(await screen.findByRole("heading", { name: "Match day" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start match" }));

    await waitFor(() => expect(updateFixtureStatus).toHaveBeenCalledWith("test-token", "fx-1", "live"));
    expect(await screen.findByRole("heading", { name: "Match in play" })).not.toBeNull();
  });

  it("surfaces an illegal-transition 409 verbatim (not a silently-disabled button)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById)
      .mockResolvedValueOnce(fixture({ status: "scheduled" }))
      .mockResolvedValueOnce(fixture({ status: "full_time" })); // refetch after 409
    vi.mocked(updateFixtureStatus).mockRejectedValueOnce(
      new GrassrootsApiError('A fixture cannot move from "full_time" to "live"', { status: 409 }),
    );

    renderPage();
    await screen.findByRole("heading", { name: "Match day" });
    fireEvent.click(screen.getByRole("button", { name: "Start match" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/cannot move from "full_time" to "live"/i);
    // and it refetched
    await waitFor(() => expect(getFixtureById).toHaveBeenCalledTimes(2));
  });

  it("live: logs the result via POST /fixtures/:id/result and shows 'Result saved'", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById).mockResolvedValueOnce(fixture({ status: "live" }));
    vi.mocked(logResult).mockResolvedValueOnce(
      fixture({
        status: "full_time",
        result: { id: "r1", scoreA: 2, scoreB: 1, enteredById: "me", enteredAt: "x" },
      }),
    );

    renderPage();
    // live status -> "Log the result" primary opens the score form
    fireEvent.click(await screen.findByRole("button", { name: "Log the result" }));

    // bump Surulere to 2, Ikorodu to 1
    fireEvent.click(screen.getByRole("button", { name: /increase surulere united score/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase surulere united score/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase ikorodu rangers score/i }));

    fireEvent.click(screen.getByRole("button", { name: "End match & save result" }));

    await waitFor(() =>
      expect(logResult).toHaveBeenCalledWith("test-token", "fx-1", { scoreA: 2, scoreB: 1 }),
    );
    expect(await screen.findByRole("heading", { name: "Result saved" })).not.toBeNull();
    expect(screen.getByText(/2 – 1/)).not.toBeNull();
  });

  it("treats a 'first write is final' 409 on save as an expected outcome, not a generic error", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById)
      .mockResolvedValueOnce(fixture({ status: "live" }))
      .mockResolvedValueOnce(
        fixture({
          status: "full_time",
          result: { id: "r1", scoreA: 3, scoreB: 0, enteredById: "other", enteredAt: "x" },
        }),
      );
    vi.mocked(logResult).mockRejectedValueOnce(
      new GrassrootsApiError("A result has already been recorded for this fixture and can't be changed", {
        status: 409,
      }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Log the result" }));
    fireEvent.click(screen.getByRole("button", { name: "End match & save result" }));

    // The 409 message is shown as a status notice, NOT a red error alert,
    // and the page refetches to show the score that was actually recorded.
    expect(await screen.findByText(/already been recorded/i)).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(getFixtureById).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/3 – 0/)).not.toBeNull();
  });

  it("full_time: renders the read-only result with no success framing on a plain revisit", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById).mockResolvedValueOnce(
      fixture({
        status: "full_time",
        result: { id: "r1", scoreA: 2, scoreB: 1, enteredById: "me", enteredAt: "x" },
      }),
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "Full time" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Result saved" })).toBeNull();
    expect(screen.getByText(/2 – 1/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "View on team page" }).getAttribute("href")).toBe(
      "/grassroots/team-s",
    );
  });

  it("renders a 'Fixture not found' state on a 404", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getFixtureById).mockRejectedValueOnce(
      new GrassrootsApiError("Couldn't load that fixture (404).", { status: 404 }),
    );

    renderPage("nope");

    expect(await screen.findByText(/fixture not found/i)).not.toBeNull();
  });
});
