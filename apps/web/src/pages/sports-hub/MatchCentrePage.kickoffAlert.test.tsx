// B-070 -- the kickoff-alert control in the Match Centre header (Figma C3 / C4, labelled style).
// Mocks src/api/sports.ts like MatchCentrePage.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import MatchCentrePage from "./MatchCentrePage";
import { MATCH_ALREADY_STARTED_CODE, SportsApiError, type MatchListItem } from "../../api/sports";
import { clearSession, seedSession } from "../../test/session";

vi.mock("../../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../../api/sports")>("../../api/sports");
  return {
    ...actual,
    getMatchById: vi.fn(),
    getMatchEvents: vi.fn(),
    setKickoffAlert: vi.fn(),
  };
});

import { getMatchById, getMatchEvents, setKickoffAlert } from "../../api/sports";

function team(id: string, name: string) {
  return { id, name, logo: null };
}

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: "m1",
    competition: "Premier League",
    league: { id: "39", name: "Premier League", season: "2026", round: "Matchday 5" },
    venue: "Anfield",
    kickoffTime: "2099-01-01T20:00:00.000Z",
    status: "scheduled",
    statusDetail: null,
    homeTeam: team("hp1", "Liverpool"),
    awayTeam: team("ap1", "Chelsea"),
    homeScore: null,
    awayScore: null,
    score: null,
    kickoffAlert: false,
    ...overrides,
  };
}

async function renderPage(m: MatchListItem) {
  vi.mocked(getMatchById).mockResolvedValue(m);
  render(
    <MemoryRouter initialEntries={["/sports-hub/matches/m1"]}>
      <Routes>
        <Route path="/sports-hub/matches/:matchId" element={<MatchCentrePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector(".mc-header")).not.toBeNull());
}

beforeEach(() => {
  vi.mocked(getMatchById).mockReset();
  vi.mocked(getMatchEvents).mockReset().mockResolvedValue({ items: [], updatedAt: null });
  vi.mocked(setKickoffAlert).mockReset();
  seedSession("tok-1");
});

afterEach(() => {
  cleanup();
  clearSession();
});

const OFF = /^alert me at kickoff$/i;

describe("Match Centre header kickoff alert", () => {
  it("a logged-out visitor sees no control", async () => {
    clearSession();
    await renderPage(match());
    expect(document.querySelector(".ka")).toBeNull();
    expect(screen.queryByRole("button", { name: /alert|saving|match started/i })).toBeNull();
  });

  it("is labelled, sits in the header, and starts Off", async () => {
    await renderPage(match());
    const button = screen.getByRole("button", { name: OFF });
    expect(button.closest(".mc-header")).not.toBeNull();
    expect(button.className).toContain("ka--labelled");
    expect(button.textContent).toBe("Alert me at kickoff");
  });

  it("starts On when the server says the caller already has the alert (survives a refresh)", async () => {
    await renderPage(match({ kickoffAlert: true }));
    expect(screen.getByRole("button", { name: /^alert on$/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Off to On shows Saving… and then Alert on; On to Off goes back", async () => {
    await renderPage(match());
    let resolve!: (v: boolean) => void;
    vi.mocked(setKickoffAlert).mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    fireEvent.click(screen.getByRole("button", { name: OFF }));
    const saving = await screen.findByRole("button", { name: /^saving…$/i });
    expect(saving.textContent).toBe("Saving…");
    expect(setKickoffAlert).toHaveBeenCalledWith("m1", true);
    await act(async () => resolve(true));
    const on = await screen.findByRole("button", { name: /^alert on$/i });

    vi.mocked(setKickoffAlert).mockResolvedValue(false);
    fireEvent.click(on);
    await screen.findByRole("button", { name: OFF });
    expect(setKickoffAlert).toHaveBeenLastCalledWith("m1", false);
  });

  it("a failed save shows Try again and the line; retrying repeats the same change", async () => {
    await renderPage(match());
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: OFF }));
    const retry = await screen.findByRole("button", { name: /^try again$/i });
    expect(screen.getByRole("alert").textContent).toBe("Couldn’t update the alert. Try again.");
    vi.mocked(setKickoffAlert).mockResolvedValueOnce(true);
    fireEvent.click(retry);
    await screen.findByRole("button", { name: /^alert on$/i });
    expect(setKickoffAlert).toHaveBeenNthCalledWith(2, "m1", true);
  });

  it("a 409 match_already_started shows the disabled Match started", async () => {
    await renderPage(match());
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(
      new SportsApiError("started", { status: 409, code: MATCH_ALREADY_STARTED_CODE }),
    );
    fireEvent.click(screen.getByRole("button", { name: OFF }));
    const started = (await screen.findByRole("button", { name: /^match started$/i })) as HTMLButtonElement;
    expect(started.disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["live", { status: "live" as const, statusDetail: "12'" }],
    ["finished", { status: "finished" as const }],
    ["kickoff passed", { kickoffTime: "2000-01-01T20:00:00.000Z" }],
  ])("a %s match shows Match started disabled and never calls the API", async (_l, overrides) => {
    await renderPage(match(overrides));
    const started = screen.getByRole("button", { name: /^match started$/i }) as HTMLButtonElement;
    expect(started.disabled).toBe(true);
    fireEvent.click(started);
    expect(setKickoffAlert).not.toHaveBeenCalled();
  });

  it("signing in after the page opened reads the match again and then shows the control", async () => {
    clearSession();
    await renderPage(match());
    expect(getMatchById).toHaveBeenCalledTimes(1);
    act(() => seedSession("tok-late"));
    await waitFor(() => expect(getMatchById).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: OFF });
  });
});
