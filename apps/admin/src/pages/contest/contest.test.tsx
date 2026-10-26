import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    updateContestCycle: vi.fn(),
  };
});

import {
  getCurrentContest,
  getContestCycle,
  listContestCycles,
  createContestCycle,
  updateContestCycle,
  type AdminContestCycleDetail,
  type AdminContestEditability,
  type AdminContestRoundDetail,
  type AdminCurrentContest,
} from "../../api/contest";
import ContestConsolePage from "./ContestConsolePage";
import ContestFormPage from "./ContestFormPage";
import ContestHistoryPage from "./ContestHistoryPage";
import ContestImpressionsPage from "./ContestImpressionsPage";
import ContestCycleDetailPage from "./ContestCycleDetailPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(getContestCycle).mockReset();
  vi.mocked(listContestCycles).mockReset();
  vi.mocked(createContestCycle).mockReset();
  vi.mocked(updateContestCycle).mockReset();
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

function round(weekNumber: number, over: Partial<AdminContestRoundDetail> = {}): AdminContestRoundDetail {
  return {
    id: `r${weekNumber}`,
    weekNumber,
    status: "open",
    opensAt: `2026-11-0${weekNumber}T08:00:00.000Z`,
    closesAt: `2026-11-1${weekNumber}T20:00:00.000Z`,
    judgedAt: null,
    task: weekNumber < 4 ? `Task for week ${weekNumber}` : "Final task text",
    entriesCloseAt: `2026-11-0${weekNumber}T23:59:00.000Z`,
    votesLockAt: `2026-11-0${weekNumber}T20:00:00.000Z`,
    viewWatchLimitSeconds: weekNumber < 4 ? 10 : null,
    forfeited: false,
    forfeitReason: null,
    entryCount: 0,
    entries: [],
    ...over,
  };
}

const allLocked: AdminContestEditability = {
  beforeLaunch: false,
  title: false,
  description: true,
  minimumTally: false,
  placementPoints: false,
  followersExcludedWeek4: true,
  exposureTolerancePercent: true,
  exposureViewerDailyCap: true,
  taskByWeek: { 1: false, 2: true, 3: true, 4: true },
  watchLimitByWeek: { 1: false, 2: true, 3: true },
};

const allOpen: AdminContestEditability = {
  beforeLaunch: true,
  title: true,
  description: true,
  minimumTally: true,
  placementPoints: true,
  followersExcludedWeek4: true,
  exposureTolerancePercent: true,
  exposureViewerDailyCap: true,
  taskByWeek: { 1: true, 2: true, 3: true, 4: true },
  watchLimitByWeek: { 1: true, 2: true, 3: true },
};

function detail(over: Partial<AdminContestCycleDetail> = {}): AdminContestCycleDetail {
  return {
    cycle: {
      id: "c1",
      title: "November Challenge",
      description: "Show your skills",
      monthKey: "2026-11",
      status: "active",
      startsAt: "2026-11-01T08:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z",
      finalOpenedAt: null,
      crownedAt: null,
    },
    settings: {
      minimumTally: 40,
      weeklyPoints: [500, 300, 150],
      monthlyPoints: [2000, 1200, 600],
      followersExcludedWeek4: false,
      exposureTolerancePercent: 10,
      exposureViewerDailyCap: 3,
    },
    editable: allOpen,
    phase: "vacant",
    calendarState: { kind: "week_entries", weekNumber: 1, entriesCloseAt: "2026-11-05T00:00:00.000Z" },
    rounds: [round(1), round(2), round(3), round(4)],
    weeklyWinners: [],
    finalists: [],
    forfeitedWeeks: [],
    finalRanking: null,
    monthlyStandings: [],
    finalOutcome: "pending",
    ...over,
  };
}

function current(over: Partial<AdminContestCycleDetail> = {}): AdminCurrentContest {
  return detail(over) as AdminCurrentContest;
}

// ---- Contest console: read-only status -----------------------------------

