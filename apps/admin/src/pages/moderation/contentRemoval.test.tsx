// B-289 (Decision Log #483): Remove Content is a real soft removal for posts, comments and messages, and the
// report detail says so. The server is the authority (it answers 400 content_removal_not_applicable for any other
// target); the page only offers the action where it can work, and shows the "Content removed" indicator.
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, listReports: vi.fn(), getReportById: vi.fn(), actionReport: vi.fn() };
});

import {
  CONTENT_REMOVAL_NOT_APPLICABLE_CODE,
  REPORT_ACTION_LABELS,
  REPORT_TARGET_TYPES,
  actionReport,
  actionsForTarget,
  canRemoveContent,
  getReportById,
  isContentRemoved,
  type Report,
  type ReportedMessage,
} from "../../api/moderation";
import ReportDetailPage from "./ReportDetailPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getReportById).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "post",
    targetId: "post-1",
    reasonCategory: "harassment_or_bullying",
    reason: "Insults the player each week.",
    status: "open",
    createdAt: "2026-11-02T10:00:00.000Z",
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

function message(overrides: Partial<ReportedMessage> = {}): ReportedMessage {
  return {
    id: "msg-1",
    sentAt: "2026-11-02T08:05:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    contentText: "You are useless, quit the team.",
    originalContentText: null,
    editedAt: null,
    deletedForEveryone: false,
    ...overrides,
  };
}

function renderDetail(ui: ReactNode, r: Report) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: { report: r } }]}>
      <Routes>
        <Route path="/moderation/reports/:id" element={ui} />
        <Route path="/moderation" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const removeButton = () => screen.queryByRole("button", { name: REPORT_ACTION_LABELS.content_removed });
const contentRemovedPill = () => screen.queryByText("Content removed", { selector: ".mod-pill" });

describe("which targets offer Remove Content", () => {
  it.each(["post", "comment", "message"])("is offered for a %s report", async (targetType) => {
    renderDetail(<ReportDetailPage />, report({ targetType }));
    await screen.findByText("Take action");
    expect(removeButton()).not.toBeNull();
    expect(screen.queryByRole("button", { name: REPORT_ACTION_LABELS.room_deactivated })).toBeNull();
  });

  it.each(["user", "banter_room", "grassroots_team", "fixture"])(
    "is not offered for a %s report",
    async (targetType) => {
      renderDetail(<ReportDetailPage />, report({ targetType }));
      await screen.findByText("Take action");
      expect(removeButton()).toBeNull();
      // The other actions are unchanged. Suspend User is offered only where the server can suspend an account (B-295).
      expect(screen.getByRole("button", { name: REPORT_ACTION_LABELS.warning_issued })).toBeTruthy();
      expect(screen.getByRole("button", { name: REPORT_ACTION_LABELS.dismissed })).toBeTruthy();
      expect(!!screen.queryByRole("button", { name: REPORT_ACTION_LABELS.user_suspended })).toBe(targetType === "user");
    },
  );

  it("still offers Deactivate Room only for a Banter room", async () => {
    renderDetail(<ReportDetailPage />, report({ targetType: "banter_room" }));
    await screen.findByText("Take action");
    expect(screen.getByRole("button", { name: REPORT_ACTION_LABELS.room_deactivated })).toBeTruthy();
  });

  it("the helpers agree with each other for every target type", () => {
    for (const type of REPORT_TARGET_TYPES) {
      expect(actionsForTarget(type).includes("content_removed")).toBe(canRemoveContent(type));
      expect(actionsForTarget(type).includes("room_deactivated")).toBe(type === "banter_room");
    }
    expect(canRemoveContent("enquiry")).toBe(false);
  });

  it("describes what Remove Content does only where it is offered", async () => {
    const { unmount } = renderDetail(<ReportDetailPage />, report({ targetType: "post" }));
    await screen.findByText("Take action");
    expect(screen.getByText(/Remove Content hides it from everyone but you and the other moderators/)).toBeTruthy();
    unmount();
    renderDetail(<ReportDetailPage />, report({ targetType: "user" }));
    await screen.findByText("Take action");
    expect(screen.queryByText(/Remove Content hides it/)).toBeNull();
    expect(screen.getByText(/does not by itself remove content/)).toBeTruthy();
  });
});

