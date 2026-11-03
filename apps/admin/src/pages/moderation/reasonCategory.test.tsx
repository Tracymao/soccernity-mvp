// B-284 (Decision Log #465): the reason category on the Moderation Queue row, Report Detail and Appeal Review,
// from the Figma frames 6947:40930 (queue), 6947:41119 and 6947:41276 (detail). A report that carries no category
// reads "Not categorised"; the reporter's free text is the Description (Report Detail / Appeal Review only).
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, listReports: vi.fn(), getReportById: vi.fn() };
});

import { getReportById, listReports, REPORT_REASON_CATEGORIES, type Report } from "../../api/moderation";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import AppealReviewPage from "./AppealReviewPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listReports).mockReset();
  vi.mocked(getReportById).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "post",
    targetId: "post-5678",
    reasonCategory: "harassment_or_bullying",
    reason: "Insults the player each week.",
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

function appealed(overrides: Partial<Report> = {}): Report {
  return report({
    status: "actioned",
    actionTaken: "warning_issued",
    reviewedByAdminId: "admin-original-9999",
    reviewedAt: "2026-09-14T12:00:00.000Z",
    appealStatus: "pending",
    appealReason: "That was not meant as abuse.",
    appealedAt: "2026-09-14T18:00:00.000Z",
    ...overrides,
  });
}

function renderAt(ui: ReactNode, routePath: string, pathname: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path={routePath} element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

function fieldValue(label: string): HTMLElement {
  const labelNode = screen.getByText(label, { selector: ".mod-field__label" });
  return labelNode.parentElement!.querySelector(".mod-field__value") as HTMLElement;
}

describe("Moderation Queue: Reason category column", () => {
  it("heads the column 'Reason category' and shows the label of each row's category", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({
      items: [
        report({ id: "a-1", reasonCategory: "hate_or_abusive_language" }),
        report({ id: "b-2", reasonCategory: "impersonation_or_fake_account", targetType: "user" }),
        report({ id: "c-3", reasonCategory: "other" }),
      ],
      nextCursor: null,
    });
    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Hate or abusive language")).not.toBeNull();
    expect(screen.getByText("Impersonation or fake account")).not.toBeNull();
    expect(screen.getByText("Other")).not.toBeNull();
    expect(screen.getByText("Reason category")).not.toBeNull();
    expect(screen.queryByText("Reason")).toBeNull();
  });

  it("shows 'Not categorised' when the server returns null", async () => {
    vi.mocked(listReports).mockResolvedValueOnce({
      items: [report({ id: "old-1", reasonCategory: null, reason: "An old free-text reason" })],
      nextCursor: null,
    });
    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Not categorised")).not.toBeNull();
    // The description is not drawn in the row (Figma 6947:40930); it stays available as the hover text.
    expect(screen.queryByText("An old free-text reason")).toBeNull();
    expect(screen.getByText("Not categorised").getAttribute("title")).toBe("An old free-text reason");
  });

  it("has a label for every category the server can send (none falls through to its raw key)", async () => {
    const items = REPORT_REASON_CATEGORIES.map((c, i) => report({ id: `r-${i}`, reasonCategory: c }));
    vi.mocked(listReports).mockResolvedValueOnce({ items, nextCursor: null });
    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    await screen.findByText("Harassment or bullying");
    for (const key of REPORT_REASON_CATEGORIES) expect(screen.queryByText(key)).toBeNull();
  });
});

describe("Report Detail: Reason category and Description", () => {
  it("shows the category label and the reporter's description as separate rows", async () => {
    const r = report();
    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${r.id}`, { report: r });
    await screen.findByText("Report details");
    expect(within(fieldValue("Reason category")).getByText("Harassment or bullying")).not.toBeNull();
    expect(fieldValue("Description").textContent).toBe("Insults the player each week.");
    expect(screen.queryByText("Reason", { selector: ".mod-field__label" })).toBeNull();
  });

  it("an older report reads 'Not categorised' and keeps its old free text as the Description", async () => {
    const r = report({ reasonCategory: null, reason: "He keeps posting my photo." });
    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${r.id}`, { report: r });
    await screen.findByText("Report details");
    expect(fieldValue("Reason category").textContent).toBe("Not categorised");
    expect(fieldValue("Description").textContent).toBe("He keeps posting my photo.");
  });

  it("draws no Description row when the reporter wrote none (stored as the empty string)", async () => {
    const r = report({ reasonCategory: "spam_or_scam", reason: "" });
    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${r.id}`, { report: r });
    await screen.findByText("Report details");
    expect(fieldValue("Reason category").textContent).toBe("Spam or scam");
    expect(screen.queryByText("Description", { selector: ".mod-field__label" })).toBeNull();
  });

  it("reads the category from the server's single-report answer on a direct visit", async () => {
    const r = report({ reasonCategory: "threats_or_violence", reason: "" });
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockResolvedValue(r);
    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${r.id}`);
    await screen.findByText("Report details");
    expect(fieldValue("Reason category").textContent).toBe("Threats or violence");
  });
});

describe("Appeal Review: Reason category and Description", () => {
  it("shows the category and the description in the original-decision card", async () => {
    const r = appealed({ reasonCategory: "privacy_or_image_misuse" });
    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", `/moderation/appeals/${r.id}`, { report: r });
    await screen.findByText("Original decision (read-only)");
    expect(fieldValue("Reason category").textContent).toBe("Privacy or image misuse");
    expect(fieldValue("Description").textContent).toBe("Insults the player each week.");
  });

  it("an older report reads 'Not categorised' with its old free text kept", async () => {
    const r = appealed({ reasonCategory: null, reason: "Old text" });
    renderAt(<AppealReviewPage />, "/moderation/appeals/:id", `/moderation/appeals/${r.id}`, { report: r });
    await screen.findByText("Original decision (read-only)");
    expect(fieldValue("Reason category").textContent).toBe("Not categorised");
    expect(fieldValue("Description").textContent).toBe("Old text");
  });
});
