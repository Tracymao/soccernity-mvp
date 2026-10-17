// B-109 / B-103 / B-104: the User Detail screen and the audited
// date-of-birth correction form.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, getUserDetail: vi.fn(), correctDateOfBirth: vi.fn() };
});

import {
  correctDateOfBirth,
  getUserDetail,
  type AdminUserDetail,
  type DobCorrectionResult,
} from "../../api/adminUsers";
import UserDetailPage from "./UserDetailPage";
import CorrectDobPage from "./CorrectDobPage";
import { reasonHasDate } from "./usersShared";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUserDetail).mockReset();
  vi.mocked(correctDateOfBirth).mockReset();
});

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: "user-1",
    email: "ada.bello@example.com",
    displayName: "Ada Bello",
    username: "adab",
    role: "fan",
    accountStatus: "active",
    verificationStatus: "verified",
    isMinor: true,
    isUnder16: true,
    dateOfBirth: "2011-09-04",
    ageTier: "under_16",
    createdAt: "2026-09-03T10:00:00.000Z",
    pendingDeletionAt: null,
    guardian: {
      name: "Sarah Bello",
      email: "sarah@example.com",
      relationship: "Parent",
      consentStatus: "confirmed",
      incorrectDetailsReportedAt: null,
    },
    ...overrides,
  };
}

function result(overrides: Partial<DobCorrectionResult> = {}): DobCorrectionResult {
  return {
    userId: "user-1",
    ageTierBefore: "under_16",
    ageTierAfter: "under_18",
    guardianRequest: "kept_confirmed",
    declineCounterReset: false,
    incorrectDetailsFlagCleared: false,
    ...overrides,
  };
}

