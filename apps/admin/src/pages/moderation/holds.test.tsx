// B-045 (Decision Log #398 D1, #403 item 8): the Held investigations page, the two case-level hold actions
// on Report Detail and Appeal Review, the shared confirmation dialog and the hold-active state.
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useRoutes } from "react-router";
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
    placeBadFaithHold: vi.fn(),
    placeLegalHold: vi.fn(),
    liftHold: vi.fn(),
  };
});
vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, listHeldInvestigations: vi.fn() };
});
vi.mock("../../api/adminAuth", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminProfile: vi.fn(),
  AdminAuthError: class extends Error {},
}));

import {
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  getReportById,
  liftHold,
  listReports,
  placeBadFaithHold,
  placeLegalHold,
  type HoldView,
  type Report,
} from "../../api/moderation";
import { listHeldInvestigations, type HeldInvestigation } from "../../api/adminUsers";
import { getAdminProfile } from "../../api/adminAuth";
import { AdminAuthProvider } from "../../auth/AdminAuthContext";
import { adminRoutes } from "../../app/routes";
import HeldInvestigationsPage from "./HeldInvestigationsPage";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";
import AppealReviewPage from "./AppealReviewPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.mocked(listReports).mockReset();
  vi.mocked(getReportById).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
  vi.mocked(placeBadFaithHold).mockReset();
  vi.mocked(placeLegalHold).mockReset();
  vi.mocked(liftHold).mockReset();
  vi.mocked(liftHold).mockImplementation(async (id) => ({
    hold: { ...hold({ id }), liftedAt: "2026-10-30T10:00:00.000Z" },
  }));
  vi.mocked(listHeldInvestigations).mockReset();
  vi.mocked(getAdminProfile).mockReset();
});

const TAG = "[COPY PENDING LEGAL REVIEW]";
const REPORT_ID = "1a2b3c4d-0000-4000-8000-000000001042";
const GOOD_REASON = "Counsel confirmed the hold is no longer needed.";

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

function renderAt(ui: ReactNode, routePath: string, initialEntry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function confirmLift(reason = GOOD_REASON) {
  const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
  fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: reason } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lift hold" }));
  return dialog;
}

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "1a2b3c4d-0000-4000-8000-000000001042",
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

function appealReport(overrides: Partial<Report> = {}): Report {
  return baseReport({
    status: "actioned",
    reviewedByAdminId: "admin-A",
    reviewedAt: "2026-09-14T12:00:00.000Z",
    actionTaken: "content_removed",
    appealStatus: "pending",
    appealReason: "That wasn't meant as abuse.",
    appealedAt: "2026-09-14T18:00:00.000Z",
    ...overrides,
  });
}

function hold(overrides: Partial<HoldView> = {}): HoldView {
  return {
    id: "hold-1",
    userId: "user-1",
    type: "legal_hold",
    reportId: "1a2b3c4d-0000-4000-8000-000000001042",
    placedBy: "admin-1",
    placedAt: "2026-10-14T09:00:00.000Z",
    expiresAt: null,
    liftedAt: null,
    ...overrides,
  };
}

