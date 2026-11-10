// A report whose target is a chat message (backend/b067-message-report; Figma R11 7011:57380, R12 7011:57551,
// R13 7011:57728). The server attaches the reported message to the single-report read only; the queue rows carry none.
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
  actionReport,
  getReportById,
  listReports,
  REPORT_ACTION_LABELS,
  REPORT_TARGET_TYPES,
  type Report,
  type ReportedMessage,
} from "../../api/moderation";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import { REPORTED_MESSAGE_UNAVAILABLE } from "./ReportedMessageFields";
import { targetLabel } from "./moderationShared";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listReports).mockReset();
  vi.mocked(getReportById).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

const MESSAGE_TEXT = "Sorry, I did not mean that. Training is at 7am.";
const ORIGINAL_TEXT = "You are useless, quit the team and stop messaging me.";

function message(overrides: Partial<ReportedMessage> = {}): ReportedMessage {
  return {
    id: "msg-1",
    sentAt: "2026-11-02T08:05:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    contentText: MESSAGE_TEXT,
    originalContentText: null,
    editedAt: null,
    deletedForEveryone: false,
    ...overrides,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "message",
    targetId: "msg-1",
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

function renderDetail(ui: ReactNode, r: Report, withState = true) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: withState ? { report: r } : undefined }]}
    >
      <Routes>
        <Route path="/moderation/reports/:id" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

function fieldValue(label: string): HTMLElement {
  const labelNode = screen.getByText(label, { selector: ".mod-field__label" });
  return (labelNode.parentElement!.querySelector(".mod-field__value") ??
    labelNode.parentElement!.querySelector(".mod-message-text")) as HTMLElement;
}

describe("message as a report target: labels and types", () => {
  it("lists 'message' among the target types and labels it 'Message'", () => {
    expect(REPORT_TARGET_TYPES).toContain("message");
    expect(targetLabel("message")).toBe("Message");
  });

  it("an unknown target type is still shown as it came", () => {
    expect(targetLabel("something_new")).toBe("something_new");
  });
});

