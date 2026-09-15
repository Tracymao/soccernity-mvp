import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return {
    ...actual,
    listReports: vi.fn(),
    actionReport: vi.fn(),
    decideAppeal: vi.fn(),
    findReportById: vi.fn(),
  };
});

import {
  listReports,
  actionReport,
  decideAppeal,
  findReportById,
  type Report,
} from "../../api/moderation";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import AppealReviewPage from "./AppealReviewPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listReports).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(decideAppeal).mockReset();
  vi.mocked(findReportById).mockReset();
});

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(
  ui: ReactNode,
  routePath: string,
  initialEntry: string | { pathname: string; state?: unknown },
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---- fixtures ----------------------------------------------------------

function openReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    targetType: "post",
    targetId: "post-5678",
    reason: "Abusive language",
    status: "open",
    createdAt: "2026-09-14T10:00:00.000Z",
    reviewedByAdminId: null,
    reviewedAt: null,
    actionTaken: null,
    appealStatus: null,
    appealReason: null,
    appealedAt: null,
    appealReviewedByAdminId: null,
    appealReviewedAt: null,
    ...overrides,
  };
}

function actionedReportWithAppeal(overrides: Partial<Report> = {}): Report {
  return {
    ...openReport(),
    id: "report-actioned-9999",
    status: "actioned",
    reviewedByAdminId: "admin-A",
    reviewedAt: "2026-09-14T12:00:00.000Z",
    actionTaken: "content_removed",
    appealStatus: "pending",
    appealReason: "That wasn't meant as abuse.",
    appealedAt: "2026-09-14T18:00:00.000Z",
    ...overrides,
  };
}

// ---- ModerationQueuePage ------------------------------------------------

describe("ModerationQueuePage", () => {
  it("loads Open Reports by default and renders real rows", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({ items: [openReport()], nextCursor: null });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listReports).toHaveBeenCalledWith({ status: "open", limit: 50 }));
    expect(await screen.findByText("Abusive language")).not.toBeNull();
    expect(screen.getByText("Post")).not.toBeNull();
    expect(screen.getByText("open")).not.toBeNull();
  });

  it("switches to the Appeals tab and filters to appealStatus === 'pending' only", async () => {
    const pendingAppeal = actionedReportWithAppeal();
    const decidedAppeal = actionedReportWithAppeal({
      id: "report-decided",
      appealStatus: "upheld",
      reason: "Off-topic abuse",
    });
    vi.mocked(listReports)
      .mockResolvedValueOnce({ items: [openReport()], nextCursor: null })
      .mockResolvedValueOnce({ items: [pendingAppeal, decidedAppeal], nextCursor: null });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    await screen.findByText("Abusive language");
    fireEvent.click(screen.getByRole("button", { name: "Appeals" }));

    await waitFor(() => expect(listReports).toHaveBeenLastCalledWith({ status: "actioned", limit: 50 }));
    // pendingAppeal.reason (inherited from openReport()) shows; the
    // already-decided report's own distinct reason must be filtered out.
    expect(await screen.findByText("Abusive language")).not.toBeNull();
    expect(screen.queryByText("Off-topic abuse")).toBeNull();
  });

  it("shows the empty state when there are no open reports", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({ items: [], nextCursor: null });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No open reports")).not.toBeNull();
  });

  it("shows the disclosed 'action does not enforce' limitation note", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({ items: [openReport()], nextCursor: null });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/does not by itself enforce it/i),
    ).not.toBeNull();
  });
});

// ---- ReportDetailPage ----------------------------------------------------

describe("ReportDetailPage", () => {
  it("renders the report passed via router state and offers the four real actions", async () => {
    const report = openReport();
    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("Abusive language")).not.toBeNull();
    for (const label of ["Dismiss Report", "Remove Content", "Warn User", "Suspend User"]) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn.hasAttribute("disabled")).toBe(false);
    }
    expect(findReportById).not.toHaveBeenCalled();
  });

  it("actions the report and navigates back to the queue on success", async () => {
    const report = openReport();
    vi.mocked(actionReport).mockResolvedValueOnce({ ...report, status: "reviewed", actionTaken: "dismissed" });

    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss Report" }));

    await waitFor(() => expect(actionReport).toHaveBeenCalledWith(report.id, "dismissed"));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/moderation"));
  });

  it("surfaces a real backend error inline without navigating away", async () => {
    const report = openReport();
    vi.mocked(actionReport).mockRejectedValueOnce(new AdminApiError(409, "This report has already been reviewed"));

    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Warn User" }));

    expect(await screen.findByText("This report has already been reviewed")).not.toBeNull();
  });

  it("shows the already-reviewed state with no action buttons for a non-open report", async () => {
    const report = openReport({
      status: "actioned",
      actionTaken: "content_removed",
      reviewedAt: "2026-09-14T12:00:00.000Z",
    });
    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("Already reviewed")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss Report" })).toBeNull();
  });

  it("falls back to findReportById when there is no router state (direct visit / refresh)", async () => {
    const report = openReport({ id: "direct-visit-report" });
    vi.mocked(findReportById).mockResolvedValueOnce(report);

    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${report.id}`);

    await waitFor(() => expect(findReportById).toHaveBeenCalledWith(report.id, "open"));
    expect(await screen.findByText("Abusive language")).not.toBeNull();
  });

  it("shows an honest not-found state when the fallback fetch can't find the report", async () => {
    vi.mocked(findReportById).mockResolvedValueOnce(null);

    renderAt(<ReportDetailPage />, "/moderation/reports/:id", "/moderation/reports/missing-id");

    expect(await screen.findByText("Report not found")).not.toBeNull();
  });
});

// ---- AppealReviewPage ----------------------------------------------------

describe("AppealReviewPage", () => {
  it("renders the original decision and the appeal, with Uphold/Overturn enabled", async () => {
    const report = actionedReportWithAppeal();
    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("Remove Content")).not.toBeNull();
    expect(screen.getByText("That wasn't meant as abuse.")).not.toBeNull();
    for (const label of ["Uphold Original Decision", "Overturn Decision"]) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn.hasAttribute("disabled")).toBe(false);
    }
  });

  it("decides the appeal and navigates back to the queue on success", async () => {
    const report = actionedReportWithAppeal();
    vi.mocked(decideAppeal).mockResolvedValueOnce({ ...report, appealStatus: "overturned", status: "open" });

    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Overturn Decision" }));

    await waitFor(() => expect(decideAppeal).toHaveBeenCalledWith(report.id, "overturned"));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/moderation"));
  });

  it("surfaces the real Decision Log #138 rejection verbatim", async () => {
    const report = actionedReportWithAppeal();
    vi.mocked(decideAppeal).mockRejectedValueOnce(
      new AdminApiError(403, "The admin who actioned this report may not also review its appeal"),
    );

    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Uphold Original Decision" }));

    expect(
      await screen.findByText("The admin who actioned this report may not also review its appeal"),
    ).not.toBeNull();
  });

  it("shows the no-pending-appeal state when appealStatus isn't 'pending'", async () => {
    const report = actionedReportWithAppeal({ appealStatus: "upheld" });
    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("No pending appeal")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Overturn Decision" })).toBeNull();
  });

  it("falls back to findReportById(id, 'actioned') when there is no router state", async () => {
    const report = actionedReportWithAppeal({ id: "direct-visit-appeal" });
    vi.mocked(findReportById).mockResolvedValueOnce(report);

    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", `/moderation/appeals/${report.id}`);

    await waitFor(() => expect(findReportById).toHaveBeenCalledWith(report.id, "actioned"));
    expect(await screen.findByText("Remove Content")).not.toBeNull();
  });
});