function held(n: number, overrides: Partial<HeldInvestigation> = {}): HeldInvestigation {
  return {
    userId: `6b1f5f2e-4b3a-4c9d-9e21-2f7c1a8d4e0${n}`,
    displayName: `Held person ${n}`,
    email: `held${n}@example.com`,
    heldSince: "2026-06-12T09:00:00.000Z",
    daysHeld: 120 + n,
    holdType: "open_report",
    isAdminHold: false,
    holdId: null,
    reportId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------
// Held investigations
// ---------------------------------------------------------------------------------------------------

describe("HeldInvestigationsPage", () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/moderation/held-investigations"]}>
        <HeldInvestigationsPage />
      </MemoryRouter>,
    );
  }

  it("lists the held accounts with the drawn columns, hold-type markers and the threshold pill", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({
      thresholdDays: 90,
      items: [
        held(1, { holdType: "open_report" }),
        held(2, { holdType: "legal_hold", isAdminHold: true, holdId: "hold-2", reportId: REPORT_ID }),
        held(3, { holdType: "bad_faith", isAdminHold: true, holdId: "hold-3", reportId: REPORT_ID }),
      ],
    });
    renderPage();

    expect(await screen.findByText("Held person 1")).not.toBeNull();
    expect(listHeldInvestigations).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("Held more than 90 days")).not.toBeNull();

    const table = screen.getByRole("table", { name: "Held investigations" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "User",
      "Email",
      "User ID",
      "Held since",
      "Days held",
      "Hold type",
      "Action",
    ]);
    expect(within(table).getByText("held1@example.com")).not.toBeNull();
    expect(within(table).getByText("6b1f5f2e…1a8d4e01")).not.toBeNull();
    expect(within(table).getAllByText("12 Jun 2026").length).toBe(3);
    expect(within(table).getByText("121")).not.toBeNull();
    expect(within(table).getByText("Open report")).not.toBeNull();
    expect(within(table).getByText("Legal hold")).not.toBeNull();
    expect(within(table).getByText("Reporter acted in bad faith")).not.toBeNull();
  });

  it("draws Lift hold on the rows that carry a hold id and a dash on the others", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({
      thresholdDays: 90,
      items: [
        held(1),
        held(2, { holdType: "legal_hold", isAdminHold: true, holdId: "hold-2", reportId: REPORT_ID }),
        held(3, { holdType: "bad_faith", isAdminHold: true, holdId: "hold-3", reportId: null }),
      ],
    });
    renderPage();
    await screen.findByText("Held person 1");
    const table = screen.getByRole("table", { name: "Held investigations" });
    expect(within(table).getAllByRole("button", { name: /^Lift hold for/ }).map((b) => b.textContent)).toEqual([
      "Lift hold",
      "Lift hold",
    ]);
    expect(within(table).queryByRole("button", { name: "Lift hold for Held person 1" })).toBeNull();
    // The report-derived row has a dash in its Action cell, not a control.
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    expect(within(rows[1]).getAllByRole("cell").at(-1)?.textContent).toBe("—");
  });

  function renderLiftable(overrides: Partial<HeldInvestigation> = {}) {
    vi.mocked(listHeldInvestigations).mockResolvedValue({
      thresholdDays: 90,
      items: [held(2, { holdType: "legal_hold", isAdminHold: true, holdId: "hold-2", reportId: REPORT_ID, ...overrides })],
    });
    return renderPage();
  }

  it("opens the Lift hold confirmation with a required reason, the report number and the tagged help line", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
    // One account's hold: the drawn "releases both accounts" sentence is not shown here.
    expect(within(dialog).getByText("Report #1a2b3c4d. Legal hold.")).not.toBeNull();
    expect(within(dialog).queryByText(/both accounts/)).toBeNull();
    expect(within(dialog).getByLabelText("Reason (required)")).not.toBeNull();
    expect(within(dialog).getByText(`The reason is saved to the audit record. ${TAG}`)).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Lift hold" })).not.toBeNull();
  });

  it("names a bad-faith hold, and leaves the report number out when the hold has no report", async () => {
    renderLiftable({ holdType: "bad_faith", reportId: null });
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
    expect(within(dialog).getByText("Reporter acted in bad faith.")).not.toBeNull();
  });

  it("will not send a reason that is too short, and shows the message", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    await confirmLift("too short");
    expect(await screen.findByText("Give a reason of at least 10 characters.")).not.toBeNull();
    expect(liftHold).not.toHaveBeenCalled();
  });

  it("limits the reason to 500 characters and sends exactly 500", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
    expect(within(dialog).getByLabelText("Reason (required)").getAttribute("maxlength")).toBe("500");
    await confirmLift("x".repeat(500));
    await waitFor(() => expect(liftHold).toHaveBeenCalledWith("hold-2", "x".repeat(500)));
  });

  it("sends exactly 10 characters", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    await confirmLift("1234567890");
    await waitFor(() => expect(liftHold).toHaveBeenCalledWith("hold-2", "1234567890"));
  });

  it("lifts that account's hold with the trimmed reason, closes the dialog and reads the list again", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    await confirmLift(`   ${GOOD_REASON}   `);
    await waitFor(() => expect(liftHold).toHaveBeenCalledWith("hold-2", GOOD_REASON));
    expect(liftHold).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(listHeldInvestigations).toHaveBeenCalledTimes(2));
  });

  it("drops the lifted row once the list comes back without it", async () => {
    vi.mocked(listHeldInvestigations)
      .mockResolvedValueOnce({
        thresholdDays: 90,
        items: [held(2, { holdType: "legal_hold", isAdminHold: true, holdId: "hold-2", reportId: REPORT_ID })],
      })
      .mockResolvedValueOnce({ thresholdDays: 90, items: [] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    await confirmLift();
    expect(await screen.findByText("No held investigations")).not.toBeNull();
    expect(screen.queryByText("Held person 2")).toBeNull();
  });

  it("keeps the dialog open with the server's message and the typed reason when the server refuses", async () => {
    const message = "This hold has already been lifted.";
    vi.mocked(liftHold).mockRejectedValueOnce(
      new AdminApiError(409, message, { statusCode: 409, code: "hold_already_lifted", message }),
    );
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await confirmLift();
    expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
    expect((within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe(GOOD_REASON);
    expect(listHeldInvestigations).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback line when the failure is not one of the server's own messages", async () => {
    vi.mocked(liftHold).mockRejectedValueOnce(new AdminApiError(500, "Internal"));
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await confirmLift();
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Couldn’t record that action. Please try again.");
  });

  it("shows the restricted notice, not a generic error, when the server says vetting is required", async () => {
    vi.mocked(liftHold).mockRejectedValueOnce(vettingRequiredError());
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    await confirmLift();
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables the dialog while the request is in flight and ignores a second submit and Escape", async () => {
    let resolve: (v: { hold: HoldView }) => void = () => {};
    vi.mocked(liftHold).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await confirmLift();
    const saving = await within(dialog).findByRole("button", { name: "Saving…" });
    expect(saving.hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(liftHold).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeNull();
    await act(async () => resolve({ hold: hold({ id: "hold-2" }) }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says nothing in the dialog about telling the held user", async () => {
    renderLiftable();
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold for Held person 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
    expect(dialog.textContent).not.toMatch(/notif|tell|told|email/i);
  });

  describe("keyboard and focus", () => {
    it("moves focus to the reason field, keeps Tab inside, and Escape closes and returns focus to the opener", async () => {
      renderLiftable();
      const opener = await screen.findByRole("button", { name: "Lift hold for Held person 2" });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (required)"));

      // Tab from the last control wraps to the first, and Shift+Tab back.
      const confirm = within(dialog).getByRole("button", { name: "Lift hold" });
      confirm.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(confirm);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(liftHold).not.toHaveBeenCalled();
    });

    it("Cancel gives focus back to the opener without calling the server", async () => {
      renderLiftable();
      const opener = await screen.findByRole("button", { name: "Lift hold for Held person 2" });
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(within(await screen.findByRole("dialog", { name: "Lift hold" })).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(liftHold).not.toHaveBeenCalled();
    });
  });

  it("explains that it is visibility only and never mentions notifying anyone", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [held(1)] });
    renderPage();
    await screen.findByText("Held person 1");
    expect(screen.getByText(/Visibility only\. A held account stays fully identifiable and login-blocked/)).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/notif/i);
  });

  it("shows hold types the frames do not draw as a plain outline pill with the type spelled out", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({
      thresholdDays: 90,
      items: [held(1, { holdType: "appeal_window" }), held(2, { holdType: "post_closure" })],
    });
    renderPage();
    expect(await screen.findByText("Appeal window")).not.toBeNull();
    expect(screen.getByText("Post closure")).not.toBeNull();
  });

  it("shows the loading line while the list is on its way", async () => {
    let resolve: (v: { thresholdDays: number; items: HeldInvestigation[] }) => void = () => {};
    vi.mocked(listHeldInvestigations).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    expect(screen.getByText("Loading the held investigations…")).not.toBeNull();
    expect(screen.queryByText("Held more than 90 days")).toBeNull();
    await act(async () => resolve({ thresholdDays: 90, items: [held(1)] }));
    expect(await screen.findByText("Held person 1")).not.toBeNull();
    expect(screen.queryByText("Loading the held investigations…")).toBeNull();
  });

  it("shows the empty state with the threshold in it", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [] });
    renderPage();
    expect(await screen.findByText("No held investigations")).not.toBeNull();
    expect(screen.getByText("No account has been held by an open report for more than 90 days.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("puts the server's threshold in the field when it is not 90", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 60, items: [] });
    renderPage();
    await screen.findByText("No held investigations");
    await waitFor(() => expect((screen.getByLabelText("Held for more than") as HTMLInputElement).value).toBe("60"));
    expect(screen.getByText("Held more than 60 days")).not.toBeNull();
  });

  it("applies a filter: asks for that many days and updates the pill", async () => {
    vi.mocked(listHeldInvestigations)
      .mockResolvedValueOnce({ thresholdDays: 90, items: [held(1)] })
      .mockResolvedValueOnce({ thresholdDays: 30, items: [held(1), held(2)] });
    renderPage();
    await screen.findByText("Held person 1");

    fireEvent.change(screen.getByLabelText("Held for more than"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    await waitFor(() => expect(listHeldInvestigations).toHaveBeenLastCalledWith(30));
    expect(await screen.findByText("Held person 2")).not.toBeNull();
    expect(screen.getByText("Held more than 30 days")).not.toBeNull();
  });

  it("accepts 0 and 3650", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [held(1)] });
    renderPage();
    await screen.findByText("Held person 1");
    for (const days of ["0", "3650"]) {
      fireEvent.change(screen.getByLabelText("Held for more than"), { target: { value: days } });
      fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
      await waitFor(() => expect(listHeldInvestigations).toHaveBeenLastCalledWith(Number(days)));
    }
    expect(screen.queryByText("Enter a whole number from 0 to 3650.")).toBeNull();
  });

  it.each(["4000", "-1", "1.5", "abc", "", "3651"])("refuses %j without asking the server", async (value) => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [held(1)] });
    renderPage();
    await screen.findByText("Held person 1");
    expect(listHeldInvestigations).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Held for more than"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter a whole number from 0 to 3650.");
    expect(screen.getByLabelText("Held for more than").getAttribute("aria-invalid")).toBe("true");
    expect(listHeldInvestigations).toHaveBeenCalledTimes(1);
  });

  it("clears the validation message after a good value is applied", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [held(1)] });
    renderPage();
    await screen.findByText("Held person 1");
    fireEvent.change(screen.getByLabelText("Held for more than"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Held for more than"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shows an error line when the list cannot be loaded, and Retry asks again", async () => {
    vi.mocked(listHeldInvestigations)
      .mockRejectedValueOnce(new AdminApiError(500, "boom"))
      .mockResolvedValueOnce({ thresholdDays: 90, items: [held(1)] });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t load the held investigations.");
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Held person 1")).not.toBeNull();
    expect(listHeldInvestigations).toHaveBeenCalledTimes(2);
  });

  it("links back to the moderation queue", async () => {
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [] });
    renderPage();
    await screen.findByText("No held investigations");
    expect(screen.getByRole("link", { name: "Back to moderation" }).getAttribute("href")).toBe("/moderation");
  });
});

