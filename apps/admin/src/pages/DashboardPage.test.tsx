import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminApiError } from "../api/adminClient";

vi.mock("../api/adminDashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/adminDashboard")>();
  return {
    ...actual,
    getDashboardStats: vi.fn(),
  };
});

import { getDashboardStats, type AdminDashboardStats } from "../api/adminDashboard";
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
    for (const label of ["New Users", "Total Visits", "Total Articles", "Community Users"]) {
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

  it("still discloses the League breakdown and Latest posts as sample data", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: 0,
      visitsByMonth: [],
    });

    renderPage();

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
    // The visitor chart is no longer a sample — it must not claim to be.
    expect(screen.queryByText(/no page-view tracking/i)).toBeNull();
  });
});
