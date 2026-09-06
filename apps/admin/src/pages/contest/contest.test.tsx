import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/contest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/contest")>();
  return {
    ...actual,
    getCurrentContest: vi.fn(),
    getContestCycle: vi.fn(),
    listContestCycles: vi.fn(),
    createContestCycle: vi.fn(),
    judgeContestRound: vi.fn(),
    openContestFinal: vi.fn(),
    crownContestCycle: vi.fn(),
  };
});

import {
  getCurrentContest,
  getContestCycle,
  createContestCycle,
  judgeContestRound,
  crownContestCycle,
  type AdminContestRoundDetail,
  type AdminCurrentContest,
  type ContestPhase,
} from "../../api/contest";
import ContestConsolePage from "./ContestConsolePage";
import ContestStartCyclePage from "./ContestStartCyclePage";
import ContestJudgeWeekPage from "./ContestJudgeWeekPage";
import ContestCrownWinnersPage from "./ContestCrownWinnersPage";
import ContestCycleDetailPage from "./ContestCycleDetailPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(getContestCycle).mockReset();
  vi.mocked(createContestCycle).mockReset();
  vi.mocked(judgeContestRound).mockReset();
  vi.mocked(crownContestCycle).mockReset();
});

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(ui: ReactNode, routePath: string, initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---- fixtures --------------------------------------------------------

function round(
  weekNumber: number,
  status: "open" | "judged",
  entryCount = 0,
): AdminContestRoundDetail {
  return {
    id: `r${weekNumber}`,
    weekNumber,
    status,
    opensAt: `2026-09-0${weekNumber}T00:00:00.000Z`,
    closesAt: `2026-09-1${weekNumber}T00:00:00.000Z`,
    judgedAt: status === "judged" ? "2026-09-08T10:04:00.000Z" : null,
    entryCount,
    entries: [],
  };
}

function current(phase: ContestPhase, judged: number): AdminCurrentContest {
  return {
    cycle: {
      id: "c1",
      title: "September 2026 Contest",
      status: phase === "crowned" ? "completed" : phase === "final_live" ? "final" : "active",
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-11-30T00:00:00.000Z",
      finalOpenedAt:
        phase === "final_live" || phase === "crowned" ? "2026-09-25T09:00:00.000Z" : null,
      crownedAt: phase === "crowned" ? "2026-09-30T18:00:00.000Z" : null,
    },
    phase,
    rounds: [
      round(1, judged >= 1 ? "judged" : "open"),
      round(2, judged >= 2 ? "judged" : "open"),
      round(3, judged >= 3 ? "judged" : "open"),
    ],
    weeklyWinners:
      judged >= 1
        ? [
            { weekNumber: 1, position: 1, userId: "u-ada", displayName: "Ada B.", entryId: "e1", postId: "p1" },
            { weekNumber: 1, position: 2, userId: "u-ben", displayName: "Ben C.", entryId: "e2", postId: "p2" },
          ]
        : [],
    monthlyStandings:
      phase === "crowned" ? [{ position: 1, userId: "u-ada", displayName: "Ada B." }] : [],
  };
}

// ---- Contest Console hub -------------------------------------------

describe("ContestConsolePage — phase branches", () => {
  it("no cycle: shows 'No cycle running' and a Start a cycle link", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue({
      cycle: null,
      phase: null,
      rounds: [],
      weeklyWinners: [],
      monthlyStandings: [],
    });
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText("No cycle running");
    expect(screen.getByRole("link", { name: "Start a cycle" }).getAttribute("href")).toBe(
      "/contest/cycles/new",
    );
  });

  it("vacant: primary action is 'Judge week 1'", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current("vacant", 0));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByRole("button", { name: "Judge week 1" });
  });

  it("weeks_1_2 (2 judged): primary action is 'Judge week 3'", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current("weeks_1_2", 2));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByRole("button", { name: "Judge week 3" });
  });

  it("weeks_1_3: primary action is 'Open the final'", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current("weeks_1_3", 3));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByRole("button", { name: "Open the final" });
  });

  it("final_live: primary action is 'Crown winners' and routes there", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current("final_live", 3));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    const btn = await screen.findByRole("button", { name: "Crown winners" });
    fireEvent.click(btn);
    expect(screen.getByTestId("loc").textContent).toBe("/contest/cycles/c1/crown");
  });

  it("crowned: primary action is 'Start a new cycle', monthly standings rendered", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current("crowned", 3));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByRole("button", { name: "Start a new cycle" });
    expect(screen.getAllByText("Ada B.").length).toBeGreaterThan(0);
  });
});

