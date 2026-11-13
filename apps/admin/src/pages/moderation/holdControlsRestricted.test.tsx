// B-308 (Decision Log #502 (a)): on a message report whose thread involves a child, an admin who is not
// child-safety vetted is not shown the three hold controls (place bad faith, place legal, lift); a line says why.
// The page acts on the report's contextHidden flag (B-293) and makes no extra call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, getReportById: vi.fn(), placeBadFaithHold: vi.fn(), placeLegalHold: vi.fn(), liftHold: vi.fn() };
});

import {
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  getReportById,
  placeLegalHold,
  type HoldView,
  type Report,
  type ReportedMessage,
} from "../../api/moderation";
import ReportDetailPage from "./ReportDetailPage";
import { HOLD_CONTROLS_RESTRICTED_MESSAGE } from "./holdActions";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getReportById).mockReset();
  vi.mocked(placeLegalHold).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

const REPORT_ID = "1a2b3c4d-0000-4000-8000-000000001042";
const BAD_FAITH = "Reporter acted in bad faith";

function message(): ReportedMessage {
  return {
    id: "msg-1",
    sentAt: "2026-11-02T08:05:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    contentText: "Training is at 7am.",
    originalContentText: null,
    editedAt: null,
    deletedForEveryone: false,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: REPORT_ID,
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

// A single-report read of a message report: the flag and the message arrive together.
function messageReport(contextHidden: boolean, overrides: Partial<Report> = {}): Report {
  return report({ reportedMessage: message(), contextMessages: [], contextHidden, holds: [], ...overrides });
}

function hold(overrides: Partial<HoldView> = {}): HoldView {
  return {
    id: "hold-1",
    userId: "user-1",
    type: "legal_hold",
    reportId: REPORT_ID,
    placedBy: "admin-1",
    placedAt: "2026-10-14T09:00:00.000Z",
    expiresAt: null,
    liftedAt: null,
    ...overrides,
  };
}

function renderDetail(r: Report) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: { report: r } }]}>
      <Routes>
        <Route path="/moderation/reports/:id" element={<ReportDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const holdButtons = () => [
  screen.queryByRole("button", { name: BAD_FAITH }),
  screen.queryByRole("button", { name: "Legal hold" }),
];
const lift = () => screen.queryAllByRole("button", { name: /^Lift hold/ });
const restrictedLine = () => screen.queryByTestId("hold-controls-restricted");

describe("hold controls on a message report that involves a child (admin not vetted)", () => {
  it("open report: no hold buttons, no callout, the restricted line instead; the report actions stay", async () => {
    renderDetail(messageReport(true));
    await screen.findByText("Take action");
    expect(holdButtons()).toEqual([null, null]);
    expect(restrictedLine()?.textContent).toBe(HOLD_CONTROLS_RESTRICTED_MESSAGE);
    expect(HOLD_CONTROLS_RESTRICTED_MESSAGE).toBe(
      "Holds on this report need a child-safety-vetted admin (Settings › Roles). [COPY PENDING LEGAL REVIEW]",
    );
    expect(screen.queryByText(/Both ask for confirmation first/)).toBeNull();
    // Not this change's concern: the report actions are drawn as before.
    expect(screen.getByRole("button", { name: "Dismiss Report" })).not.toBeNull();
    // Viewing is unchanged (Decision Log #486): the message and the hidden-context line are still there.
    expect(screen.getByText("Training is at 7am.")).not.toBeNull();
    expect(screen.getByText("Context hidden: this involves a child. [COPY PENDING LEGAL REVIEW]")).not.toBeNull();
  });

  it("an already-actioned report: no hold buttons in Case-level actions, the line instead", async () => {
    renderDetail(messageReport(true, { status: "actioned", actionTaken: "content_removed", reviewedByAdminId: "a" }));
    await screen.findByText("Case-level actions");
    expect(holdButtons()).toEqual([null, null]);
    expect(restrictedLine()).not.toBeNull();
    expect(screen.queryByText(/Both ask for confirmation first/)).toBeNull();
  });

  it("an active hold is still reported on the page, but there is no Lift hold control", async () => {
    renderDetail(messageReport(true, { holds: [hold(), hold({ id: "hold-2", type: "bad_faith" })] }));
    await screen.findByLabelText("Active holds");
    expect(lift()).toHaveLength(0);
    expect(restrictedLine()).not.toBeNull();
    expect(screen.getAllByText(/Active since/)).toHaveLength(2);
  });
});

describe("hold controls are unchanged everywhere else", () => {
  it("a vetted admin on a child-involved message report (contextHidden false): buttons, callout and Lift hold", async () => {
    renderDetail(messageReport(false, { holds: [hold()] }));
    expect(await screen.findByRole("button", { name: BAD_FAITH })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    expect(screen.getByText(/Both ask for confirmation first/)).not.toBeNull();
    expect(lift()).toHaveLength(1);
    expect(restrictedLine()).toBeNull();
  });

  it("an adults-only message report reads the same as a vetted admin's (the server sends contextHidden false)", async () => {
    renderDetail(messageReport(false));
    expect(await screen.findByRole("button", { name: BAD_FAITH })).not.toBeNull();
    expect(restrictedLine()).toBeNull();
  });

  it("a non-message report shows the controls, whatever the flag (it only exists on message reports)", async () => {
    renderDetail(report({ targetType: "post", targetId: "post-1", holds: [hold()], contextHidden: true }));
    expect(await screen.findByRole("button", { name: BAD_FAITH })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    expect(lift()).toHaveLength(1);
    expect(restrictedLine()).toBeNull();
  });
});

describe("a message report handed over from the queue (no flag yet)", () => {
  it("holds the controls back until the single-report read answers, then shows them for a vetted admin", async () => {
    let resolve!: (r: Report) => void;
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockReturnValue(new Promise((res) => (resolve = res)));
    renderDetail(report()); // queue row: no message, no flag, no holds
    await screen.findByText("Take action");
    expect(holdButtons()).toEqual([null, null]);
    expect(restrictedLine()).toBeNull(); // nothing is claimed while the answer is pending
    resolve(messageReport(false, { holds: [hold()] }));
    expect(await screen.findByRole("button", { name: BAD_FAITH })).not.toBeNull();
    expect(lift()).toHaveLength(1);
    expect(restrictedLine()).toBeNull();
  });

  it("shows the restricted line, never the buttons, when that read says the context is hidden", async () => {
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockResolvedValue(messageReport(true));
    renderDetail(report());
    expect(await screen.findByTestId("hold-controls-restricted")).not.toBeNull();
    expect(holdButtons()).toEqual([null, null]);
    expect(getReportById).toHaveBeenCalledTimes(1); // no extra call for this
  });

  it("falls back to the controls when that read fails; the server's refusal is then the safety net", async () => {
    vi.mocked(getReportById).mockReset();
    vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "down"));
    vi.mocked(placeLegalHold).mockRejectedValue(
      new AdminApiError(403, "This action requires a child-safety-vetted admin.", {
        statusCode: 403,
        error: "Forbidden",
        code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
        message: "This action requires a child-safety-vetted admin.",
      }),
    );
    renderDetail(report());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog", { name: "Legal hold" });
    fireEvent.change(dialog.querySelector("textarea, input")!, { target: { value: "A good enough reason here." } });
    fireEvent.click(screen.getByRole("button", { name: "Place legal hold" }));
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    await waitFor(() => expect(placeLegalHold).toHaveBeenCalled());
  });
});
