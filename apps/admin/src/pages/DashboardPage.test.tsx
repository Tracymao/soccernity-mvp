import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";

afterEach(cleanup);

describe("DashboardPage (stub)", () => {
  it("discloses the missing endpoint and shows dashes for every metric", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("note").textContent).toContain("GET /admin/dashboard/stats");
    // 4 stat cards, all "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    for (const label of ["New Users", "Total Visits", "Total Articles", "Community Users"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(screen.getByLabelText(/visitor statistics chart/i)).not.toBeNull();
  });
});