describe("the way into Held investigations", () => {
  it("is a tab on the Moderation Queue", async () => {
    vi.mocked(listReports).mockResolvedValue({ items: [], nextCursor: null });
    render(
      <MemoryRouter>
        <ModerationQueuePage />
      </MemoryRouter>,
    );
    await screen.findByText("No open reports");
    expect(screen.getByRole("link", { name: "Held investigations" }).getAttribute("href")).toBe(
      "/moderation/held-investigations",
    );
  });

  it("is a real route behind the admin sign-in (session restored by the start-up cookie refresh, as routes.test.tsx does)", async () => {
    // B-247: the session lives in memory and is restored by POST /admin/auth/refresh; nothing is read from storage.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/admin/auth/refresh")) {
          return new Response(JSON.stringify({ accessToken: "acc-1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new TypeError("Failed to fetch");
      }),
    );
    vi.mocked(getAdminProfile).mockResolvedValue({
      id: "admin-1",
      email: "ada@soccernity.com",
      fullName: "Ada Lovelace",
      phone: null,
      role: "moderator",
      accountStatus: "active",
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(listHeldInvestigations).mockResolvedValue({ thresholdDays: 90, items: [held(1)] });

    function Tree() {
      return useRoutes(adminRoutes);
    }
    render(
      <MemoryRouter initialEntries={["/moderation/held-investigations"]}>
        <AdminAuthProvider>
          <Tree />
        </AdminAuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Held person 1", {}, { timeout: 10000 })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Held investigations" })).not.toBeNull();
  }, 20000);
});

