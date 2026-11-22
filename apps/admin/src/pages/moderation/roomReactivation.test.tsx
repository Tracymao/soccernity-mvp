// Staff reactivation of a Bants room (backend/room-staff-reactivation): the Reactivate Room action on the report
// detail of a banter_room report. Visibility is the server's `reportedRoom.staffMayReactivate`; the page works out
// nothing of its own. Errors are told apart by the server's stable code, never by its message text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, getReportById: vi.fn(), reactivateRoom: vi.fn(), actionReport: vi.fn() };
});

import {
  actionReport,
  BANTER_ROOM_ALREADY_ACTIVE_CODE,
  BANTER_ROOM_NOT_STAFF_DEACTIVATED_CODE,
  getReportById,
  reactivateRoom,
  type Report,
  type ReportedRoom,
} from "../../api/moderation";
import ReportDetailPage from "./ReportDetailPage";
import {
  ROOM_ALREADY_ACTIVE_LINE,
  ROOM_NOT_STAFF_DEACTIVATED_LINE,
  ROOM_REACTIVATE_FAILED_LINE,
  ROOM_REACTIVATED_LINE,
  ROOM_ROLE_REFUSED_LINE,
} from "./ReportedRoomCard";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getReportById).mockReset();
  vi.mocked(reactivateRoom).mockReset();
  vi.mocked(actionReport).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

const ROOM_ID = "room-1111-2222";

function room(overrides: Partial<ReportedRoom> = {}): ReportedRoom {
  return { id: ROOM_ID, status: "inactive", staffMayReactivate: true, ...overrides };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-room-9876",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "banter_room",
    targetId: ROOM_ID,
    reasonCategory: "harassment_or_bullying",
    reason: "",
    status: "actioned",
    createdAt: "2026-11-10T10:00:00.000Z",
    concernsMinor: false,
    severity: "medium",
    reviewedByAdminId: "admin-1",
    reviewedAt: "2026-11-10T11:00:00.000Z",
    actionTaken: "room_deactivated",
    appealStatus: null,
    appealReason: null,
    appealedAt: null,
    appealReviewedByAdminId: null,
    appealReviewedAt: null,
    escalatedAt: null,
    escalatedByAdminId: null,
    escalationNotes: null,
    escalatedToAuthority: false,
    holds: [],
    reportedRoom: room(),
    ...overrides,
  };
}

