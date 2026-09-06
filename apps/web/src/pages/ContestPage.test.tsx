// Follows LeaderboardPage.test.tsx / CommunityPage.test.tsx -- plain DOM
// assertions, mocks src/api/contest.ts, session seeded into sessionStorage.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ContestPage from "./ContestPage";
import type { CurrentContestResponse } from "../api/contest";

vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return { ...actual, getCurrentContest: vi.fn() };
});

import { getCurrentContest } from "../api/contest";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function response(overrides: Partial<CurrentContestResponse> = {}): CurrentContestResponse {
  return {
    cycle: {
      id: "cycle-1",
      title: "September Contest",
      status: "active",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      finalOpenedAt: null,
      crownedAt: null,
    },
    phase: "week_1",
    isAcceptingEntries: true,
    activeRound: {
      id: "round-2",
      weekNumber: 2,
      status: "open",
      opensAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      judgedAt: null,
    },
    rounds: [],
    weeklyWinners: [{ weekNumber: 1, position: 1, userId: "u1", displayName: "Emeka John", entryId: "e1", postId: "p1" }],
    monthlyStandings: [],
    callerEntry: null,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getCurrentContest).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/contest"]}>
      <ContestPage />
    </MemoryRouter>,
  );
}

describe("ContestPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to see this month.s contest/i)).not.toBeNull();
    expect(getCurrentContest).not.toHaveBeenCalled();
  });

  it("renders the current cycle, the week's task and an 'enter' CTA while entries are open", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(response());

    renderPage();

    expect(await screen.findByText("September Contest")).not.toBeNull();
    expect(screen.getByText(/week 2 is live/i)).not.toBeNull();
    expect(screen.getByText(/how contest works/i)).not.toBeNull();
    const cta = screen.getByRole("link", { name: /enter this week.s contest/i });
    expect(cta.getAttribute("href")).toBe("/community?compose=contest");
    // A judged weekly winner shows up.
    expect(screen.getByText("Emeka John")).not.toBeNull();
  });

  it("shows the caller's own entry status instead of the CTA once they've entered", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(
      response({ callerEntry: { roundId: "round-2", weekNumber: 2, postId: "p9" } }),
    );

    renderPage();

    expect(await screen.findByText(/your entry for week 2 is in/i)).not.toBeNull();
    expect(screen.queryByRole("link", { name: /enter this week.s contest/i })).toBeNull();
  });

  it("shows the monthly winners when the cycle is crowned", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(
      response({
        phase: "crowned",
        isAcceptingEntries: false,
        activeRound: null,
        monthlyStandings: [
          { position: 1, userId: "u1", displayName: "Emeka John" },
          { position: 2, userId: "u2", displayName: "Chukwu James" },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText(/this month.s winners are decided/i)).not.toBeNull();
    expect(screen.getByText("Monthly winners")).not.toBeNull();
    expect(screen.getByText("Chukwu James")).not.toBeNull();
  });

  describe("Contest rules modal (Decision Log #227)", () => {
    async function renderLoaded() {
      window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
      vi.mocked(getCurrentContest).mockResolvedValueOnce(response());
      renderPage();
      await screen.findByText("September Contest");
    }

    it("is closed until the 'Contest rules ›' link is clicked", async () => {
      await renderLoaded();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /contest rules/i }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toBeNull();
      expect(screen.getByRole("heading", { name: "Contest rules" })).not.toBeNull();
    });

    it("shows the visible 'founder to supply' placeholder marking, not real rules copy", async () => {
      await renderLoaded();
      fireEvent.click(screen.getByRole("button", { name: /contest rules/i }));
      expect(
        screen.getByText(/founder to supply final Contest Rules copy before this ships/i),
      ).not.toBeNull();
      expect(screen.getByText(/no legal-counsel review track for this content/i)).not.toBeNull();
    });

    it("closes on the × button, the overlay, and Escape", async () => {
      await renderLoaded();
      const open = () => fireEvent.click(screen.getByRole("button", { name: /contest rules/i }));

      open();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      open();
      fireEvent.click(screen.getByTestId("contest-rules-overlay"));
      expect(screen.queryByRole("dialog")).toBeNull();

      open();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