// ---------------------------------------------------------------------------------------------------
// Report Detail
// ---------------------------------------------------------------------------------------------------

function renderReportDetail(report: Report) {
  return renderAt(<ReportDetailPage />, "/moderation/reports/:id", {
    pathname: `/moderation/reports/${report.id}`,
    state: { report },
  });
}

describe("ReportDetailPage case-level holds", () => {
  it("offers the two case-level actions beside the four report actions, with the drawn callout", async () => {
    renderReportDetail(baseReport());
    expect(await screen.findByRole("button", { name: "Reporter acted in bad faith" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    for (const label of ["Dismiss Report", "Remove Content", "Warn User", "Suspend User"]) {
      expect(screen.getByRole("button", { name: label })).not.toBeNull();
    }
    expect(
      screen.getByText(
        `Reporter acted in bad faith holds the reporter’s account in full for 6 months. Legal hold holds both accounts in full until an admin lifts it. Both ask for confirmation first. ${TAG}`,
      ),
    ).not.toBeNull();
  });

  it("opens the bad-faith confirmation with a required reason, the report number and the tagged wording", async () => {
    const report = baseReport();
    renderReportDetail(report);
    fireEvent.click(await screen.findByRole("button", { name: "Reporter acted in bad faith" }));

    const dialog = await screen.findByRole("dialog", { name: "Reporter acted in bad faith" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      within(dialog).getByText(`Report #1a2b3c4d. This holds the reporter’s account in full for 6 months. ${TAG}`),
    ).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason (required)")).not.toBeNull();
    expect(within(dialog).getByText(`The reason is saved to the audit record. ${TAG}`)).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Confirm bad faith" })).not.toBeNull();
    expect(placeBadFaithHold).not.toHaveBeenCalled();
  });

  it("opens the legal hold confirmation", async () => {
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog", { name: "Legal hold" });
    expect(
      within(dialog).getByText(`Report #1a2b3c4d. This holds both accounts in full until an admin lifts it. ${TAG}`),
    ).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Place legal hold" })).not.toBeNull();
  });

  it("says nothing in either dialog about telling the held user", async () => {
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toMatch(/notif|told|inform/i);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Reporter acted in bad faith" }));
    expect((await screen.findByRole("dialog")).textContent).not.toMatch(/notif|told|inform/i);
  });

  it.each([
    ["", "an empty reason"],
    ["short", "a reason under 10 characters"],
    ["         ", "a reason that is only spaces"],
    ["  nine ch  ", "a reason that is under 10 characters once trimmed"],
  ])("refuses %j (%s) without calling the server", async (value) => {
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe("Give a reason of at least 10 characters.");
    expect(placeLegalHold).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("limits the reason to 500 characters", async () => {
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const field = (await screen.findByLabelText("Reason (required)")) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
  });

  it("sends exactly 10 and exactly 500 characters", async () => {
    for (const length of [10, 500]) {
      const report = baseReport();
      vi.mocked(placeLegalHold).mockResolvedValueOnce({ holds: [hold()] });
      const { unmount } = renderReportDetail(report);
      fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "x".repeat(length) } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));
      await waitFor(() => expect(placeLegalHold).toHaveBeenLastCalledWith(report.id, "x".repeat(length)));
      unmount();
    }
  });

  it("places a bad-faith hold with the trimmed reason, stays on the page and shows the active hold", async () => {
    const report = baseReport();
    vi.mocked(placeBadFaithHold).mockResolvedValueOnce({
      holds: [hold({ id: "h-bf", type: "bad_faith", expiresAt: "2027-04-14T09:00:00.000Z" })],
    });
    renderReportDetail(report);
    fireEvent.click(await screen.findByRole("button", { name: "Reporter acted in bad faith" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), {
      target: { value: "  Made up the abuse claim to get a rival banned.  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm bad faith" }));

    await waitFor(() =>
      expect(placeBadFaithHold).toHaveBeenCalledWith(report.id, "Made up the abuse claim to get a rival banned."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const status = screen.getByLabelText("Active holds");
    expect(within(status).getByText("Reporter acted in bad faith")).not.toBeNull();
    expect(within(status).getByText("Active since 14 Oct 2026")).not.toBeNull();
    expect(screen.queryByTestId("loc")).toBeNull();
  });

  it("places a legal hold and shows one marker even though two accounts are held", async () => {
    const report = baseReport();
    vi.mocked(placeLegalHold).mockResolvedValueOnce({
      holds: [hold({ id: "h1", userId: "u1" }), hold({ id: "h2", userId: "u2", placedAt: "2026-10-14T09:00:01.000Z" })],
    });
    renderReportDetail(report);
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Police request received today." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));

    await waitFor(() => expect(placeLegalHold).toHaveBeenCalledWith(report.id, "Police request received today."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const status = screen.getByLabelText("Active holds");
    expect(within(status).getAllByText("Legal hold").length).toBe(1);
    expect(within(status).getByText("Active since 14 Oct 2026")).not.toBeNull();
  });

  it("shows both markers when a bad-faith and a legal hold are active", async () => {
    const report = baseReport();
    vi.mocked(getReportById).mockResolvedValue({
      ...report,
      holds: [hold({ id: "a", type: "legal_hold" }), hold({ id: "b", type: "bad_faith", placedAt: "2026-10-15T09:00:00.000Z" })],
    });
    renderReportDetail(report);
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Legal hold")).not.toBeNull();
    expect(within(status).getByText("Reporter acted in bad faith")).not.toBeNull();
    expect(within(status).getByText("Active since 15 Oct 2026")).not.toBeNull();
  });

  it("learns about an active hold from the single-report read when the queue handed the report over", async () => {
    const report = baseReport();
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold()] });
    renderReportDetail(report);
    await waitFor(() => expect(getReportById).toHaveBeenCalledWith(report.id));
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Legal hold")).not.toBeNull();
    expect(within(status).getByText("Active since 14 Oct 2026")).not.toBeNull();
  });

  it("shows no hold marker when no hold is active", async () => {
    const report = baseReport();
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [] });
    renderReportDetail(report);
    await waitFor(() => expect(getReportById).toHaveBeenCalled());
    expect(screen.queryByLabelText("Active holds")).toBeNull();
  });

  describe("Lift hold", () => {
    const TWO_LEGAL = [
      hold({ id: "hold-reporter", userId: "reporter" }),
      hold({ id: "hold-reported", userId: "reported", placedAt: "2026-10-14T09:00:01.000Z" }),
    ];

    async function renderWithHolds(holds: HoldView[], report = baseReport()) {
      vi.mocked(getReportById).mockResolvedValue({ ...report, holds });
      renderReportDetail(report);
      await screen.findByLabelText("Active holds");
    }

    it("draws Lift hold on the hold-active row, one per hold type, and none without a hold", async () => {
      await renderWithHolds([...TWO_LEGAL, hold({ id: "hold-bf", type: "bad_faith" })]);
      expect(screen.getAllByRole("button", { name: /^Lift hold: / }).map((b) => b.getAttribute("aria-label"))).toEqual([
        "Lift hold: Legal hold",
        "Lift hold: Reporter acted in bad faith",
      ]);
    });

    it("offers no Lift hold when no hold is active", async () => {
      const report = baseReport();
      vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [] });
      renderReportDetail(report);
      await waitFor(() => expect(getReportById).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: /^Lift hold/ })).toBeNull();
    });

    it("shows the drawn sentence in the dialog when a legal hold covers two accounts", async () => {
      await renderWithHolds(TWO_LEGAL);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
      expect(
        within(dialog).getByText(`Report #1a2b3c4d. Legal hold. Lifting the hold releases both accounts. ${TAG}`),
      ).not.toBeNull();
      expect(within(dialog).getByText(`The reason is saved to the audit record. ${TAG}`)).not.toBeNull();
    });

    it("does not claim two accounts when only one is held", async () => {
      await renderWithHolds([hold()]);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
      expect(within(dialog).getByText("Report #1a2b3c4d. Legal hold.")).not.toBeNull();
    });

    it("lifts every active hold of that type with the trimmed reason, one after another, and removes the row", async () => {
      await renderWithHolds(TWO_LEGAL);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      await confirmLift(`  ${GOOD_REASON}  `);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(vi.mocked(liftHold).mock.calls).toEqual([
        ["hold-reporter", GOOD_REASON],
        ["hold-reported", GOOD_REASON],
      ]);
      expect(screen.queryByLabelText("Active holds")).toBeNull();
      // Stays on the report.
      expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    });

    it("lifts only the type clicked and keeps the other hold-active row", async () => {
      await renderWithHolds([hold(), hold({ id: "hold-bf", type: "bad_faith" })]);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Reporter acted in bad faith" }));
      const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
      expect(within(dialog).getByText("Report #1a2b3c4d. Reporter acted in bad faith.")).not.toBeNull();
      await confirmLift();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(vi.mocked(liftHold).mock.calls).toEqual([["hold-bf", GOOD_REASON]]);
      const status = screen.getByLabelText("Active holds");
      expect(within(status).getByText("Legal hold")).not.toBeNull();
      expect(within(status).queryByText("Reporter acted in bad faith")).toBeNull();
    });

    it("shows the end date of a bad-faith hold, and none for a legal hold", async () => {
      await renderWithHolds([
        hold({ id: "hold-bf", type: "bad_faith", expiresAt: "2027-04-14T09:00:00.000Z" }),
        hold({ id: "hold-l", type: "legal_hold", expiresAt: null }),
      ]);
      const status = screen.getByLabelText("Active holds");
      expect(within(status).getAllByText(/^Ends /).map((n) => n.textContent)).toEqual(["Ends 14 Apr 2027"]);
      expect(within(status).getAllByText("Active since 14 Oct 2026").length).toBe(2);
    });

    it("will not send a reason that is too short", async () => {
      await renderWithHolds([hold()]);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      await confirmLift("short");
      expect(await screen.findByText("Give a reason of at least 10 characters.")).not.toBeNull();
      expect(liftHold).not.toHaveBeenCalled();
    });

    it("keeps the dialog open with the server's message and the typed reason when the server refuses", async () => {
      const message = "This hold has already run its course.";
      vi.mocked(liftHold).mockRejectedValueOnce(
        new AdminApiError(409, message, { statusCode: 409, code: "hold_expired", message }),
      );
      await renderWithHolds([hold({ id: "hold-bf", type: "bad_faith" })]);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Reporter acted in bad faith" }));
      const dialog = await confirmLift();
      expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
      expect((within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe(GOOD_REASON);
      expect(screen.getByLabelText("Active holds")).not.toBeNull();
    });

    it("when the second of two holds fails, the first leaves the row, the dialog stays, and a retry asks only for the rest", async () => {
      const message = "This hold has already been lifted.";
      // First attempt: first hold is lifted, second fails.
      vi.mocked(liftHold).mockReset();
      vi.mocked(liftHold)
        .mockResolvedValueOnce({ hold: hold({ id: "hold-reporter" }) })
        .mockRejectedValueOnce(new AdminApiError(409, message, { statusCode: 409, code: "hold_already_lifted", message }))
        .mockResolvedValueOnce({ hold: hold({ id: "hold-reported" }) });
      await renderWithHolds(TWO_LEGAL);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      const dialog = await confirmLift();
      expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
      // The row is still there (one account still held) and the dialog now speaks of one.
      expect(screen.getByLabelText("Active holds")).not.toBeNull();
      expect(liftHold).toHaveBeenCalledTimes(2);

      fireEvent.click(within(dialog).getByRole("button", { name: "Lift hold" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(vi.mocked(liftHold).mock.calls.map((c) => c[0])).toEqual(["hold-reporter", "hold-reported", "hold-reported"]);
      expect(screen.queryByLabelText("Active holds")).toBeNull();
    });

    it("shows the restricted notice, not a generic error, when the server says vetting is required", async () => {
      vi.mocked(liftHold).mockRejectedValueOnce(vettingRequiredError());
      await renderWithHolds([hold()], baseReport({ concernsMinor: true }));
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      await confirmLift();
      expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      // The hold is still active: nothing was changed.
      expect(screen.getByLabelText("Active holds")).not.toBeNull();
    });

    it("disables the dialog while the request is in flight", async () => {
      let resolve: (v: { hold: HoldView }) => void = () => {};
      vi.mocked(liftHold).mockReturnValueOnce(new Promise((r) => (resolve = r)));
      await renderWithHolds([hold()]);
      fireEvent.click(screen.getByRole("button", { name: "Lift hold: Legal hold" }));
      const dialog = await confirmLift();
      const saving = await within(dialog).findByRole("button", { name: "Saving…" });
      expect(saving.hasAttribute("disabled")).toBe(true);
      expect(within(dialog).getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
      fireEvent.submit(dialog);
      expect(liftHold).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ hold: hold() }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("moves focus to the reason field and Escape gives focus back to the Lift hold control", async () => {
      await renderWithHolds([hold()]);
      const opener = screen.getByRole("button", { name: "Lift hold: Legal hold" });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog", { name: "Lift hold" });
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (required)"));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.activeElement).toBe(opener);
      expect(liftHold).not.toHaveBeenCalled();
    });
  });

  it("keeps the dialog open with the server's message and the typed reason when the server refuses (409)", async () => {
    const message = "This report was not made by a signed-in account, so there is no account to hold.";
    vi.mocked(placeBadFaithHold).mockRejectedValueOnce(
      new AdminApiError(409, message, { statusCode: 409, code: "reporter_has_no_account", message }),
    );
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Reporter acted in bad faith" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm bad faith" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
    expect((within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe(
      "A reason that is long enough.",
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.queryByLabelText("Active holds")).toBeNull();
    // Can be tried again.
    expect(within(dialog).getByRole("button", { name: "Confirm bad faith" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the fallback line when the failure is not one of the server's own messages", async () => {
    vi.mocked(placeLegalHold).mockRejectedValueOnce(new AdminApiError(500, "Internal"));
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Couldn’t record that action. Please try again.");
  });

  it("shows the restricted state, not a generic error, when the server says vetting is required", async () => {
    vi.mocked(placeLegalHold).mockRejectedValueOnce(vettingRequiredError());
    renderReportDetail(baseReport({ concernsMinor: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));

    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables the dialog while the request is in flight", async () => {
    let resolve: (v: { holds: HoldView[] }) => void = () => {};
    vi.mocked(placeLegalHold).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));

    const saving = await within(dialog).findByRole("button", { name: "Saving…" });
    expect(saving.hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Close" }).hasAttribute("disabled")).toBe(true);
    // A second submit while saving is ignored.
    fireEvent.submit(dialog);
    expect(placeLegalHold).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ holds: [hold()] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Cancel and the close button leave without calling the server", async () => {
    renderReportDetail(baseReport());
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reporter acted in bad faith" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(placeLegalHold).not.toHaveBeenCalled();
    expect(placeBadFaithHold).not.toHaveBeenCalled();
  });

  describe("keyboard and focus", () => {
    it("moves focus into the dialog (the reason field) when it opens", async () => {
      renderReportDetail(baseReport());
      fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
      const dialog = await screen.findByRole("dialog");
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (required)"));
    });

    it("closes on Escape and gives focus back to the control that opened it", async () => {
      renderReportDetail(baseReport());
      const opener = await screen.findByRole("button", { name: "Reporter acted in bad faith" });
      opener.focus();
      fireEvent.click(opener);
      await screen.findByRole("dialog");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it("gives focus back to the opener after Cancel too", async () => {
      renderReportDetail(baseReport());
      const opener = await screen.findByRole("button", { name: "Legal hold" });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(document.activeElement).toBe(opener);
    });

    it("keeps Tab inside the dialog, wrapping from the last control to the first and back", async () => {
      renderReportDetail(baseReport());
      fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
      const dialog = await screen.findByRole("dialog");
      const close = within(dialog).getByRole("button", { name: "Close" });
      const confirm = within(dialog).getByRole("button", { name: "Place legal hold" });

      confirm.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(close);

      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(confirm);
    });

    it("pulls focus back in when it is somewhere outside the dialog", async () => {
      renderReportDetail(baseReport());
      const opener = await screen.findByRole("button", { name: "Legal hold" });
      fireEvent.click(opener);
      await screen.findByRole("dialog");
      opener.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      const dialog = screen.getByRole("dialog");
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("ignores Escape while a request is in flight", async () => {
      vi.mocked(placeLegalHold).mockReturnValueOnce(new Promise(() => {}));
      renderReportDetail(baseReport());
      fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));
      await within(dialog).findByRole("button", { name: "Saving…" });

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog")).not.toBeNull();
    });
  });

  it("offers the case-level actions as their own card on a report that was already reviewed", async () => {
    renderReportDetail(baseReport({ status: "actioned", actionTaken: "content_removed", reviewedAt: "2026-09-14T12:00:00.000Z" }));
    expect(await screen.findByText("Already reviewed")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Case-level actions" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reporter acted in bad faith" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss Report" })).toBeNull();
  });

  it("works on a report opened directly (no router state)", async () => {
    const report = baseReport();
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold({ type: "bad_faith" })] });
    renderAt(<ReportDetailPage />, "/moderation/reports/:id", `/moderation/reports/${report.id}`);
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Reporter acted in bad faith")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// Appeal Review
// ---------------------------------------------------------------------------------------------------

function renderAppeal(report: Report) {
  return renderAt(<AppealReviewPage />, "/moderation/appeals/:id", {
    pathname: `/moderation/appeals/${report.id}`,
    state: { report },
  });
}

describe("AppealReviewPage case-level holds", () => {
  it("offers the same two actions in a Case-level actions section, with the callout", async () => {
    renderAppeal(appealReport());
    expect(await screen.findByRole("heading", { name: "Case-level actions" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reporter acted in bad faith" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Legal hold" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Uphold Original Decision" })).not.toBeNull();
    expect(screen.getByText(/Both ask for confirmation first\./)).not.toBeNull();
  });

  it("reuses the same dialog, places the hold and shows it as active", async () => {
    const report = appealReport();
    vi.mocked(placeLegalHold).mockResolvedValueOnce({ holds: [hold()] });
    renderAppeal(report);
    fireEvent.click(await screen.findByRole("button", { name: "Legal hold" }));
    const dialog = await screen.findByRole("dialog", { name: "Legal hold" });
    expect(
      within(dialog).getByText(`Report #1a2b3c4d. This holds both accounts in full until an admin lifts it. ${TAG}`),
    ).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Counsel asked us to preserve both accounts." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Place legal hold" }));

    await waitFor(() =>
      expect(placeLegalHold).toHaveBeenCalledWith(report.id, "Counsel asked us to preserve both accounts."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const status = screen.getByLabelText("Active holds");
    expect(within(status).getByText("Legal hold")).not.toBeNull();
    // Stays on the appeal screen.
    expect(screen.getByRole("button", { name: "Overturn Decision" })).not.toBeNull();
  });

  it("shows an active hold the single-report read reports", async () => {
    const report = appealReport();
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold()] });
    renderAppeal(report);
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Active since 14 Oct 2026")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Lift hold: Legal hold" })).not.toBeNull();
  });

  it("lifts the hold from here with the same dialog and removes the hold-active row", async () => {
    const report = appealReport();
    vi.mocked(getReportById).mockResolvedValue({
      ...report,
      holds: [hold({ type: "bad_faith", id: "hold-bf", expiresAt: "2027-04-14T09:00:00.000Z" })],
    });
    renderAppeal(report);
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Ends 14 Apr 2027")).not.toBeNull();
    fireEvent.click(within(status).getByRole("button", { name: "Lift hold: Reporter acted in bad faith" }));
    await confirmLift();
    await waitFor(() => expect(liftHold).toHaveBeenCalledWith("hold-bf", GOOD_REASON));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByLabelText("Active holds")).toBeNull();
    // Stays on the appeal screen.
    expect(screen.getByRole("button", { name: "Overturn Decision" })).not.toBeNull();
  });

  it("shows the server's message inside the Lift hold dialog", async () => {
    const message = "This hold has already been lifted.";
    vi.mocked(liftHold).mockRejectedValueOnce(
      new AdminApiError(409, message, { statusCode: 409, code: "hold_already_lifted", message }),
    );
    const report = appealReport();
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold()] });
    renderAppeal(report);
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold: Legal hold" }));
    const dialog = await confirmLift();
    expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
  });

  it("shows the restricted notice when the server says vetting is required", async () => {
    vi.mocked(liftHold).mockRejectedValueOnce(vettingRequiredError());
    const report = appealReport({ concernsMinor: true });
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold()] });
    renderAppeal(report);
    fireEvent.click(await screen.findByRole("button", { name: "Lift hold: Legal hold" }));
    await confirmLift();
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("places a bad-faith hold from here too, and shows the server's refusal inside the dialog", async () => {
    const message = "A hold of this type is already active on this report.";
    vi.mocked(placeBadFaithHold).mockRejectedValueOnce(
      new AdminApiError(409, message, { statusCode: 409, code: "hold_already_active", message }),
    );
    renderAppeal(appealReport());
    fireEvent.click(await screen.findByRole("button", { name: "Reporter acted in bad faith" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm bad faith" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
  });

  it("shows the restricted state when the server says vetting is required", async () => {
    vi.mocked(placeBadFaithHold).mockRejectedValueOnce(vettingRequiredError());
    renderAppeal(appealReport({ concernsMinor: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Reporter acted in bad faith" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "A reason that is long enough." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm bad faith" }));
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
  });

  it("shows an active hold on the no-pending-appeal view as well", async () => {
    const report = appealReport({ appealStatus: "upheld" });
    vi.mocked(getReportById).mockResolvedValue({ ...report, holds: [hold({ type: "bad_faith" })] });
    renderAppeal(report);
    const status = await screen.findByLabelText("Active holds");
    expect(within(status).getByText("Reporter acted in bad faith")).not.toBeNull();
    // Lift hold is on this view too.
    expect(within(status).getByRole("button", { name: "Lift hold: Reporter acted in bad faith" })).not.toBeNull();
  });

  it("moves focus into the dialog and back to the opener, like the Report Detail dialog", async () => {
    renderAppeal(appealReport());
    const opener = await screen.findByRole("button", { name: "Legal hold" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (required)"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });
});
