// B-070 -- the kickoff-alert bell on the Sports Hub match cards (Figma C1 / C2).
// Mocks src/api/sports.ts like SportsHubPage.test.tsx. The credential change itself is pinned in
// api/sports.kickoffAlert.test.ts; here the mocked reads are asserted to be called when the
// session changes, and every control state is driven.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SportsHubPage from "./SportsHubPage";
import { MATCH_ALREADY_STARTED_CODE, SportsApiError, type MatchListItem } from "../api/sports";
import { clearSession, seedSession } from "../test/session";

vi.mock("../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../api/sports")>("../api/sports");
  return { ...actual, listLiveScores: vi.fn(), listFixtures: vi.fn(), setKickoffAlert: vi.fn() };
});

import { listLiveScores, setKickoffAlert } from "../api/sports";

const FUTURE = "2099-01-01T20:00:00.000Z";
const PAST = "2000-01-01T20:00:00.000Z";

function team(id: string, name: string) {
  return { id, name, logo: null };
}

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: "m1",
    competition: "Premier League",
    league: { id: "39", name: "Premier League", season: "2026", round: "Matchday 5" },
    venue: "Anfield",
    kickoffTime: FUTURE,
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderPage(items: MatchListItem[]) {
  vi.mocked(listLiveScores).mockResolvedValue({ items, nextCursor: null });
  render(
    <MemoryRouter>
      <SportsHubPage />
    </MemoryRouter>,
  );
  await screen.findAllByText("Liverpool");
}

const OFF = /^alert me at kickoff$/i;

beforeEach(() => {
  vi.mocked(listLiveScores).mockReset();
  vi.mocked(setKickoffAlert).mockReset();
  seedSession("tok-1");
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("who sees the control", () => {
  it("a logged-out visitor sees no kickoff-alert control at all", async () => {
    clearSession();
    await renderPage([match(), match({ id: "m2", kickoffAlert: true })]);
    expect(screen.queryByRole("button", { name: /alert|saving|try again|match started/i })).toBeNull();
    expect(document.querySelector(".ka")).toBeNull();
    // The list itself is unchanged.
    expect(screen.getAllByRole("link", { name: /Liverpool/ })).toHaveLength(2);
  });

  it("a signed-in person gets one control per match card", async () => {
    await renderPage([match(), match({ id: "m2" })]);
    expect(screen.getAllByRole("button", { name: OFF })).toHaveLength(2);
  });

  it("the control is a sibling of the card link, never inside it, and a click does not navigate", async () => {
    await renderPage([match()]);
    const button = screen.getByRole("button", { name: OFF });
    expect(button.closest("a")).toBeNull();
    vi.mocked(setKickoffAlert).mockResolvedValue(true);
    fireEvent.click(button);
    await screen.findByRole("button", { name: /^alert on$/i });
  });

  it("signing in after the page opened reads the list again with the credentials", async () => {
    clearSession();
    await renderPage([match()]);
    expect(listLiveScores).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: OFF })).toBeNull();
    act(() => seedSession("tok-late"));
    await waitFor(() => expect(listLiveScores).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: OFF });
  });
});

describe("off, loading, on", () => {
  it("shows Off for a match with no alert and On for one that has it (the state survives a refresh)", async () => {
    await renderPage([match({ id: "m1" }), match({ id: "m2", kickoffAlert: true, homeTeam: team("h2", "Arsenal") })]);
    const off = screen.getByRole("button", { name: OFF });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    const on = screen.getByRole("button", { name: /^alert on$/i });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.className).toContain("ka--on");
  });

  it("Off to On: PUT, a Saving state while it runs, then On", async () => {
    await renderPage([match()]);
    const d = deferred<boolean>();
    vi.mocked(setKickoffAlert).mockReturnValue(d.promise);
    fireEvent.click(screen.getByRole("button", { name: OFF }));

    const saving = await screen.findByRole("button", { name: /^saving…$/i });
    expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(saving.getAttribute("aria-disabled")).toBe("true");
    expect(saving.querySelector(".ka__glyph--spin")).not.toBeNull();
    expect(setKickoffAlert).toHaveBeenCalledWith("m1", true);

    // A second click while saving does nothing.
    fireEvent.click(saving);
    expect(setKickoffAlert).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve(true));
    const on = await screen.findByRole("button", { name: /^alert on$/i });
    expect(on.getAttribute("aria-pressed")).toBe("true");
  });

  it("On to Off: DELETE, then Off again", async () => {
    await renderPage([match({ kickoffAlert: true })]);
    vi.mocked(setKickoffAlert).mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: /^alert on$/i }));
    expect(setKickoffAlert).toHaveBeenCalledWith("m1", false);
    await screen.findByRole("button", { name: OFF });
  });
});