function renderDetail(r: Report, withState = true) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: withState ? { report: r } : undefined }]}
    >
      <Routes>
        <Route path="/moderation/reports/:id" element={<ReportDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function apiError(status: number, code: string | undefined, message = "x"): AdminApiError {
  return new AdminApiError(status, message, code ? { code, message } : { message });
}

const REACTIVATE = () => screen.queryByRole("button", { name: "Reactivate Room" });

describe("Reactivate Room: when it is shown", () => {
  it("is shown for an inactive room the server says staff may reactivate, with the status 'Inactive'", async () => {
    renderDetail(report());
    expect(await screen.findByRole("heading", { name: "Bants room" })).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(REACTIVATE()).not.toBeNull();
  });

  it("is NOT shown when the server says staff may not (a room the creator deactivated)", async () => {
    renderDetail(report({ reportedRoom: room({ staffMayReactivate: false }) }));
    await screen.findByRole("heading", { name: "Bants room" });
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
  });

  it("is NOT shown when the room is active, and the status reads 'Active'", async () => {
    renderDetail(report({ reportedRoom: room({ status: "active", staffMayReactivate: false }) }));
    await screen.findByRole("heading", { name: "Bants room" });
    expect(screen.getByText("Active")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
  });

  it("follows the server, not the report's own state: an open report still shows it when the server allows, beside the unchanged Deactivate Room", async () => {
    renderDetail(report({ status: "open", actionTaken: null, reviewedAt: null, reviewedByAdminId: null }));
    await screen.findByRole("heading", { name: "Bants room" });
    expect(REACTIVATE()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Deactivate Room" })).toBeTruthy();
  });

  it("a deleted room (reportedRoom null) says so and offers nothing", async () => {
    renderDetail(report({ reportedRoom: null }));
    expect(await screen.findByText("This room no longer exists.")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
  });

  it("an older server with no reportedRoom field draws no card at all", async () => {
    const r = report();
    delete r.reportedRoom;
    vi.mocked(getReportById).mockResolvedValue(r);
    renderDetail(r);
    await screen.findByText("Reported content");
    await waitFor(() => expect(getReportById).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Bants room" })).toBeNull();
    expect(REACTIVATE()).toBeNull();
  });

  it("is not drawn on a report about anything else", async () => {
    renderDetail(report({ targetType: "post", actionTaken: "warning_issued", reportedRoom: undefined }));
    await screen.findByText("Reported content");
    expect(screen.queryByRole("heading", { name: "Bants room" })).toBeNull();
    expect(REACTIVATE()).toBeNull();
  });

  it("a report handed over from the queue (no reportedRoom) is read once and then shows the card", async () => {
    const handed = report();
    delete handed.reportedRoom;
    vi.mocked(getReportById).mockResolvedValue(report());
    renderDetail(handed);
    expect(await screen.findByRole("button", { name: "Reactivate Room" })).toBeTruthy();
    expect(getReportById).toHaveBeenCalledTimes(1);
  });
});

describe("Reactivate Room: pressing it", () => {
  it("calls the route for the room, shows the room as active with a status line, and stays on the page", async () => {
    vi.mocked(reactivateRoom).mockResolvedValue({ id: ROOM_ID, status: "active" });
    renderDetail(report());
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate Room" }));
    await waitFor(() => expect(screen.getByText(ROOM_REACTIVATED_LINE)).toBeTruthy());
    expect(reactivateRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
    expect(screen.getByRole("heading", { name: "Bants room" })).toBeTruthy();
    expect(actionReport).not.toHaveBeenCalled();
  });

  it("shows 'Saving…' and ignores a second press while the request runs", async () => {
    let resolve!: (v: { id: string; status: "active" }) => void;
    vi.mocked(reactivateRoom).mockReturnValue(new Promise((r) => (resolve = r)));
    renderDetail(report());
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate Room" }));
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saving);
    expect(reactivateRoom).toHaveBeenCalledTimes(1);
    resolve({ id: ROOM_ID, status: "active" });
    await waitFor(() => expect(screen.getByText(ROOM_REACTIVATED_LINE)).toBeTruthy());
  });
});

describe("Reactivate Room: refusals are told apart by code, never by message text", () => {
  async function press(error: unknown) {
    vi.mocked(reactivateRoom).mockRejectedValue(error);
    renderDetail(report());
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate Room" }));
  }

  it("409 already active: says so, shows the room as Active and drops the button", async () => {
    await press(apiError(409, BANTER_ROOM_ALREADY_ACTIVE_CODE, "unrelated words"));
    expect((await screen.findByRole("alert")).textContent).toBe(ROOM_ALREADY_ACTIVE_LINE);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
  });

  it("409 not staff-deactivated: says so and drops the button, the room stays Inactive", async () => {
    await press(apiError(409, BANTER_ROOM_NOT_STAFF_DEACTIVATED_CODE, "unrelated words"));
    expect((await screen.findByRole("alert")).textContent).toBe(ROOM_NOT_STAFF_DEACTIVATED_LINE);
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
  });

  it("the server's own wording is never shown: the code decides, whatever the message says", async () => {
    await press(apiError(409, BANTER_ROOM_NOT_STAFF_DEACTIVATED_CODE, ROOM_ALREADY_ACTIVE_LINE));
    expect((await screen.findByRole("alert")).textContent).toBe(ROOM_NOT_STAFF_DEACTIVATED_LINE);
  });

  it("403 child_safety_vetting_required: shows the restricted notice, no button, the room unchanged", async () => {
    await press(apiError(403, "child_safety_vetting_required", "vetting"));
    expect(await screen.findByText("Restricted: child-safety vetting required")).toBeTruthy();
    expect(REACTIVATE()).toBeNull();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.queryByText(ROOM_REACTIVATED_LINE)).toBeNull();
  });

  it("any other 403 (the role is refused): a fixed line, and the button stays", async () => {
    await press(apiError(403, undefined, "Forbidden resource"));
    expect((await screen.findByRole("alert")).textContent).toBe(ROOM_ROLE_REFUSED_LINE);
    expect(REACTIVATE()).not.toBeNull();
  });

  it("a server or network failure: a fixed retry line, the button stays and works again", async () => {
    vi.mocked(reactivateRoom).mockRejectedValueOnce(apiError(500, undefined, "boom"));
    renderDetail(report());
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate Room" }));
    expect((await screen.findByRole("alert")).textContent).toBe(ROOM_REACTIVATE_FAILED_LINE);
    vi.mocked(reactivateRoom).mockResolvedValue({ id: ROOM_ID, status: "active" });
    fireEvent.click(screen.getByRole("button", { name: "Reactivate Room" }));
    await waitFor(() => expect(screen.getByText(ROOM_REACTIVATED_LINE)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