// ---- Start a Cycle ------------------------------------------------

describe("ContestStartCyclePage", () => {
  it("submits title + dates with rounds omitted (auto), then navigates to the hub", async () => {
    vi.mocked(createContestCycle).mockResolvedValue({} as never);
    renderAt(<ContestStartCyclePage />, "/contest/cycles/new", "/contest/cycles/new");

    fireEvent.change(screen.getByPlaceholderText(/September 2026 Contest/i), {
      target: { value: "October 2026 Contest" },
    });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-10-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-10-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));

    await waitFor(() => expect(createContestCycle).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(createContestCycle).mock.calls[0][0];
    expect(arg.title).toBe("October 2026 Contest");
    expect(arg.startsAt).toBe(new Date("2026-10-01").toISOString());
    expect(arg.rounds).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/contest"));
  });

  it("renders the real 409 message as a blocked state with a forward action", async () => {
    vi.mocked(createContestCycle).mockRejectedValue(
      new AdminApiError(
        409,
        "A contest cycle is already running; crown it before starting another",
      ),
    );
    renderAt(<ContestStartCyclePage />, "/contest/cycles/new", "/contest/cycles/new");

    fireEvent.change(screen.getByPlaceholderText(/September 2026 Contest/i), {
      target: { value: "Dupe" },
    });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-10-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-10-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Start cycle" }));

    await screen.findByText(/already running; crown it before starting another/i);
    expect(screen.getByRole("link", { name: "Go to Contest Console" }).getAttribute("href")).toBe(
      "/contest",
    );
  });
});

// ---- Judge Week -------------------------------------------------

function cycleWithOpenWeek(entries: number): AdminCurrentContest {
  const base = current("weeks_1_2", 2);
  const w3 = round(3, "open", entries);
  w3.entries = Array.from({ length: entries }, (_, i) => ({
    entryId: `w3e${i}`,
    submittedAt: "2026-09-17T09:12:00.000Z",
    entrant: { userId: `u${i}`, displayName: `Player ${i}` },
    post: {
      id: `pw3${i}`,
      contentText: `entry ${i}`,
      mediaUrls: i === 0 ? ["https://cdn/x.mp4"] : [],
      createdAt: "2026-09-17T09:10:00.000Z",
      likeCount: i,
      commentCount: 0,
    },
    position: null,
  }));
  return { ...base, rounds: [base.rounds[0], base.rounds[1], w3] };
}