describe("the Content removed indicator", () => {
  it.each(["post", "comment"])(
    "shows on an actioned content_removed %s report, with the action taken",
    async (targetType) => {
      renderDetail(
        <ReportDetailPage />,
        report({
          targetType,
          status: "actioned",
          actionTaken: "content_removed",
          reviewedAt: "2026-11-02T11:00:00.000Z",
        }),
      );
      await screen.findByText("Reported content");
      expect(contentRemovedPill()).not.toBeNull();
      const label = screen.getByText("Action taken", { selector: ".mod-field__label" });
      expect(label.parentElement!.textContent).toContain("Content removed");
      // The take-action buttons are gone; only the case-level actions remain (A8, A9).
      expect(screen.queryByText("Take action")).toBeNull();
      expect(removeButton()).toBeNull();
      expect(screen.getByRole("button", { name: "Legal hold" })).toBeTruthy();
      expect(screen.getByText("Case-level actions")).toBeTruthy();
    },
  );

  it("shows on a message report when the server says the message was removed, and the text stays", async () => {
    renderDetail(
      <ReportDetailPage />,
      report({
        targetType: "message",
        status: "actioned",
        actionTaken: "content_removed",
        reviewedAt: "2026-11-02T11:00:00.000Z",
        reportedMessage: message({ removedByModerationAt: "2026-11-02T11:00:00.000Z" }),
      }),
    );
    await screen.findByText("Reported content");
    expect(contentRemovedPill()).not.toBeNull();
    // The admin keeps seeing what was removed (it stays as evidence).
    expect(screen.getByText("You are useless, quit the team.")).toBeTruthy();
  });

  it("does not show on an open report, a dismissed one, or a report whose removal was overturned", async () => {
    for (const r of [
      report({ targetType: "post" }),
      report({ targetType: "post", status: "reviewed", actionTaken: "dismissed" }),
      // An overturned appeal reopens the report and clears actionTaken.
      report({ targetType: "comment", status: "open", actionTaken: null, appealStatus: "overturned" }),
      // Not a removable target.
      report({ targetType: "user", status: "actioned", actionTaken: "content_removed" }),
    ]) {
      const { unmount } = renderDetail(<ReportDetailPage />, r);
      await screen.findByText("Reported content");
      expect(contentRemovedPill()).toBeNull();
      unmount();
    }
  });

  it("does not show on a message report whose message was not removed (or when the server does not say)", async () => {
    for (const removedByModerationAt of [null, undefined]) {
      const { unmount } = renderDetail(
        <ReportDetailPage />,
        report({ targetType: "message", reportedMessage: message({ removedByModerationAt }) }),
      );
      await screen.findByText("Reported content");
      expect(contentRemovedPill()).toBeNull();
      unmount();
    }
  });

  it("isContentRemoved reads the message field for a message and the decision for a post or comment", () => {
    const base = { status: "actioned", actionTaken: "content_removed" };
    expect(isContentRemoved({ ...base, targetType: "post" })).toBe(true);
    expect(isContentRemoved({ ...base, targetType: "user" })).toBe(false);
    expect(
      isContentRemoved({ ...base, targetType: "message", reportedMessage: message({ removedByModerationAt: null }) }),
    ).toBe(false);
    expect(
      isContentRemoved({
        ...base,
        targetType: "message",
        reportedMessage: message({ removedByModerationAt: "2026-11-02T11:00:00.000Z" }),
      }),
    ).toBe(true);
  });
});

describe("recording Remove Content", () => {
  it("sends content_removed and returns to the queue", async () => {
    vi.mocked(actionReport).mockResolvedValue(report({ status: "actioned", actionTaken: "content_removed" }));
    renderDetail(<ReportDetailPage />, report({ targetType: "comment" }));
    await screen.findByText("Take action");
    fireEvent.click(removeButton()!);
    await waitFor(() => expect(actionReport).toHaveBeenCalledWith("report-open-1234", "content_removed"));
    await screen.findByText("queue");
  });

  it("handles content_removal_not_applicable by its code, never by the wording of the server", async () => {
    vi.mocked(actionReport).mockRejectedValue(
      new AdminApiError(400, "some unrelated wording the page must not show", {
        code: CONTENT_REMOVAL_NOT_APPLICABLE_CODE,
      }),
    );
    renderDetail(<ReportDetailPage />, report({ targetType: "post" }));
    await screen.findByText("Take action");
    fireEvent.click(removeButton()!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Content can only be removed for a post, a comment or a message.");
    expect(screen.queryByText(/unrelated wording/)).toBeNull();
    // The buttons come back so the moderator can choose something else.
    expect(removeButton()).not.toBeNull();
  });

  it("a different failure still shows the message of the server", async () => {
    vi.mocked(actionReport).mockRejectedValue(new AdminApiError(409, "This report was already actioned."));
    renderDetail(<ReportDetailPage />, report({ targetType: "post" }));
    await screen.findByText("Take action");
    fireEvent.click(removeButton()!);
    expect((await screen.findByRole("alert")).textContent).toBe("This report was already actioned.");
  });
});