describe("Report Detail: message target", () => {
  it("shows Type, Sender, Sent and the message text (R11)", async () => {
    const r = report({ reportedMessage: message() });
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(fieldValue("Type").textContent).toBe("Message");
    expect(fieldValue("Sender").textContent).toBe("matthew_amuloko");
    expect(fieldValue("Sent").textContent).toContain("2 Nov 2026");
    expect(fieldValue("Message text").textContent).toBe(MESSAGE_TEXT);
    expect(screen.queryByText("Edited", { selector: ".mod-field__label" })).toBeNull();
    expect(screen.queryByText("Message status", { selector: ".mod-field__label" })).toBeNull();
    expect(screen.queryByText("Original text (before the edit)")).toBeNull();
  });

  it("an edited message shows the Edited line, the current text and the original text (R12)", async () => {
    const r = report({
      reportedMessage: message({ editedAt: "2026-11-02T08:09:00.000Z", originalContentText: ORIGINAL_TEXT }),
    });
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(fieldValue("Edited").textContent).toMatch(/^Yes, at /);
    expect(fieldValue("Message text (current)").textContent).toBe(MESSAGE_TEXT);
    expect(fieldValue("Original text (before the edit)").textContent).toBe(ORIGINAL_TEXT);
    // No claim about the 15-minute window: the server does not say.
    expect(screen.queryByText(/within the 15 minutes/)).toBeNull();
  });

  it("a message deleted for everyone shows the status and keeps the text for review (R13)", async () => {
    const r = report({ reportedMessage: message({ deletedForEveryone: true, contentText: ORIGINAL_TEXT }) });
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(fieldValue("Message status").textContent).toBe("Deleted by the sender");
    expect(fieldValue("Message text").textContent).toBe(ORIGINAL_TEXT);
  });

  it("edited and then deleted shows both lines and both texts", async () => {
    const r = report({
      reportedMessage: message({
        editedAt: "2026-11-02T08:09:00.000Z",
        originalContentText: ORIGINAL_TEXT,
        deletedForEveryone: true,
      }),
    });
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(fieldValue("Edited").textContent).toMatch(/^Yes, at /);
    expect(fieldValue("Message status").textContent).toBe("Deleted by the sender");
    expect(fieldValue("Message text (current)").textContent).toBe(MESSAGE_TEXT);
    expect(fieldValue("Original text (before the edit)").textContent).toBe(ORIGINAL_TEXT);
  });

  it("a null message (gone, or not attached) says so and still shows the rest of the report", async () => {
    const r = report({ reportedMessage: null });
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(screen.getByText(REPORTED_MESSAGE_UNAVAILABLE)).not.toBeNull();
    expect(fieldValue("Type").textContent).toBe("Message");
    expect(screen.getByText("Report details")).not.toBeNull();
    expect(fieldValue("Reason category").textContent).toBe("Harassment or bullying");
    expect(screen.getByRole("button", { name: REPORT_ACTION_LABELS.dismissed })).not.toBeNull();
  });

  it("a report handed over from the queue reads the message from the single-report read, loading first", async () => {
    let resolve!: (r: Report) => void;
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockReturnValue(new Promise((res) => (resolve = res)));
    const r = report(); // the queue row: no reportedMessage, no holds
    renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    expect(screen.getByText("Loading the reported message…")).not.toBeNull();
    expect(screen.queryByText(REPORTED_MESSAGE_UNAVAILABLE)).toBeNull();
    resolve(report({ holds: [], reportedMessage: message() }));
    expect((await screen.findByText(MESSAGE_TEXT)).textContent).toBe(MESSAGE_TEXT);
    expect(screen.queryByText("Loading the reported message…")).toBeNull();
  });

  it("when that read fails the page says the message is unavailable instead of loading for ever", async () => {
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "down"));
    renderDetail(<ReportDetailPage />, report());
    expect(await screen.findByText(REPORTED_MESSAGE_UNAVAILABLE)).not.toBeNull();
    expect(screen.getByText("Report details")).not.toBeNull();
  });

  it("a direct visit reads the message, and a server answer without one reads as unavailable", async () => {
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockResolvedValueOnce(report({ reportedMessage: message() }));
    const first = renderDetail(<ReportDetailPage />, report(), false);
    expect((await screen.findByText(MESSAGE_TEXT)).textContent).toBe(MESSAGE_TEXT);
    first.unmount();

    vi.mocked(getReportById).mockResolvedValueOnce(report());
    renderDetail(<ReportDetailPage />, report(), false);
    expect(await screen.findByText(REPORTED_MESSAGE_UNAVAILABLE)).not.toBeNull();
  });

  it("the message text is never in a title attribute or the page title", async () => {
    const r = report({
      reportedMessage: message({ editedAt: "2026-11-02T08:09:00.000Z", originalContentText: ORIGINAL_TEXT }),
    });
    const { container } = renderDetail(<ReportDetailPage />, r);
    await screen.findByText("Reported content");
    for (const el of Array.from(container.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title")).not.toContain("Training is at 7am");
      expect(el.getAttribute("title")).not.toContain("useless");
    }
    expect(document.title).not.toContain("Training");
    expect(screen.getByRole("heading", { name: /Report #/, level: 1 }).textContent).not.toContain("Training");
  });

  it("has no Delete message control, and says what Remove Content does to a message (B-289)", async () => {
    renderDetail(<ReportDetailPage />, report({ reportedMessage: message() }));
    await screen.findByText("Reported content");
    expect(screen.queryByRole("button", { name: /delete message/i })).toBeNull();
    expect(screen.queryByText(/can’t delete a message yet/i)).toBeNull();
    expect(screen.getByText(/Remove Content hides it from everyone but you and the other moderators/i)).toBeTruthy();
  });

  it("leaves every action as it is: the same buttons as any other report, none for a room", async () => {
    renderDetail(<ReportDetailPage />, report({ reportedMessage: message() }));
    await screen.findByText("Reported content");
    for (const label of [
      REPORT_ACTION_LABELS.content_removed,
      REPORT_ACTION_LABELS.warning_issued,
      REPORT_ACTION_LABELS.user_suspended,
      REPORT_ACTION_LABELS.dismissed,
    ]) {
      expect(screen.getByRole("button", { name: label })).not.toBeNull();
    }
    expect(screen.queryByRole("button", { name: REPORT_ACTION_LABELS.room_deactivated })).toBeNull();
  });

  it("an action on a message report is the same PATCH as for any report", async () => {
    vi.mocked(actionReport).mockResolvedValueOnce(report());
    renderDetail(<ReportDetailPage />, report({ reportedMessage: message() }));
    await screen.findByText("Reported content");
    fireEvent.click(screen.getByRole("button", { name: REPORT_ACTION_LABELS.dismissed }));
    await waitFor(() => expect(actionReport).toHaveBeenCalledWith("report-open-1234", "dismissed"));
  });

  it("a non-message report is unchanged: no message block and no message note", async () => {
    renderDetail(<ReportDetailPage />, report({ targetType: "post", targetId: "post-1" }));
    await screen.findByText("Reported content");
    expect(screen.queryByText("Message text")).toBeNull();
    expect(screen.queryByText(/can’t delete a message/i)).toBeNull();
    expect(fieldValue("Type").textContent).toBe("Post");
  });
});

describe("Moderation Queue: message reports", () => {
  it("labels the row 'Message' and never shows message text, in the row or its tooltips", async () => {
    // The queue answer carries no message, but even a row that somehow did must not draw it.
    const row = { ...report({ id: "m-1" }), reportedMessage: message() } as Report;
    vi.mocked(listReports).mockResolvedValueOnce({ items: [row], nextCursor: null });
    const { container } = render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Message", { selector: "span" })).not.toBeNull();
    expect(container.textContent).not.toContain("Training is at 7am");
    for (const el of Array.from(container.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("Training is at 7am");
    }
  });
});