describe("ContestJudgeWeekPage", () => {
  it("open round: assigns a position and submits winners[]", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(cycleWithOpenWeek(2) as never);
    vi.mocked(judgeContestRound).mockResolvedValue({} as never);
    renderAt(
      <ContestJudgeWeekPage />,
      "/contest/cycles/:id/rounds/:week",
      "/contest/cycles/c1/rounds/3",
    );

    const group = await screen.findByRole("group", { name: "Position for Player 0" });
    fireEvent.click(within(group).getByRole("button", { name: "1st" }));
    fireEvent.click(screen.getByRole("button", { name: "Save week 3 results" }));

    await waitFor(() =>
      expect(judgeContestRound).toHaveBeenCalledWith("c1", 3, [{ entryId: "w3e0", position: 1 }]),
    );
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/contest"));
  });

  it("thin week: 0 entries still closes the round with winners: []", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(cycleWithOpenWeek(0) as never);
    vi.mocked(judgeContestRound).mockResolvedValue({} as never);
    renderAt(
      <ContestJudgeWeekPage />,
      "/contest/cycles/:id/rounds/:week",
      "/contest/cycles/c1/rounds/3",
    );
    const btn = await screen.findByRole("button", { name: "Close week 3 with no winners" });
    fireEvent.click(btn);
    await waitFor(() => expect(judgeContestRound).toHaveBeenCalledWith("c1", 3, []));
  });

  it("out of sequence: an earlier unjudged week blocks judging", async () => {
    const c = current("vacant", 0);
    c.rounds[2] = round(3, "open", 1);
    vi.mocked(getContestCycle).mockResolvedValue(c as never);
    renderAt(
      <ContestJudgeWeekPage />,
      "/contest/cycles/:id/rounds/:week",
      "/contest/cycles/c1/rounds/3",
    );
    await screen.findByText(/Week 1 must be judged before week 3/i);
    expect(screen.queryByRole("button", { name: "Save week 3 results" })).toBeNull();
  });

  it("already judged: renders read-only with the recorded positions", async () => {
    const c = current("weeks_1_3", 3);
    const w1 = round(1, "judged", 1);
    w1.entries = [
      {
        entryId: "j1",
        submittedAt: "2026-09-03T09:12:00.000Z",
        entrant: { userId: "u-ada", displayName: "Ada B." },
        post: {
          id: "p",
          contentText: "x",
          mediaUrls: [],
          createdAt: "2026-09-03T09:10:00.000Z",
          likeCount: 1,
          commentCount: 0,
        },
        position: 1,
      },
    ];
    c.rounds = [w1, round(2, "judged"), round(3, "judged")];
    vi.mocked(getContestCycle).mockResolvedValue(c as never);
    renderAt(
      <ContestJudgeWeekPage />,
      "/contest/cycles/:id/rounds/:week",
      "/contest/cycles/c1/rounds/1",
    );
    await screen.findByText("Ada B.");
    expect(screen.getByText("1st")).not.toBeNull();
    expect(screen.queryByRole("group", { name: /Position for/ })).toBeNull();
  });
});

// ---- Crown Winners --------------------------------------------

describe("ContestCrownWinnersPage", () => {
  it("deduplicates the finalist pool by userId and submits standings", async () => {
    const c = current("final_live", 3);
    c.weeklyWinners = [
      { weekNumber: 1, position: 1, userId: "u-ada", displayName: "Ada B.", entryId: "e1", postId: "p1" },
      { weekNumber: 2, position: 2, userId: "u-ada", displayName: "Ada B.", entryId: "e2", postId: "p2" },
      { weekNumber: 3, position: 1, userId: "u-ada", displayName: "Ada B.", entryId: "e3", postId: "p3" },
      { weekNumber: 1, position: 2, userId: "u-ben", displayName: "Ben C.", entryId: "e4", postId: "p4" },
    ];
    vi.mocked(getContestCycle).mockResolvedValue(c as never);
    vi.mocked(crownContestCycle).mockResolvedValue({} as never);
    renderAt(<ContestCrownWinnersPage />, "/contest/cycles/:id/crown", "/contest/cycles/c1/crown");

    await screen.findByText("Ada B.");
    const groups = await screen.findAllByRole("group");
    expect(groups.length).toBe(2); // 4 weekly placings → 2 finalists
    expect(screen.getByText("Week 1 · 1st · Week 2 · 2nd · Week 3 · 1st")).not.toBeNull();

    const crownBtn = screen.getByRole("button", { name: "Crown and close the cycle" });
    expect(crownBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(groups[0]).getByRole("button", { name: "1st" }));
    fireEvent.click(screen.getByRole("button", { name: "Crown and close the cycle" }));
    await waitFor(() =>
      expect(crownContestCycle).toHaveBeenCalledWith("c1", [{ userId: "u-ada", position: 1 }]),
    );
  });
});

// ---- 404 -----------------------------------------------------

describe("ContestCycleDetailPage", () => {
  it("renders a not-found state on a 404", async () => {
    vi.mocked(getContestCycle).mockRejectedValue(new AdminApiError(404, "Contest cycle not found"));
    renderAt(<ContestCycleDetailPage />, "/contest/cycles/:id", "/contest/cycles/missing");
    await screen.findByText("Cycle not found");
  });
});
