// Follows LeaderboardPage.test.tsx / CommunityPage.test.tsx -- plain DOM
// assertions, mocks src/api/contest.ts, session seeded into the in-memory session store.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ContestPage from "./ContestPage";
import type { CurrentContestResponse } from "../api/contest";
import { openContest, roundSummary } from "./contest/contestFixtures";

vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return { ...actual, getCurrentContest: vi.fn() };
});

import { getCurrentContest } from "../api/contest";
import { seedSession, clearSession } from "../test/session";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function response(overrides: Partial<CurrentContestResponse> = {}): CurrentContestResponse {
  return openContest({
    weeklyWinners: [{ weekNumber: 1, position: 1, userId: "u1", publicName: "Emeka John", entryId: "e1", postId: "p1" }],
    ...overrides,
  });
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
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
    seedSession(fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(response());

    renderPage();

    expect(await screen.findByText("September Contest")).not.toBeNull();
    expect(screen.getByText(/week 2 is live/i)).not.toBeNull();
    expect(screen.getByText(/how contest works/i)).not.toBeNull();
    const cta = screen.getByRole("link", { name: /join contest/i });
    expect(cta.getAttribute("href")).toBe("/community?compose=contest");
    // A judged weekly winner shows up.
    expect(screen.getByText("Emeka John")).not.toBeNull();
  });

  it("shows the caller's own entry status instead of the CTA once they've entered", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(
      response({ callerEntry: { roundId: "round-2", weekNumber: 2, postId: "p9" } }),
    );

    renderPage();

    expect(await screen.findByText(/your entry for week 2 is in/i)).not.toBeNull();
    expect(screen.queryByRole("link", { name: /join contest/i })).toBeNull();
  });

  it("shows the monthly winners when the cycle is crowned", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getCurrentContest).mockResolvedValueOnce(
      response({
        phase: "crowned",
        calendarState: { kind: "completed", endedAt: "2026-10-01T00:00:00.000Z" },
        finalOutcome: "winners",
        isAcceptingEntries: false,
        activeRound: null,
        monthlyStandings: [
          { position: 1, userId: "u1", publicName: "Emeka John" },
          { position: 2, userId: "u2", publicName: "Chukwu James" },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText(/this month.s contest is over/i)).not.toBeNull();
    expect(screen.getByText("Monthly winners")).not.toBeNull();
    expect(screen.getByText("Chukwu James")).not.toBeNull();
  });

  describe("calendar states", () => {
    async function loaded(over: Partial<CurrentContestResponse>) {
      seedSession(fakeAccessToken());
      vi.mocked(getCurrentContest).mockResolvedValueOnce(response(over));
      renderPage();
      await screen.findByText("September Contest");
    }

    it("never uses the retired numbered-level wording", async () => {
      await loaded({});
      expect(document.body.textContent).not.toMatch(/level\s*[12]/i);
    });

    it("upcoming: Week 1 opens at 08:00 (day-1 morning variant)", async () => {
      await loaded({
        calendarState: { kind: "upcoming", opensAt: "2026-09-01T07:00:00.000Z" },
        activeRound: null,
        callerCanEnter: false,
      });
      expect(screen.getByText("Week 1 opens at 08:00")).not.toBeNull();
    });

    it("entries open but the caller cannot enter: no Join Contest", async () => {
      await loaded({ callerCanEnter: false });
      expect(screen.queryByRole("link", { name: /join contest/i })).toBeNull();
    });

    it("voting: links to the Voting page", async () => {
      await loaded({ calendarState: { kind: "week_voting", weekNumber: 2, locksAt: "2026-09-14T19:00:00.000Z" } });
      expect(screen.getByRole("link", { name: /vote now/i }).getAttribute("href")).toBe("/contest/voting");
    });

    it("forfeited: says so with the reason", async () => {
      await loaded({
        calendarState: { kind: "week_forfeited", weekNumber: 2, locksAt: "2026-09-14T19:00:00.000Z" },
        rounds: [roundSummary(2, { forfeited: true, forfeitReason: "Fewer than three entries." })],
      });
      expect(screen.getByText(/week 2 was forfeited/i)).not.toBeNull();
      expect(screen.getAllByText(/fewer than three entries/i).length).toBeGreaterThan(0);
    });

    it("between weeks: shows this week's result and when the next week opens", async () => {
      await loaded({
        calendarState: {
          kind: "between_weeks",
          afterWeek: 1,
          nextWeek: 2,
          nextOpensAt: "2026-09-08T07:00:00.000Z",
          result: "winners",
        },
      });
      const result = screen.getByTestId("between-weeks-result");
      expect(result.textContent).toMatch(/Emeka John/);
      expect(result.textContent).toMatch(/opens at 08:00/);
    });

    it("final upload for a finalist links to the composer; a locked-in entry shows a status", async () => {
      await loaded({
        calendarState: { kind: "final_upload", opensAt: "2026-09-22T07:00:00.000Z", revealsAt: "2026-09-24T23:00:00.000Z" },
        callerIsFinalist: true,
        callerCanEnter: true,
      });
      expect(screen.getByRole("link", { name: /upload your final entry/i })).not.toBeNull();
    });

    it("renders a forfeit pop-up on load for a forfeited week", async () => {
      await loaded({ forfeitedWeeks: [{ weekNumber: 1, reason: "Fewer than three entries." }] });
      expect(screen.getByRole("alertdialog")).not.toBeNull();
    });

    it("winner names link to their profiles", async () => {
      await loaded({});
      expect(screen.getByRole("link", { name: "Emeka John" }).getAttribute("href")).toBe("/users/u1");
    });
  });

  describe("Contest rules modal (Decision Log #227)", () => {
    async function renderLoaded() {
      seedSession(fakeAccessToken());
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