describe("ContestConsolePage — read-only status", () => {
  it("no cycle: says so and offers Create a contest", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue({
      cycle: null,
      settings: null,
      editable: null,
      phase: null,
      calendarState: null,
      rounds: [],
      weeklyWinners: [],
      finalists: [],
      forfeitedWeeks: [],
      finalRanking: null,
      monthlyStandings: [],
      finalOutcome: null,
    });
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText("No contest yet");
    expect(screen.getAllByRole("link", { name: "Create a contest" })[0].getAttribute("href")).toBe("/contest/cycles/new");
  });

  it("running: shows the calendar position and admin-only settings, with NO judge / open-final / crown control", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current());
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText("Week 1 · Phase 1 · entries");
    expect(screen.getByText("40 points")).toBeTruthy();
    expect(screen.getByText("500 / 300 / 150")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /judge/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /crown/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open the final/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Edit contest" }).getAttribute("href")).toBe("/contest/cycles/c1/edit");
  });

  it("a forfeited week is shown as status with its reason", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(
      current({
        rounds: [
          round(1, { forfeited: true, forfeitReason: "Fewer than three entries", status: "judged" }),
          round(2),
          round(3),
          round(4),
        ],
      }),
    );
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText("Fewer than three entries");
    expect(screen.getAllByText("Forfeited").length).toBeGreaterThan(0);
  });

  it("No winner this month is a read-only outcome", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(
      current({
        cycle: { ...detail().cycle, status: "completed", crownedAt: "2026-12-01T00:00:00.000Z" },
        calendarState: { kind: "completed", endedAt: "2026-12-01T00:00:00.000Z" },
        finalOutcome: "no_winner",
      }),
    );
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText("No winner this month");
  });

  it("expands a week's entries with the Phase 1 tally and rank", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(
      current({
        rounds: [
          round(1, {
            entryCount: 1,
            entries: [
              {
                entryId: "e1",
                kind: "weekly",
                submittedAt: "2026-11-02T10:00:00.000Z",
                entrant: { userId: "u1", publicName: "Ada B." },
                post: { id: "p1", contentText: "x", mediaUrls: [], createdAt: "2026-11-02T10:00:00.000Z", likeCount: 1, commentCount: 0 },
                qualified: true,
                phase1Tally: 7,
                phase1Rank: 1,
                voteCount: 0,
                finalTally: null,
                finalRank: null,
                position: null,
              },
            ],
          }),
          round(2),
          round(3),
          round(4),
        ],
      }),
    );
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    fireEvent.click(await screen.findByRole("button", { name: /Show 1/ }));
    expect(screen.getByText("Ada B.")).toBeTruthy();
    expect(screen.getByText("Tally 7")).toBeTruthy();
    expect(screen.getByText("Phase 1 rank 1")).toBeTruthy();
  });

  it("a failed load shows the error with a retry", async () => {
    vi.mocked(getCurrentContest).mockRejectedValueOnce(new Error("boom"));
    renderAt(<ContestConsolePage />, "/contest", "/contest");
    await screen.findByText(/boom/);
    vi.mocked(getCurrentContest).mockResolvedValueOnce(current());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Week 1 · Phase 1 · entries");
  });
});

// ---- Create ------------------------------------------------------------

function fillCreateForm(over: { tally?: string } = {}) {
  fireEvent.change(screen.getByPlaceholderText("e.g. November Challenge"), { target: { value: "December Challenge" } });
  if (over.tally !== "") {
    fireEvent.change(screen.getByPlaceholderText("Enter points"), { target: { value: over.tally ?? "50" } });
  }
  for (let i = 1; i <= 3; i += 1) {
    fireEvent.change(screen.getByLabelText(new RegExp("^Weekly task [(]week " + i + "[)]")), { target: { value: `Do trick ${i}` } });
    fireEvent.change(screen.getByLabelText(new RegExp(`View-qualifying watch limit, week ${i}`)), { target: { value: "10" } });
  }
}

