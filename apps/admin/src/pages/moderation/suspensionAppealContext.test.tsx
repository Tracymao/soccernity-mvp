// B-295 (Decision Log #485, #486, #491, #492; Figma pass U, docs/figma-pass-u-report.md): the admin screens for a
// suspension recorded on a report, an appeal recorded on the suspended person's behalf, and the hidden message
// context. The server decides every rule (which targets can be suspended, the appeal window, who may decide an
// appeal, who may see the context); these tests check the pages offer, show and hand over exactly what it returns.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return {
    ...actual,
    listReports: vi.fn(),
    getReportById: vi.fn(),
    actionReport: vi.fn(),
    recordAppeal: vi.fn(),
    decideAppeal: vi.fn(),
  };
});

import {
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  REPORT_ACTION_LABELS,
  REPORT_TARGET_TYPES,
  USER_SUSPENSION_TARGET_TYPES,
  actionReport,
  actionsForTarget,
  decideAppeal,
  getReportById,
  isUserSuspensionTarget,
  recordAppeal,
  type Report,
  type ReportedMessage,
} from "../../api/moderation";
import AppealReviewPage from "./AppealReviewPage";
import ReportDetailPage from "./ReportDetailPage";
import { CONTEXT_HIDDEN_MESSAGE } from "./ContextMessagesCard";
import { APPEAL_REASON_REQUIRED_MESSAGE } from "./RecordAppealDialog";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getReportById).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(recordAppeal).mockReset();
  vi.mocked(decideAppeal).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "user",
    targetId: "user-9",
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

function suspended(overrides: Partial<Report> = {}): Report {
  return report({
    status: "actioned",
    actionTaken: "user_suspended",
    reviewedByAdminId: "admin-A",
    reviewedAt: "2026-11-02T11:00:00.000Z",
    ...overrides,
  });
}

