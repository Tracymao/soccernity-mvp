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
    getReportById: vi.fn(),
    actionReport: vi.fn(),
    decideAppeal: vi.fn(),
    escalateReport: vi.fn(),
  };
});

import {
  listReports,
  getReportById,
  actionReport,
  decideAppeal,
  escalateReport,
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  type Report,
} from "../../api/moderation";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import AppealReviewPage from "./AppealReviewPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listReports).mockReset();
  vi.mocked(getReportById).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(decideAppeal).mockReset();
  vi.mocked(escalateReport).mockReset();
});

// A 403 shaped exactly like moderation.service.ts's assertChildSafetyVetted
// throw (AdminApiError.body carries the parsed response JSON) — used to
// exercise isChildSafetyVettingRequiredError's real detection logic rather
// than mocking that helper away.
function vettingRequiredError(): AdminApiError {
  return new AdminApiError(403, "This action requires a child-safety-vetted admin.", {
    statusCode: 403,
    error: "Forbidden",
    code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
    message: "This action requires a child-safety-vetted admin.",
  });
}

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
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "post",
    targetId: "post-5678",
    reason: "Abusive language",
    status: "open",
    createdAt: "2026-09-14T10:00:00.000Z",
    concernsMinor: false,
    severity: "medium",
    reviewedByAdminId: null,
    reviewedAt: null,
    actionTaken: null,
    appealStatus: null,
    appealReason: null,
    appealedAt: null,
    appealReviewedByAdminId: null,
    appealReviewedAt: null,
    escalatedAt: null,
    escalatedByAdminId: null,
    escalationNotes: null,
    escalatedToAuthority: false,
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

  it("shows severity and a 'Concerns a minor' flag on a row that carries them", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({
      items: [openReport({ severity: "high", concernsMinor: true })],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("High")).not.toBeNull();
    expect(screen.getByText("Concerns a minor")).not.toBeNull();
  });

  it("does not render the 'Concerns a minor' flag on a row where it's false", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({
      items: [openReport({ severity: "low", concernsMinor: false })],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Low")).not.toBeNull();
    expect(screen.queryByText("Concerns a minor")).toBeNull();
  });

  it("shows 'Public report' for a row with no reporterId (POST /reports/public)", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({
      items: [
        openReport({
          reporterId: null,
          reporterContactEmail: "parent@example.com",
        }),
      ],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Public report")).not.toBeNull();
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
    expect(getReportById).not.toHaveBeenCalled();
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

  it("falls back to getReportById when there is no router state (direct visit / refresh)", async () => {
    const report = openReport({ id: "direct-visit-report" });
    vi.mocked(getReportById).mockResolvedValueOnce(report);

    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${report.id}`);

    await waitFor(() => expect(getReportById).toHaveBeenCalledWith(report.id));
    expect(await screen.findByText("Abusive language")).not.toBeNull();
  });

  it("shows an honest not-found state when the real fetch 404s", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(new AdminApiError(404, "Report not found"));

    renderAt(<ReportDetailPage />, "/moderation/reports/:id", "/moderation/reports/missing-id");

    expect(await screen.findByText("Report not found")).not.toBeNull();
    expect(await screen.findByText(/No report exists with this id/)).not.toBeNull();
  });

  it("shows the restricted state (not not-found) when a direct visit's fetch itself 403s as vetting-required", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(vettingRequiredError());

    renderAt(<ReportDetailPage />, "/moderation/reports/:id", "/moderation/reports/minor-report-id");

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByText("Report not found")).toBeNull();
  });

  it("shows severity and 'Concerns a minor' in the Report details card", async () => {
    const report = openReport({ severity: "critical", concernsMinor: true });
    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("Critical")).not.toBeNull();
    // "Concerns a minor" renders twice: the field value badge, and the
    // note above the action buttons — both are real, expected instances.
    expect(screen.getAllByText(/Concerns a minor/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/requires a child-safety-vetted admin/i)).not.toBeNull();
  });

  it("shows a public report's contact email instead of a reporterId", async () => {
    const report = openReport({
      reporterId: null,
      reporterContactEmail: "parent@example.com",
    });
    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    expect(await screen.findByText(/Public report — parent@example.com/)).not.toBeNull();
  });

  it("shows the restricted state (not a generic error) when actioning 403s as vetting-required", async () => {
    const report = openReport({ concernsMinor: true });
    vi.mocked(actionReport).mockRejectedValueOnce(vettingRequiredError());

    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss Report" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss Report" })).toBeNull();
  });

  it("records an escalation and shows the last-recorded summary", async () => {
    const report = openReport();
    const escalated = {
      ...report,
      escalatedAt: "2026-09-27T12:00:00.000Z",
      escalatedByAdminId: "admin-vetted-1",
      escalationNotes: "Reported to the designated child-safety lead.",
      escalatedToAuthority: true,
    };
    vi.mocked(escalateReport).mockResolvedValueOnce(escalated);

    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    fireEvent.change(await screen.findByPlaceholderText(/What did you do/i), {
      target: { value: "Reported to the designated child-safety lead." },
    });
    fireEvent.click(screen.getByLabelText(/already contacted an external authority/i));
    fireEvent.click(screen.getByRole("button", { name: "Record escalation" }));

    await waitFor(() =>
      expect(escalateReport).toHaveBeenCalledWith(report.id, {
        escalationNotes: "Reported to the designated child-safety lead.",
        escalatedToAuthority: true,
      }),
    );
    expect(await screen.findByText(/an external authority was contacted/i)).not.toBeNull();
    // Doesn't navigate away — escalating is independent of taking action.
    expect(screen.queryByTestId("loc")).toBeNull();
  });

  it("shows the restricted state for the Escalate action specifically, without hiding Take action", async () => {
    const report = openReport();
    vi.mocked(escalateReport).mockRejectedValueOnce(vettingRequiredError());

    renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      { pathname: `/moderation/reports/${report.id}`, state: { report } },
    );

    fireEvent.change(await screen.findByPlaceholderText(/What did you do/i), {
      target: { value: "Attempted escalation." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record escalation" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    // The report doesn't concern a minor, so Take action is unaffected.
    expect(screen.getByRole("button", { name: "Dismiss Report" })).not.toBeNull();
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

  it("falls back to getReportById when there is no router state (direct visit / refresh)", async () => {
    const report = actionedReportWithAppeal({ id: "direct-visit-appeal" });
    vi.mocked(getReportById).mockResolvedValueOnce(report);

    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", `/moderation/appeals/${report.id}`);

    await waitFor(() => expect(getReportById).toHaveBeenCalledWith(report.id));
    expect(await screen.findByText("Remove Content")).not.toBeNull();
  });

  it("shows an honest not-found state when the real fetch 404s", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(new AdminApiError(404, "Report not found"));

    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", "/moderation/appeals/missing-id");

    expect(await screen.findByText("Appeal not found")).not.toBeNull();
    expect(await screen.findByText(/No report exists with this id/)).not.toBeNull();
  });

  it("shows the restricted state (not not-found) when a direct visit's fetch itself 403s as vetting-required", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(vettingRequiredError());

    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", "/moderation/appeals/minor-report-id");

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByText("Appeal not found")).toBeNull();
  });

  it("shows severity and 'Concerns a minor' in the original-decision card", async () => {
    const report = actionedReportWithAppeal({ severity: "high", concernsMinor: true });
    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("High")).not.toBeNull();
    expect(screen.getAllByText("Concerns a minor").length).toBeGreaterThanOrEqual(1);
    expect(
      await screen.findByText(/deciding its appeal requires a child-safety-vetted admin/i),
    ).not.toBeNull();
  });

  it("shows the restricted state (not a generic error) when deciding an appeal 403s as vetting-required", async () => {
    const report = actionedReportWithAppeal({ concernsMinor: true });
    vi.mocked(decideAppeal).mockRejectedValueOnce(vettingRequiredError());

    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Uphold Original Decision" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Overturn Decision" })).toBeNull();
  });

  it("records an escalation from the Appeal Review screen too", async () => {
    const report = actionedReportWithAppeal();
    const escalated = {
      ...report,
      escalatedAt: "2026-09-27T12:00:00.000Z",
      escalatedByAdminId: "admin-vetted-2",
      escalationNotes: "Flagging for the child-safety lead's awareness.",
      escalatedToAuthority: false,
    };
    vi.mocked(escalateReport).mockResolvedValueOnce(escalated);

    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    fireEvent.change(await screen.findByPlaceholderText(/What did you do/i), {
      target: { value: "Flagging for the child-safety lead's awareness." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record escalation" }));

    await waitFor(() =>
      expect(escalateReport).toHaveBeenCalledWith(report.id, {
        escalationNotes: "Flagging for the child-safety lead's awareness.",
        escalatedToAuthority: false,
      }),
    );
    expect(await screen.findByText(/not yet reported to an external authority/i)).not.toBeNull();
  });

  it("still offers Escalate on the no-pending-appeal state", async () => {
    const report = actionedReportWithAppeal({ appealStatus: "upheld" });
    renderAt(
      <AppealReviewPage />,
      "/moderation/appeals/:id",
      { pathname: `/moderation/appeals/${report.id}`, state: { report } },
    );

    expect(await screen.findByText("No pending appeal")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Record escalation" })).not.toBeNull();
  });
});