describe("ContestFormPage — create", () => {
  it("is blocked until title, tally and every watch limit are set (the tally has no default)", () => {
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    const create = screen.getByRole("button", { name: "Create contest" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect((screen.getByPlaceholderText("Enter points") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Create is blocked until/)).toBeTruthy();
  });

  it("D-19: names every missing field next to the disabled Create button and shows the per-field errors without a submit", () => {
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    // Nothing changed yet: no red on a pristine form, but the reason is already there.
    expect(screen.queryByText("Write the week 1 task.")).toBeNull();
    const reason = screen.getByText(/Create is blocked until these are set:/);
    expect(reason.textContent).toMatch(/contest title/);
    expect(reason.textContent).toMatch(/minimum tally/);
    expect(reason.textContent).toMatch(/week 1 task/);
    expect(reason.textContent).toMatch(/week 3 watch limit/);

    // Fill exactly what the old hint listed (title, tally, watch limits): the tasks are still missing.
    fireEvent.change(screen.getByPlaceholderText("e.g. November Challenge"), { target: { value: "QA Month" } });
    fireEvent.change(screen.getByPlaceholderText("Enter points"), { target: { value: "3" } });
    for (let i = 1; i <= 3; i += 1) {
      fireEvent.change(screen.getByLabelText(new RegExp(`View-qualifying watch limit, week ${i}`)), { target: { value: "10" } });
    }
    expect((screen.getByRole("button", { name: "Create contest" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Write the week 1 task.")).toBeTruthy();
    expect(screen.getByText("Write the week 3 task.")).toBeTruthy();
    const after = screen.getByText(/Create is blocked until these are set:/).textContent ?? "";
    expect(after).toMatch(/week 1 task/);
    expect(after).not.toMatch(/contest title|minimum tally|watch limit/);
  });

  it("D-22: the followers-excluded helper text is separated from its label", () => {
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    const label = screen.getByText("Followers-excluded counting");
    const hint = screen.getByText(/Count only engagement from accounts that do not follow the finalist/);
    expect(label.parentElement?.textContent).toMatch(/Followers-excluded counting\s+Count only/);
    expect(hint.className).toMatch(/ct-switch__hint/);
  });

  it("prefills the confirmed placement points", () => {
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    expect((screen.getByLabelText("Weekly placement points, 1st") as HTMLInputElement).value).toBe("500");
    expect((screen.getByLabelText("Weekly placement points, 3rd") as HTMLInputElement).value).toBe("150");
    expect((screen.getByLabelText("Monthly placement points, 1st") as HTMLInputElement).value).toBe("2000");
    expect((screen.getByLabelText("Monthly placement points, 3rd") as HTMLInputElement).value).toBe("600");
  });

  it("stays blocked when a watch limit is outside 3-120 seconds", () => {
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    fillCreateForm();
    fireEvent.change(screen.getByLabelText(/View-qualifying watch limit, week 2/), { target: { value: "500" } });
    expect((screen.getByRole("button", { name: "Create contest" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the full contest and returns to the console", async () => {
    vi.mocked(createContestCycle).mockResolvedValue(detail());
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    fillCreateForm();
    fireEvent.click(screen.getByLabelText(/Followers-excluded counting/));
    const create = screen.getByRole("button", { name: "Create contest" }) as HTMLButtonElement;
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(createContestCycle).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createContestCycle).mock.calls[0][0];
    expect(body.title).toBe("December Challenge");
    expect(body.minimumTally).toBe(50);
    expect(body.weeks).toHaveLength(3);
    expect(body.weeks[0]).toEqual({ weekNumber: 1, task: "Do trick 1", viewWatchLimitSeconds: 10 });
    expect(body.placementPoints).toEqual({ weekly: [500, 300, 150], monthly: [2000, 1200, 600] });
    expect(body.followersExcludedWeek4).toBe(true);
    await screen.findByTestId("loc");
    expect(screen.getByTestId("loc").textContent).toBe("/contest");
  });

  it("shows the server's error and stays on the form", async () => {
    vi.mocked(createContestCycle).mockRejectedValue(new AdminApiError(409, "A contest already exists for that month."));
    renderAt(<ContestFormPage mode="create" />, "/contest/cycles/new", "/contest/cycles/new");
    fillCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Create contest" }));
    await screen.findByText("A contest already exists for that month.");
    expect(screen.queryByTestId("loc")).toBeNull();
  });
});

// ---- Edit --------------------------------------------------------------

describe("ContestFormPage — edit and locking", () => {
  it("before launch everything but the month is editable", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(detail());
    renderAt(<ContestFormPage mode="edit" />, "/contest/cycles/:id/edit", "/contest/cycles/c1/edit");
    await screen.findByDisplayValue("November Challenge");
    expect((screen.getByPlaceholderText("Enter points") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Contest month") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("ct-locked-note")).toBeNull();
  });

  it("after launch the locked fields are disabled and the note says so", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(detail({ editable: allLocked }));
    renderAt(<ContestFormPage mode="edit" />, "/contest/cycles/:id/edit", "/contest/cycles/c1/edit");
    await screen.findByDisplayValue("November Challenge");
    expect(screen.getByTestId("ct-locked-note")).toBeTruthy();
    expect((screen.getByPlaceholderText("Enter points") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Weekly placement points, 1st") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Weekly task (week 1)") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByLabelText("Weekly task (week 2)") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("sends only the fields that changed", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(detail({ editable: allLocked }));
    vi.mocked(updateContestCycle).mockResolvedValue(detail({ editable: allLocked }));
    renderAt(<ContestFormPage mode="edit" />, "/contest/cycles/:id/edit", "/contest/cycles/c1/edit");
    await screen.findByDisplayValue("November Challenge");
    fireEvent.change(screen.getByLabelText("Weekly task (week 2)"), { target: { value: "A new week 2 task" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateContestCycle).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateContestCycle).mock.calls[0]).toEqual([
      "c1",
      { weeks: [{ weekNumber: 2, task: "A new week 2 task" }] },
    ]);
    await screen.findByText("Saved.");
  });

  it("surfaces a 409 contest_field_locked from the server without changing the form", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(detail());
    vi.mocked(updateContestCycle).mockRejectedValue(new AdminApiError(409, "That field is locked now."));
    renderAt(<ContestFormPage mode="edit" />, "/contest/cycles/:id/edit", "/contest/cycles/c1/edit");
    await screen.findByDisplayValue("November Challenge");
    fireEvent.change(screen.getByPlaceholderText("Enter points"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("That field is locked now.");
    expect((screen.getByPlaceholderText("Enter points") as HTMLInputElement).value).toBe("99");
  });

  it("a 404 load shows an error, not a form", async () => {
    vi.mocked(getContestCycle).mockRejectedValue(new AdminApiError(404, "Contest not found"));
    renderAt(<ContestFormPage mode="edit" />, "/contest/cycles/:id/edit", "/contest/cycles/zzz/edit");
    await screen.findByText("Contest not found");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});

// ---- History, detail, impressions -----------------------------------------

describe("ContestHistoryPage", () => {
  it("lists contests newest first with entries per week and the outcome", async () => {
    vi.mocked(listContestCycles).mockResolvedValue({
      items: [
        {
          cycle: detail().cycle,
          settings: detail().settings,
          phase: "crowned",
          calendarState: { kind: "completed", endedAt: "2026-12-01T00:00:00.000Z" },
          rounds: [round(1, { entryCount: 12 }), round(2, { entryCount: 8 }), round(3, { entryCount: 5 }), round(4, { entryCount: 3 })],
          weeklyWinners: [],
          monthlyStandings: [{ position: 1, userId: "u1", publicName: "Ada B." }],
          finalOutcome: "winners",
        },
      ],
    });
    renderAt(<ContestHistoryPage />, "/contest/history", "/contest/history");
    await screen.findByText("November Challenge");
    expect(screen.getByText("12 · 8 · 5 · 3")).toBeTruthy();
    expect(screen.getByText("Won by Ada B.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View ›" }).getAttribute("href")).toBe("/contest/cycles/c1");
  });

  it("empty and error states", async () => {
    vi.mocked(listContestCycles).mockResolvedValueOnce({ items: [] });
    renderAt(<ContestHistoryPage />, "/contest/history", "/contest/history");
    await screen.findByText("No contests yet");
    cleanup();
    vi.mocked(listContestCycles).mockRejectedValueOnce(new Error("history down"));
    renderAt(<ContestHistoryPage />, "/contest/history", "/contest/history");
    await screen.findByText(/history down/);
  });
});

describe("ContestCycleDetailPage", () => {
  it("shows a past cycle read-only", async () => {
    vi.mocked(getContestCycle).mockResolvedValue(detail());
    renderAt(<ContestCycleDetailPage />, "/contest/cycles/:id", "/contest/cycles/c1");
    await screen.findAllByRole("heading", { name: "November Challenge" });
    expect(screen.queryByRole("button", { name: /judge|crown/i })).toBeNull();
  });

  it("a 404 renders an honest not-found state", async () => {
    vi.mocked(getContestCycle).mockRejectedValue(new AdminApiError(404, "nope"));
    renderAt(<ContestCycleDetailPage />, "/contest/cycles/:id", "/contest/cycles/zzz");
    await screen.findByText("Contest not found");
  });
});

describe("ContestImpressionsPage", () => {
  it("shows the stored exposure settings and says impression counts are not available yet", async () => {
    vi.mocked(getCurrentContest).mockResolvedValue(current());
    renderAt(<ContestImpressionsPage />, "/contest/impressions", "/contest/impressions");
    await screen.findByText("10%");
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByTestId("ct-impressions-pending")).toBeTruthy();
  });
});
