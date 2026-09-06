import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import AppealReviewPage from "./AppealReviewPage";

afterEach(cleanup);

describe("Moderation stub screens", () => {
  it("Queue: discloses the missing backend, shows the sample table, and states the DL #138 rule", () => {
    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("note").textContent).toContain("not built");
    expect(screen.getByText("Sample — not real data")).not.toBeNull();
    expect(screen.getByText(/reviewed by a/i).textContent).toContain("different");
    // Export Queue button present and disabled
    const btn = screen.getByRole("button", { name: "Export Queue" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("Report Detail: reproduces the four moderator actions, all disabled", () => {
    render(
      <MemoryRouter>
        <ReportDetailPage />
      </MemoryRouter>,
    );
    for (const label of ["Dismiss Report", "Remove Content", "Warn User", "Suspend User"]) {
      const b = screen.getByRole("button", { name: label });
      expect(b.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByText(/both the reporter and the reported user are notified/i)).not.toBeNull();
  });

  it("Appeal Review: shows the routing banner and Uphold/Overturn, all disabled", () => {
    render(
      <MemoryRouter>
        <AppealReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/you were/i).textContent).toContain("not");
    for (const label of ["Uphold Original Decision", "Overturn Decision"]) {
      const b = screen.getByRole("button", { name: label });
      expect(b.hasAttribute("disabled")).toBe(true);
    }
  });
});