function renderDetail(r: Report) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: { report: r } }]}>
      <Routes>
        <Route path="/moderation/reports/:id" element={<ReportDetailPage />} />
        <Route path="/moderation" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderAppeal(r: Report) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/moderation/appeals/${r.id}`, state: { report: r } }]}>
      <Routes>
        <Route path="/moderation/appeals/:id" element={<AppealReviewPage />} />
        <Route path="/moderation" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const suspendButton = () => screen.queryByRole("button", { name: REPORT_ACTION_LABELS.user_suspended });
const recordAppealButton = () => screen.queryByRole("button", { name: "Record an appeal" });
const vettingError = (message = "Restricted") =>
  new AdminApiError(403, message, { code: CHILD_SAFETY_VETTING_REQUIRED_CODE });

// ---- which reports offer Suspend User --------------------------------------

describe("which targets offer Suspend User", () => {
  it.each(["user", "post", "comment", "message"])("is offered for a %s report", async (targetType) => {
    renderDetail(report({ targetType }));
    await screen.findByText("Take action");
    expect(suspendButton()).not.toBeNull();
  });

  it.each(["banter_room", "grassroots_team", "fixture"])("is not offered for a %s report", async (targetType) => {
    renderDetail(report({ targetType }));
    await screen.findByText("Take action");
    expect(suspendButton()).toBeNull();
    // Warn and Dismiss are still there, and the page says why Suspend is missing.
    expect(screen.getByRole("button", { name: REPORT_ACTION_LABELS.warning_issued })).toBeTruthy();
    expect(screen.getByText(/Suspend User is not offered on/)).toBeTruthy();
  });

  it("mirrors the server's list of suspendable targets and no other", () => {
    expect([...USER_SUSPENSION_TARGET_TYPES]).toEqual(["user", "post", "comment", "message"]);
    for (const type of REPORT_TARGET_TYPES) {
      expect(isUserSuspensionTarget(type)).toBe(["user", "post", "comment", "message"].includes(type));
      expect(actionsForTarget(type).includes("user_suspended")).toBe(isUserSuspensionTarget(type));
    }
    expect(isUserSuspensionTarget("enquiry")).toBe(false);
  });
});

// ---- the confirmation, the result and the restricted states ----------------

describe("Suspend User on a report", () => {
  it("asks first: pressing Suspend User opens the confirmation and sends nothing", async () => {
    renderDetail(report());
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);

    const dialog = await screen.findByRole("dialog", { name: "Suspend this account?" });
    expect(within(dialog).getByText(/They can’t sign in, and every session they have ends now\./)).toBeTruthy();
    expect(within(dialog).getByText(/Engagement points they earned from views, likes and comments are removed\./)).toBeTruthy();
    expect(within(dialog).getByText(/their guardian is told once/)).toBeTruthy();
    expect(within(dialog).getByText(/this report’s category/)).toBeTruthy();
    expect(within(dialog).getByText(/reinstated automatically/)).toBeTruthy();
    // A report suspension takes its reason from the report, so no category is asked for here.
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(actionReport).not.toHaveBeenCalled();
  });

  it("names whose account it is, by what the report is about", async () => {
    renderDetail(report({ targetType: "post" }));
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    expect(await screen.findByText(/Suspend the account of the author of the reported post\?/)).toBeTruthy();
  });

  it("Cancel closes the dialog without recording anything", async () => {
    renderDetail(report());
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(actionReport).not.toHaveBeenCalled();
    expect(screen.getByText("Take action")).toBeTruthy();
  });

  it("confirming records user_suspended and shows the Account suspended state", async () => {
    vi.mocked(actionReport).mockResolvedValueOnce(suspended());
    renderDetail(report());
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(actionReport).toHaveBeenCalledWith("report-open-1234", "user_suspended"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Account suspended", { selector: ".mod-pill" })).toBeTruthy();
    expect(screen.getByText(/The account can no longer sign in and has been emailed\./)).toBeTruthy();
    // The take-action buttons are gone, and the report offers Record an appeal.
    expect(screen.queryByText("Take action")).toBeNull();
    expect(recordAppealButton()).not.toBeNull();
  });

  it("a 403 child-safety-vetting answer closes the dialog and shows the restricted state", async () => {
    vi.mocked(actionReport).mockRejectedValueOnce(vettingError());
    renderDetail(report({ targetType: "message" }));
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend account" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another 4xx shows the server's message in the dialog and keeps it open", async () => {
    vi.mocked(actionReport).mockRejectedValueOnce(new AdminApiError(409, "This account is already suspended."));
    renderDetail(report());
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend account" }));
    expect(await screen.findByText("This account is already suspended.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Suspend this account?" })).toBeTruthy();
  });

  it("a server error shows a fixed line, not the server's text", async () => {
    vi.mocked(actionReport).mockRejectedValueOnce(new AdminApiError(500, "stack trace goes here"));
    renderDetail(report());
    await screen.findByText("Take action");
    fireEvent.click(suspendButton()!);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend account" }));
    expect(await screen.findByText("Couldn’t suspend this account. Please try again.")).toBeTruthy();
    expect(screen.queryByText("stack trace goes here")).toBeNull();
  });
});

// ---- Record an appeal ------------------------------------------------------

describe("Record an appeal on someone's behalf", () => {
  it("is offered only on an actioned suspension that has no appeal", async () => {
    const { unmount } = renderDetail(suspended());
    await screen.findByText("Reported content");
    expect(recordAppealButton()).not.toBeNull();
    unmount();

    // A different action: no.
    const other = renderDetail(
      report({ status: "actioned", actionTaken: "warning_issued", reviewedAt: "2026-11-02T11:00:00.000Z" }),
    );
    await screen.findByText("Reported content");
    expect(recordAppealButton()).toBeNull();
    other.unmount();

    // A suspension that already has an appeal: no.
    const appealed = renderDetail(suspended({ appealStatus: "pending", appealReason: "x", appealedAt: "2026-11-03T09:00:00.000Z" }));
    await screen.findByText("Reported content");
    expect(recordAppealButton()).toBeNull();
    appealed.unmount();

    // Still open: no.
    renderDetail(report());
    await screen.findByText("Take action");
    expect(recordAppealButton()).toBeNull();
  });

  it("an empty reason shows the required message and sends nothing", async () => {
    renderDetail(suspended());
    await screen.findByText("Reported content");
    fireEvent.click(recordAppealButton()!);
    const dialog = await screen.findByRole("dialog", { name: "Record an appeal" });
    expect(within(dialog).getByText(/Report #report-o/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record appeal" }));

    expect(await within(dialog).findByText(APPEAL_REASON_REQUIRED_MESSAGE)).toBeTruthy();
    expect(recordAppeal).not.toHaveBeenCalled();
  });

  it("records the appeal with the trimmed reason and shows Pending — recorded by staff", async () => {
    vi.mocked(recordAppeal).mockResolvedValueOnce(
      suspended({
        appealStatus: "pending",
        appealReason: "Sent by mistake.",
        appealedAt: "2026-11-03T09:00:00.000Z",
        appealRecordedByStaff: true,
      }),
    );
    renderDetail(suspended());
    await screen.findByText("Reported content");
    fireEvent.click(recordAppealButton()!);
    const dialog = await screen.findByRole("dialog", { name: "Record an appeal" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "  Sent by mistake.  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record appeal" }));

    await waitFor(() => expect(recordAppeal).toHaveBeenCalledWith("report-open-1234", "Sent by mistake."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Pending — recorded by staff", { selector: ".mod-pill" })).toBeTruthy();
    expect(screen.getByText(/Appeal recorded for the account\./)).toBeTruthy();
    // One appeal per report: the button is gone.
    expect(recordAppealButton()).toBeNull();
  });

  it("shows the server's window-closed message in the dialog", async () => {
    vi.mocked(recordAppeal).mockRejectedValueOnce(
      new AdminApiError(403, "The time allowed for appealing this report has passed.", { code: "appeal_window_closed" }),
    );
    renderDetail(suspended());
    await screen.findByText("Reported content");
    fireEvent.click(recordAppealButton()!);
    const dialog = await screen.findByRole("dialog", { name: "Record an appeal" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Too late?" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record appeal" }));

    expect(await within(dialog).findByText("The time allowed for appealing this report has passed.")).toBeTruthy();
    // The typed reason is kept.
    expect((within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe("Too late?");
  });

  it("a 403 child-safety-vetting answer closes the dialog and shows the restricted state", async () => {
    vi.mocked(recordAppeal).mockRejectedValueOnce(vettingError());
    renderDetail(suspended());
    await screen.findByText("Reported content");
    fireEvent.click(recordAppealButton()!);
    const dialog = await screen.findByRole("dialog", { name: "Record an appeal" });
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Please review." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record appeal" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ---- the appeal review screen ----------------------------------------------

describe("Appeal Review for a staff-recorded appeal", () => {
  const recorded = () =>
    suspended({
      appealStatus: "pending",
      appealReason: "Sent by mistake.",
      appealedAt: "2026-11-03T09:00:00.000Z",
      appealRecordedByStaff: true,
    });

  it("says staff recorded it and shows the Pending — recorded by staff pill", async () => {
    renderAppeal(recorded());
    expect(await screen.findByText("Appeal recorded by staff")).toBeTruthy();
    expect(screen.getByText("Pending — recorded by staff", { selector: ".mod-pill" })).toBeTruthy();
    expect(screen.getByText(/The staff member who recorded it cannot decide it\./)).toBeTruthy();
  });

  it("shows the server's message when the recorder (or the actioner) tries to decide", async () => {
    vi.mocked(decideAppeal).mockRejectedValueOnce(
      new AdminApiError(403, "The admin who recorded this appeal may not also decide it.", {
        code: "appeal_recorder_cannot_decide",
      }),
    );
    renderAppeal(recorded());
    fireEvent.click(await screen.findByRole("button", { name: "Overturn Decision" }));
    expect(await screen.findByText("The admin who recorded this appeal may not also decide it.")).toBeTruthy();
    expect(screen.queryByText("queue")).toBeNull();
  });

  it("an appeal the person made themselves does not carry the staff wording", async () => {
    renderAppeal(suspended({ appealStatus: "pending", appealReason: "Mine.", appealedAt: "2026-11-03T09:00:00.000Z" }));
    expect(await screen.findByText("Appeal submitted by the reported user")).toBeTruthy();
    expect(screen.queryByText("Pending — recorded by staff")).toBeNull();
    expect(screen.queryByText(/Staff recorded this appeal/)).toBeNull();
  });
});

// ---- hidden message context ------------------------------------------------

describe("Hidden message context", () => {
  const edited = (): ReportedMessage => ({
    id: "m-reported",
    sentAt: "2026-11-02T08:05:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    contentText: "You are useless, quit the team.",
    originalContentText: null,
    editedAt: "2026-11-02T08:09:00.000Z",
    deletedForEveryone: false,
  });

  it("shows the reported message, the Edited row and the one callout, and nothing of the context", async () => {
    renderDetail(
      report({
        targetType: "message",
        reportedMessage: edited(),
        contextMessages: [],
        contextHidden: true,
      }),
    );
    expect(await screen.findByText("You are useless, quit the team.")).toBeTruthy();
    expect(screen.getByText("Yes, at", { exact: false, selector: ".mod-field__value" })).toBeTruthy();
    expect(screen.getByText(CONTEXT_HIDDEN_MESSAGE)).toBeTruthy();
    // No original text, and the "none were added" line is not shown either (it would be untrue).
    expect(screen.queryByText("Original text (before the edit)")).toBeNull();
    expect(screen.queryByText(/The reporter added no messages/)).toBeNull();
  });

  it("without the flag the callout is not shown", async () => {
    renderDetail(report({ targetType: "message", reportedMessage: edited(), contextMessages: [], contextHidden: false }));
    await screen.findByText("You are useless, quit the team.");
    expect(screen.queryByText(CONTEXT_HIDDEN_MESSAGE)).toBeNull();
  });
});
