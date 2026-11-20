import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AdminApiError } from "../api/adminClient";

vi.mock("../api/adminDashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/adminDashboard")>();
  return {
    ...actual,
    getDashboardStats: vi.fn(),
    getLatestPosts: vi.fn(),
  };
});

import {
  getDashboardStats,
  getLatestPosts,
  type AdminDashboardStats,
  type AdminLatestPost,
} from "../api/adminDashboard";
import DashboardPage from "./DashboardPage";

const SIX_MONTHS: AdminDashboardStats["visitsByMonth"] = [
  { month: "2026-04", count: 10 },
  { month: "2026-05", count: 0 },
  { month: "2026-06", count: 40 },
  { month: "2026-07", count: 20 },
  { month: "2026-08", count: 80 },
  { month: "2026-09", count: 60 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getDashboardStats).mockReset();
  vi.mocked(getLatestPosts).mockReset();
  // Default: an empty list, so the stats tests never depend on the posts card.
  vi.mocked(getLatestPosts).mockResolvedValue([]);
});

describe("DashboardPage", () => {
  it("renders the real stats once loaded, including Total Visits", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 4,
      totalArticlesPublished: 12,
      communityUsersTotal: 250,
      totalVisits: 1234,
      visitsByMonth: SIX_MONTHS,
    });

    renderPage();

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("4")).not.toBeNull();
    expect(screen.getByText("12")).not.toBeNull();
    expect(screen.getByText("250")).not.toBeNull();
    expect(screen.getByText("1234")).not.toBeNull();
    for (const label of ["Total Visits", "Total Articles", "Community Users", "New This Month"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
  });

  it("shows a real 0 for Total Visits, not the placeholder dash", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 0,
      visitsByMonth: [],
    });

    renderPage();

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    const totalVisitsCard = (await screen.findByText("Total Visits")).closest(".admin-dashboard__stat");
    expect(totalVisitsCard).not.toBeNull();
    expect(totalVisitsCard!.querySelector(".admin-dashboard__stat-value")!.textContent).toBe("0");
  });

  it("renders the last six months as a bar chart with real labels and counts", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 210,
      visitsByMonth: SIX_MONTHS,
    });

    const { container } = renderPage();

    const chart = await screen.findByRole("img", { name: /page views by month/i });
    expect(chart.getAttribute("aria-label")).toBe(
      "Page views by month: Apr 10, May 0, Jun 40, Jul 20, Aug 80, Sep 60",
    );
    // One column per month, each with its real count label.
    expect(container.querySelectorAll(".admin-dashboard__chart-col")).toHaveLength(6);
    const counts = Array.from(container.querySelectorAll(".admin-dashboard__chart-count")).map(
      (el) => el.textContent,
    );
    expect(counts).toEqual(["10", "0", "40", "20", "80", "60"]);
    const axis = Array.from(container.querySelectorAll(".admin-dashboard__chart-axis span")).map(
      (el) => el.textContent,
    );
    expect(axis).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
  });

  it("scales bar heights proportionally to the largest month, and gives an all-zero series no NaN heights", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 210,
      visitsByMonth: SIX_MONTHS,
    });

    const { container } = renderPage();
    await screen.findByRole("img", { name: /page views by month/i });
    const heights = Array.from(container.querySelectorAll<HTMLElement>(".admin-dashboard__chart-bar")).map(
      (el) => el.style.height,
    );
    // max is 80 → 80 = 100%, 40 = 50%, 10 = 13% (rounded), 0 = 0%.
    expect(heights).toEqual(["13%", "0%", "50%", "25%", "100%", "75%"]);

    cleanup();
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 0,
      visitsByMonth: SIX_MONTHS.map((p) => ({ ...p, count: 0 })),
    });
    const zero = renderPage();
    await screen.findByRole("img", { name: /page views by month/i });
    const zeroHeights = Array.from(zero.container.querySelectorAll<HTMLElement>(".admin-dashboard__chart-bar")).map(
      (el) => el.style.height,
    );
    expect(zeroHeights.every((h) => h === "0%")).toBe(true);
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(getDashboardStats).mockRejectedValueOnce(new AdminApiError(500, "Server error"));
    vi.mocked(getDashboardStats).mockResolvedValueOnce({
      newUsersThisMonth: 1,
      totalArticlesPublished: 2,
      communityUsersTotal: 3,
      totalVisits: 5,
      visitsByMonth: SIX_MONTHS,
    });

    renderPage();

    expect(await screen.findByText("Server error")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1")).not.toBeNull();
  });

  it("draws the four stat tiles in the W8 order, New This Month from newUsersThisMonth", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 122,
      totalArticlesPublished: 1000,
      communityUsersTotal: 2521,
      totalVisits: 520000,
      visitsByMonth: [],
    });

    const { container } = renderPage();
    await screen.findByText("122");
    const tiles = Array.from(container.querySelectorAll(".admin-dashboard__stat")).map((el) => [
      el.querySelector(".admin-dashboard__stat-label")!.textContent,
      el.querySelector(".admin-dashboard__stat-value")!.textContent,
    ]);
    expect(tiles).toEqual([
      ["Total Visits", "520000"],
      ["Total Articles", "1000"],
      ["Community Users", "2521"],
      ["New This Month", "122"],
    ]);
  });

  it("no longer shows the league breakdown or any sample content", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 0,
      visitsByMonth: [],
    });

    renderPage();

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/new users by league/i)).toBeNull();
    expect(screen.queryByText(/sample/i)).toBeNull();
    expect(screen.queryByText("Premier League")).toBeNull();
  });
});