describe("error", () => {
  it("a failed save shows Try again and the line; the next click repeats the SAME change", async () => {
    await renderPage([match()]);
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: OFF }));

    const retry = await screen.findByRole("button", { name: /^try again$/i });
    expect(retry.className).toContain("ka--error");
    expect(screen.getByRole("alert").textContent).toBe("Couldn’t update the alert. Try again.");

    vi.mocked(setKickoffAlert).mockResolvedValueOnce(true);
    fireEvent.click(retry);
    await screen.findByRole("button", { name: /^alert on$/i });
    expect(setKickoffAlert).toHaveBeenNthCalledWith(2, "m1", true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failure to turn an alert OFF retries the OFF, not an ON", async () => {
    await renderPage([match({ kickoffAlert: true })]);
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(new SportsApiError("Couldn't reach the Soccernity server."));
    fireEvent.click(screen.getByRole("button", { name: /^alert on$/i }));
    const retry = await screen.findByRole("button", { name: /^try again$/i });
    vi.mocked(setKickoffAlert).mockResolvedValueOnce(false);
    fireEvent.click(retry);
    await screen.findByRole("button", { name: OFF });
    expect(setKickoffAlert).toHaveBeenNthCalledWith(2, "m1", false);
  });

  it("a rejected save leaves the other cards alone", async () => {
    await renderPage([match({ id: "m1" }), match({ id: "m2", homeTeam: team("h2", "Arsenal") })]);
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(new SportsApiError("boom", { status: 500 }));
    fireEvent.click(screen.getAllByRole("button", { name: OFF })[0]);
    await screen.findByRole("button", { name: /^try again$/i });
    expect(screen.getAllByRole("button", { name: OFF })).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("started", () => {
  it("a 409 match_already_started turns the control into a disabled Match started, with no error line", async () => {
    await renderPage([match()]);
    vi.mocked(setKickoffAlert).mockRejectedValueOnce(
      new SportsApiError("started", { status: 409, code: MATCH_ALREADY_STARTED_CODE }),
    );
    fireEvent.click(screen.getByRole("button", { name: OFF }));
    const started = await screen.findByRole("button", { name: /^match started$/i });
    expect((started as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(started);
    expect(setKickoffAlert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["live", { status: "live" as const, statusDetail: "12'" }],
    ["finished", { status: "finished" as const, homeScore: 2, awayScore: 1 }],
    ["a scheduled match whose kickoff has passed", { kickoffTime: PAST }],
  ])("%s shows Match started disabled and never calls the API", async (_label, overrides) => {
    await renderPage([match(overrides)]);
    const started = screen.getByRole("button", { name: /^match started$/i }) as HTMLButtonElement;
    expect(started.disabled).toBe(true);
    fireEvent.click(started);
    expect(setKickoffAlert).not.toHaveBeenCalled();
  });

  it("a live match that already had an alert still shows Match started (the alert has fired)", async () => {
    await renderPage([match({ status: "live", kickoffAlert: true })]);
    expect((screen.getByRole("button", { name: /^match started$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a postponed match with a future kickoff is still offered the control", async () => {
    await renderPage([match({ status: "postponed" })]);
    expect(screen.getByRole("button", { name: OFF })).toBeTruthy();
  });
});
