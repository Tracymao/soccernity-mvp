// GrassrootsPage (Grassroots — Browse Teams). Same conventions as
// ClubsPage.test.tsx: plain DOM assertions, mocks src/api/grassroots.ts,
// session seeded into sessionStorage. GET /teams?city= is a real merged
// endpoint — exercising it live is services/api's e2e layer's job
// (test/grassroots.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GrassrootsPage from "./GrassrootsPage";
import { GrassrootsApiError, type GrassrootsTeam } from "../api/grassroots";

vi.mock("../api/grassroots", async () => {
  const actual = await vi.importActual<typeof import("../api/grassroots")>("../api/grassroots");
  return { ...actual, listTeams: vi.fn() };
});

import { listTeams } from "../api/grassroots";

const SURULERE: GrassrootsTeam = {
  id: "team-s",
  name: "Surulere United",
  city: "Lagos",
  leagueType: "informal",
  createdById: "org-1",
  verified: true,
};

const MARINA: GrassrootsTeam = {
  id: "team-m",
  name: "Marina Boys FC",
  city: "Lagos",
  leagueType: "school",
  createdById: "org-2",
  verified: false,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listTeams).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/grassroots"]}>
      <GrassrootsPage />
    </MemoryRouter>,
  );
}

describe("GrassrootsPage", () => {
  it("shows a log-in prompt and never calls GET /teams with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to browse grassroots teams/i)).not.toBeNull();
    expect(listTeams).not.toHaveBeenCalled();
  });

  it("renders a loaded page of teams with verified / unverified badges and card links", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listTeams).mockResolvedValueOnce({ items: [SURULERE, MARINA], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Surulere United")).not.toBeNull();
    expect(screen.getByText("Lagos • Informal team")).not.toBeNull();
    expect(screen.getByText("Lagos • School team")).not.toBeNull();
    expect(screen.getByText(/verified team/i)).not.toBeNull();
    expect(screen.getByText(/community team · unverified/i)).not.toBeNull();

    // Whole card is a link to the team page — no Join button anywhere.
    const link = screen.getByRole("link", { name: /Surulere United/ });
    expect(link.getAttribute("href")).toBe("/grassroots/team-s");
    expect(screen.queryByRole("button", { name: /join|leave/i })).toBeNull();

    // Initial load is unfiltered.
    expect(listTeams).toHaveBeenCalledWith("test-token", undefined);
  });

  it("shows 'No teams registered yet' when the unfiltered list is empty", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listTeams).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText("No teams registered yet")).not.toBeNull();
  });

  it("re-queries the server (debounced) when a city is typed, and shows the city-specific empty state", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listTeams)
      .mockResolvedValueOnce({ items: [SURULERE, MARINA], nextCursor: null }) // initial
      .mockResolvedValueOnce({ items: [], nextCursor: null }); // after city filter

    renderPage();
    await screen.findByText("Surulere United");

    fireEvent.change(screen.getByLabelText(/search teams by city/i), { target: { value: "Ibadan" } });

    // The debounce (300ms) fires a real server round trip, not a local
    // filter — GET /teams?city=Ibadan.
    await waitFor(() => expect(listTeams).toHaveBeenCalledWith("test-token", { city: "Ibadan" }));
    expect(await screen.findByText("No teams in Ibadan yet")).not.toBeNull();
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listTeams)
      .mockResolvedValueOnce({ items: [SURULERE], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [MARINA], nextCursor: null });

    renderPage();
    await screen.findByText("Surulere United");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(listTeams).toHaveBeenCalledWith("test-token", { cursor: "cursor-1" }));
    expect(await screen.findByText("Marina Boys FC")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("shows a load error without crashing", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listTeams).mockRejectedValueOnce(new GrassrootsApiError("Couldn't load teams (500)."));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load teams/i);
  });
});
