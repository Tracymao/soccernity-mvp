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

import { getDashboardStats } from "../api/adminDashboard";
import DashboardPage from "./DashboardPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getDashboardStats).mockReset();
});

describe("DashboardPage", () => {
  it("renders the three real stats once loaded", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 4,
      totalArticlesPublished: 12,
      communityUsersTotal: 250,
      totalVisits: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("4")).not.toBeNull();
    expect(screen.getByText("12")).not.toBeNull();
    expect(screen.getByText("250")).not.toBeNull();
    for (const label of ["New Users", "Total Visits", "Total Articles", "Community Users"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
  });

  it('shows "—" for Total Visits even after the real stats load — no page-view tracking exists', async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    // Every real stat resolved to 0 (a genuine value) except Total
    // Visits, which stays the placeholder — distinguishing "loaded, real
    // zero" from "never computed" is the whole point of this test.
    expect(screen.getAllByText("0")).toHaveLength(3);
    const totalVisitsCard = screen.getByText("Total Visits").closest(".admin-dashboard__stat");
    expect(totalVisitsCard).not.toBeNull();
    expect(totalVisitsCard!.querySelector(".admin-dashboard__stat-value")!.textContent).toBe("—");
  });

  it("surfaces a real backend error with a retry", async () => {
    vi.mocked(getDashboardStats).mockRejectedValueOnce(new AdminApiError(500, "Server error"));
    vi.mocked(getDashboardStats).mockResolvedValueOnce({
      newUsersThisMonth: 1,
      totalArticlesPublished: 2,
      communityUsersTotal: 3,
      totalVisits: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Server error")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1")).not.toBeNull();
  });

  it("still discloses the League breakdown / visitor chart / Latest posts as sample data", async () => {
    vi.mocked(getDashboardStats).mockResolvedValue({
      newUsersThisMonth: 0,
      totalArticlesPublished: 0,
      communityUsersTotal: 0,
      totalVisits: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getDashboardStats).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/visitor statistics chart/i)).not.toBeNull();
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
  });
});