function renderRoutes(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users" element={<p>users list</p>} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/users/:id/dob-correction" element={<CorrectDobPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("UserDetailPage", () => {
  it("shows the account record and links to the correction form", async () => {
    vi.mocked(getUserDetail).mockResolvedValue(detail());
    renderRoutes("/users/user-1");

    expect(await screen.findByRole("heading", { name: "Ada Bello" })).not.toBeNull();
    expect(getUserDetail).toHaveBeenCalledWith("user-1");
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("@adab")).not.toBeNull();
    expect(within(account).getByText("ada.bello@example.com")).not.toBeNull();
    const link = screen.getByRole("link", { name: "Correct date of birth" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/users/user-1/dob-correction");
  });

  it("does not display the date of birth on this screen", async () => {
    vi.mocked(getUserDetail).mockResolvedValue(detail());
    renderRoutes("/users/user-1");
    await screen.findByRole("heading", { name: "Ada Bello" });
    expect(document.body.textContent).not.toMatch(/2011|04 Sep/);
  });

  it("renders Revoke username disabled -- it is drawn in the frame but not built here", async () => {
    vi.mocked(getUserDetail).mockResolvedValue(detail());
    renderRoutes("/users/user-1");
    const button = (await screen.findByRole("button", { name: "Revoke username" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows the real error (e.g. an editor's 403) with a retry", async () => {
    vi.mocked(getUserDetail).mockRejectedValue(new AdminApiError(403, "Forbidden resource"));
    renderRoutes("/users/user-1");
    expect((await screen.findByRole("alert")).textContent).toMatch(/forbidden resource/i);
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });
});

describe("CorrectDobPage", () => {
  async function openForm(user = detail()) {
    vi.mocked(getUserDetail).mockResolvedValue(user);
    renderRoutes("/users/user-1/dob-correction");
    await screen.findByLabelText("Current date of birth");
  }
  function fill(dob: string, reason: string) {
    fireEvent.change(screen.getByLabelText("New date of birth (required)"), { target: { value: dob } });
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: reason } });
  }

  it("shows the current date read-only and a visible warning not to put a date in the reason", async () => {
    await openForm();
    const current = screen.getByLabelText("Current date of birth") as HTMLInputElement;
    expect(current.value).toBe("04 Sep 2011");
    expect(current.readOnly).toBe(true);
    const warning = screen.getByTestId("dob-reason-warning");
    expect(warning.textContent).toMatch(/do not enter either date of birth in the reason/i);
  });

  it("refuses a reason that contains a date and never opens the confirm dialog", async () => {
    await openForm();
    fill("2005-09-04", "Typed the wrong year, should be 04/09/2005 per the ticket");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));

    expect((await screen.findAllByRole("alert"))[0].textContent).toMatch(/reason can.t contain a date/i);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(correctDateOfBirth).not.toHaveBeenCalled();
  });

  it("requires a long-enough reason and a new date", async () => {
    await openForm();
    fill("", "short");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    const alerts = (await screen.findAllByRole("alert")).map((a) => a.textContent);
    expect(alerts.join(" ")).toMatch(/enter the new date of birth/i);
    expect(alerts.join(" ")).toMatch(/at least 10 characters/i);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses the date already on file", async () => {
    await openForm();
    fill("2011-09-04", "Confirmed against the support ticket");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    expect((await screen.findAllByRole("alert"))[0].textContent).toMatch(/already the date of birth on file/i);
  });

  it("confirms before anything is sent, then posts the date and reason and shows the outcome", async () => {
    await openForm();
    vi.mocked(correctDateOfBirth).mockResolvedValue(result());
    fill("2005-09-04", "Typed the wrong year at the Age Gate. Confirmed through the support ticket.");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));

    const dialog = await screen.findByRole("dialog");
    expect(correctDateOfBirth).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("04 Sep 2011");
    expect(dialog.textContent).toContain("04 Sep 2005");
    expect(dialog.textContent).toMatch(/what happens next/i);

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm correction" }));

    await waitFor(() =>
      expect(correctDateOfBirth).toHaveBeenCalledWith("user-1", {
        dateOfBirth: "2005-09-04",
        reason: "Typed the wrong year at the Age Gate. Confirmed through the support ticket.",
      }),
    );
    expect(await screen.findByText("Correction applied")).not.toBeNull();
    expect(screen.getByText("Existing guardian approval kept")).not.toBeNull();
    expect(screen.getByText("under 16 → under 18")).not.toBeNull();
    expect(screen.getByText("Recorded")).not.toBeNull();
  });

  it("Cancel in the dialog sends nothing and returns to the form", async () => {
    await openForm();
    fill("2005-09-04", "Typed the wrong year at the Age Gate");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(correctDateOfBirth).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toContain("Age Gate");
  });

  it("shows the server's refusal inside the dialog and keeps the dialog open", async () => {
    await openForm();
    vi.mocked(correctDateOfBirth).mockRejectedValue(new AdminApiError(400, "That date of birth is not plausible."));
    fill("1850-01-01", "Typed the wrong year at the Age Gate");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm correction" }));

    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/not plausible/i);
    expect(screen.queryByText("Correction applied")).toBeNull();
  });

  it("reveals guardian fields only after the server asks for them, then sends them", async () => {
    await openForm(detail({ isMinor: false, isUnder16: false, ageTier: "adult", dateOfBirth: "1990-01-01", guardian: null }));
    expect(screen.queryByTestId("guardian-fields")).toBeNull();
    vi.mocked(correctDateOfBirth).mockRejectedValueOnce(
      new AdminApiError(
        400,
        "This correction makes the account a minor and no guardian is on file. Provide guardian name, email and relationship.",
      ),
    );
    fill("2010-05-05", "Typed the wrong year at the Age Gate");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm correction" }));

    // Back on the form, with the guardian block shown and the server's message.
    const block = await screen.findByTestId("guardian-fields");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toMatch(/provide guardian/i);

    vi.mocked(correctDateOfBirth).mockResolvedValueOnce(
      result({ ageTierBefore: "adult", ageTierAfter: "under_16", guardianRequest: "created" }),
    );
    fireEvent.change(within(block).getByLabelText(/full name/i), { target: { value: "Sarah Bello" } });
    fireEvent.change(within(block).getByLabelText(/guardian.s email/i), { target: { value: "sarah@example.com" } });
    fireEvent.change(within(block).getByLabelText("Relationship"), { target: { value: "Parent" } });
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm correction" }));

    await waitFor(() =>
      expect(correctDateOfBirth).toHaveBeenLastCalledWith("user-1", {
        dateOfBirth: "2010-05-05",
        reason: "Typed the wrong year at the Age Gate",
        guardian: { name: "Sarah Bello", email: "sarah@example.com", relationship: "Parent" },
      }),
    );
    expect(await screen.findByText("A guardian request was created")).not.toBeNull();
  });
});

describe("reasonHasDate", () => {
  it.each([
    "born 2005-09-04",
    "should be 04/09/2005",
    "should be 4.9.05",
    "4 Sep 2005",
    "4th September 2005",
    "Sep 4, 2005",
    "September 4th 2005",
  ])("flags %s", (text) => {
    expect(reasonHasDate(text)).toBe(true);
  });

  it.each([
    "Typed the wrong year at the Age Gate",
    "Confirmed through support ticket 20481",
    "Parent called on Monday to correct it",
    "Age should be 14 not 12",
  ])("allows %s", (text) => {
    expect(reasonHasDate(text)).toBe(false);
  });
});