const STATS: AdminDashboardStats = {
  newUsersThisMonth: 1,
  totalArticlesPublished: 2,
  communityUsersTotal: 3,
  totalVisits: 4,
  visitsByMonth: SIX_MONTHS,
};

const POSTS: AdminLatestPost[] = [
  {
    id: "p1",
    createdAt: "2026-11-05T23:30:00.000Z",
    mediaType: "photo",
    excerpt: "Great turnout at the Sunday league game today.",
    author: { publicName: "nelson_iheagwam" },
    likeCount: 24,
    commentCount: 6,
  },
  {
    id: "p2",
    createdAt: "2026-11-05T09:00:00.000Z",
    mediaType: null,
    excerpt: "Looking for a goalkeeper for next weekend.",
    author: { publicName: "Soccernity member" },
    likeCount: 0,
    commentCount: 0,
  },
  {
    id: "p3",
    createdAt: "2026-11-04T10:00:00.000Z",
    mediaType: "video",
    excerpt: "Our U14s warming up before the cup tie.",
    author: { publicName: "ada_obi" },
    likeCount: 41,
    commentCount: 12,
  },
];

describe("DashboardPage — Latest posts", () => {
  beforeEach(() => {
    vi.mocked(getDashboardStats).mockResolvedValue(STATS);
  });

  it("asks for the five newest posts", async () => {
    vi.mocked(getLatestPosts).mockResolvedValue(POSTS);
    renderPage();
    await waitFor(() => expect(getLatestPosts).toHaveBeenCalledTimes(1));
    expect(getLatestPosts).toHaveBeenCalledWith();
  });

  it("shows a loading skeleton with the column headers while the request is in flight", async () => {
    vi.mocked(getLatestPosts).mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(await screen.findByText("Loading the latest posts…")).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(container.querySelectorAll(".admin-dashboard__posts-row")).toHaveLength(5);
    const heads = Array.from(container.querySelectorAll(".admin-dashboard__posts-head span")).map(
      (el) => el.textContent,
    );
    expect(heads).toEqual(["Date", "Media", "Post", "Author", "Likes", "Comments"]);
    expect(screen.queryByText("No posts yet")).toBeNull();
    expect(screen.queryByText("Newest first")).toBeNull();
  });

  it("renders each post with date, media tag or dash, excerpt, public name, likes and comments", async () => {
    vi.mocked(getLatestPosts).mockResolvedValue(POSTS);
    renderPage();

    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Date", "Media", "Post", "Author", "Likes", "Comments"]);

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const cells = rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([
      ["05/11/2026", "Photo", "Great turnout at the Sunday league game today.", "nelson_iheagwam", "24", "6"],
      ["05/11/2026", "—", "Looking for a goalkeeper for next weekend.", "Soccernity member", "0", "0"],
      ["04/11/2026", "Video", "Our U14s warming up before the cup tie.", "ada_obi", "41", "12"],
    ]);
    expect(screen.getByText("Newest first")).not.toBeNull();
  });

  it("keeps the order the server sent (newest first) and formats the date in UTC", async () => {
    // 23:30 UTC on the 5th is already the 6th in UTC+2; the label must still be the 5th.
    vi.mocked(getLatestPosts).mockResolvedValue(POSTS);
    renderPage();
    const table = await screen.findByRole("table");
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getAllByRole("cell")[0].textContent).toBe("05/11/2026");
    const ids = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[3].textContent);
    expect(ids).toEqual(["nelson_iheagwam", "Soccernity member", "ada_obi"]);
  });

  it("shows only the author's public name, never an id or any other author field", async () => {
    const withExtras = [
      { ...POSTS[0], author: { publicName: "nelson_iheagwam", email: "x@y.z", displayName: "Real Name", id: "u-1" } },
    ] as unknown as AdminLatestPost[];
    vi.mocked(getLatestPosts).mockResolvedValue(withExtras);
    const { container } = renderPage();
    await screen.findByRole("table");
    expect(container.textContent).not.toContain("x@y.z");
    expect(container.textContent).not.toContain("Real Name");
    expect(container.textContent).not.toContain("u-1");
  });

  it("shows a dash, not a tag, for a post with no media", async () => {
    vi.mocked(getLatestPosts).mockResolvedValue([POSTS[1]]);
    const { container } = renderPage();
    await screen.findByRole("table");
    expect(container.querySelectorAll(".admin-dashboard__media-tag")).toHaveLength(0);
    expect(screen.getByLabelText("No media")).not.toBeNull();
  });

  it("shows the empty state, and no table or caption, when there are no posts", async () => {
    vi.mocked(getLatestPosts).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No posts yet")).not.toBeNull();
    expect(screen.getByText("Posts that people share will appear here.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Newest first")).toBeNull();
  });

  it("shows the fixed error banner with Try again, never the server's text", async () => {
    vi.mocked(getLatestPosts).mockRejectedValue(new AdminApiError(500, "SQL exploded at row 3"));
    renderPage();

    const alert = await screen.findByText("Couldn’t load the latest posts");
    expect(alert).not.toBeNull();
    expect(screen.getByText("Check the connection and try again.")).not.toBeNull();
    expect(screen.queryByText(/SQL exploded/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("Try again asks for the posts a second time and shows them", async () => {
    vi.mocked(getLatestPosts).mockRejectedValueOnce(new Error("network"));
    vi.mocked(getLatestPosts).mockResolvedValueOnce(POSTS);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).not.toBeNull();
    expect(getLatestPosts).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Couldn’t load the latest posts")).toBeNull();
  });

  it("a failed posts request does not touch the stats, and a failed stats request does not touch the posts", async () => {
    vi.mocked(getLatestPosts).mockRejectedValue(new Error("boom"));
    const first = renderPage();
    expect(await screen.findByText("Couldn’t load the latest posts")).not.toBeNull();
    // The stats still show.
    expect(screen.getByText("Total Visits")).not.toBeNull();
    expect(first.container.querySelector(".admin-dashboard__error")).toBeNull();
    cleanup();

    vi.mocked(getDashboardStats).mockRejectedValue(new AdminApiError(500, "Server error"));
    vi.mocked(getLatestPosts).mockResolvedValue(POSTS);
    renderPage();
    expect(await screen.findByText("Server error")).not.toBeNull();
    expect(await screen.findByRole("table")).not.toBeNull();
  });

  it("uses a full-width layout: no sample caption and the cards are not the stub sections", async () => {
    vi.mocked(getLatestPosts).mockResolvedValue(POSTS);
    const { container } = renderPage();
    await screen.findByRole("table");
    expect(container.querySelector(".admin-stub__section")).toBeNull();
    expect(container.querySelectorAll(".admin-dashboard__card")).toHaveLength(2);
  });
});
