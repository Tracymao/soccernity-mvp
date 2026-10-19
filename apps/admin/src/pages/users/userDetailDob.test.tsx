// B-109 / B-103 / B-104: the User Detail screen and the audited
// date-of-birth correction form.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, getUserDetail: vi.fn(), getUserSummary: vi.fn(), revokeUsername: vi.fn(), correctDateOfBirth: vi.fn() };
});

import {
  correctDateOfBirth,
  getUserDetail,
  getUserSummary,
  revokeUsername,
  type AdminUserDetail,
  type AdminUserSummary,
  type DobCorrectionResult,
} from "../../api/adminUsers";
import UserDetailPage from "./UserDetailPage";
import CorrectDobPage from "./CorrectDobPage";
import { reasonHasDate } from "./usersShared";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUserDetail).mockReset();
  vi.mocked(getUserSummary).mockReset();
  vi.mocked(revokeUsername).mockReset();
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

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
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
    createdAt: "2026-09-03T10:00:00.000Z",
    pendingDeletionAt: null,
    safeguardingCountry: { declared: "GB", derived: "GB", method: "geoip", derivedAt: null },
    guardian: null,
    usernameRevocations: [],
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
  it("shows the account record from the summary endpoint and links to the correction form", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    renderRoutes("/users/user-1");

    expect(await screen.findByRole("heading", { name: "Ada Bello" })).not.toBeNull();
    expect(getUserSummary).toHaveBeenCalledWith("user-1");
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("@adab")).not.toBeNull();
    expect(within(account).getByText("ada.bello@example.com")).not.toBeNull();
    expect(within(account).getByText("03 Sep 2026")).not.toBeNull();
    const link = screen.getByRole("link", { name: "Correct date of birth" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/users/user-1/dob-correction");
  });

  it("never calls the date-of-birth endpoint (no audited DOB read just for opening the screen)", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary());
    renderRoutes("/users/user-1");
    await screen.findByRole("heading", { name: "Ada Bello" });
    expect(getUserDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/2011|04 Sep/);
  });

  it("shows the real error (e.g. an editor 403) with a retry", async () => {
    vi.mocked(getUserSummary).mockRejectedValue(new AdminApiError(403, "Forbidden resource"));
    renderRoutes("/users/user-1");
    expect((await screen.findByRole("alert")).textContent).toMatch(/forbidden resource/i);
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });

  describe("Revoke username", () => {
    async function openDialog() {
      vi.mocked(getUserSummary).mockResolvedValue(summary());
      renderRoutes("/users/user-1");
      fireEvent.click(await screen.findByRole("button", { name: "Revoke username" }));
      return screen.findByRole("dialog");
    }

    it("opens the drawn dialog naming the handle and the user, and sends nothing yet", async () => {
      const dialog = await openDialog();
      expect(dialog.textContent).toContain("This removes @adab from Ada Bello’s account.");
      expect(within(dialog).getByLabelText("Reason (required)")).not.toBeNull();
      expect(revokeUsername).not.toHaveBeenCalled();
    });

    it("requires a reason of at least 10 characters", async () => {
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "short" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Revoke username" }));
      expect((await within(dialog).findByRole("alert")).textContent).toMatch(/at least 10 characters/);
      expect(revokeUsername).not.toHaveBeenCalled();
    });

    it("Cancel closes the dialog without calling the server", async () => {
      const dialog = await openDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(revokeUsername).not.toHaveBeenCalled();
    });

    it("revokes with the trimmed reason, then shows the drawn Username revoked state", async () => {
      vi.mocked(revokeUsername).mockResolvedValue({
        userId: "user-1",
        revokedUsername: "adab",
        heldUntil: "2026-11-18T00:00:00.000Z",
      });
      const dialog = await openDialog();
      // After the revoke the screen reloads the summary: the account now has no username.
      vi.mocked(getUserSummary).mockResolvedValue(summary({ username: null }));
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), {
        target: { value: "  Impersonates a club official account  " },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Revoke username" }));

      await waitFor(() => expect(revokeUsername).toHaveBeenCalledWith("user-1", "Impersonates a club official account"));
      expect(await screen.findByText("Username revoked. The action was recorded.")).not.toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() => expect(screen.getByText("No username")).not.toBeNull());
      expect(screen.getByText("This account has no username.")).not.toBeNull();
      expect((screen.getByRole("button", { name: "Revoke username" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("on a failure keeps the dialog open with the drawn error and changes nothing", async () => {
      vi.mocked(revokeUsername).mockRejectedValue(new AdminApiError(500, "boom"));
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), {
        target: { value: "Offensive handle reported twice" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Revoke username" }));
      expect((await within(dialog).findByRole("alert")).textContent).toBe(
        "The username could not be revoked. Nothing was changed. Try again.",
      );
      expect(screen.queryByText("Username revoked. The action was recorded.")).toBeNull();
    });

    it("shows a specific 4xx message from the server (for example the handle changed mid-request)", async () => {
      vi.mocked(revokeUsername).mockRejectedValue(new AdminApiError(409, "This user has no username to revoke."));
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), {
        target: { value: "Offensive handle reported twice" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Revoke username" }));
      expect((await within(dialog).findByRole("alert")).textContent).toBe("This user has no username to revoke.");
    });
  });

  it("disables Revoke username for an account with no username", async () => {
    vi.mocked(getUserSummary).mockResolvedValue(summary({ username: null }));
    renderRoutes("/users/user-1");
    const button = (await screen.findByRole("button", { name: "Revoke username" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("No username")).not.toBeNull();
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

  it("shows the server date-in-reason refusal under the reason field and returns to the form", async () => {
    await openForm();
    const message = "The reason must not contain a date. Describe the correction without writing either date of birth.";
    // A date shape the client check does not know, so only the server catches it.
    vi.mocked(correctDateOfBirth).mockRejectedValue(
      new AdminApiError(400, message, { code: "reason_contains_date", message }),
    );
    fill("2005-09-04", "Support ticket says it was recorded as 2005 09 04 by mistake");
    fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm correction" }));

    expect((await screen.findAllByRole("alert"))[0].textContent).toMatch(/reason must not contain a date/i);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("adult -> minor guardian details (frames 6752:29980 / 6752:30141)", () => {
    const adult = () =>
      detail({ isMinor: false, isUnder16: false, ageTier: "adult", dateOfBirth: "1990-01-01", guardian: null });
    const onFile = () =>
      detail({
        guardian: {
          name: "S",
          email: "s@example.com",
          relationship: "Parent",
          consentStatus: "pending",
          incorrectDetailsReportedAt: null,
        },
      });

    it("shows the drawn Guardian details block up front once the new date makes a minor", async () => {
      await openForm(adult());
      expect(screen.queryByTestId("guardian-fields")).toBeNull();
      fill("2010-05-05", "Typed the wrong year at the Age Gate");
      const block = await screen.findByTestId("guardian-fields");
      expect(within(block).getByText("Guardian details")).not.toBeNull();
      expect(within(block).getByLabelText("Guardian’s full name")).not.toBeNull();
      expect(within(block).getByLabelText("Guardian’s email")).not.toBeNull();
      expect(within(block).getByLabelText("Relationship")).not.toBeNull();
    });

    it("does not show it when the new date is still an adult one", async () => {
      await openForm(adult());
      fill("1985-05-05", "Typed the wrong year at the Age Gate");
      expect(screen.queryByTestId("guardian-fields")).toBeNull();
    });

    it("does not show it when a guardian is already on file", async () => {
      await openForm(onFile());
      fill("2012-05-05", "Typed the wrong year at the Age Gate");
      expect(screen.queryByTestId("guardian-fields")).toBeNull();
    });

    it("refuses to continue until all three are filled, with the drawn message", async () => {
      await openForm(adult());
      fill("2010-05-05", "Typed the wrong year at the Age Gate");
      fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
      expect((await screen.findAllByRole("alert"))[0].textContent).toBe(
        "Enter the guardian’s name, email and relationship.",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      const name = screen.getByLabelText("Guardian’s full name") as HTMLInputElement;
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });

    it("sends the guardian with the correction", async () => {
      await openForm(adult());
      vi.mocked(correctDateOfBirth).mockResolvedValueOnce(
        result({ ageTierBefore: "adult", ageTierAfter: "under_16", guardianRequest: "created" }),
      );
      fill("2010-05-05", "Typed the wrong year at the Age Gate");
      const block = await screen.findByTestId("guardian-fields");
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

    it("still reveals the block if the server asks for it after confirm (fallback)", async () => {
      // The page thinks a guardian is on file (no block up front); the server disagrees.
      await openForm(onFile());
      vi.mocked(correctDateOfBirth).mockRejectedValueOnce(
        new AdminApiError(
          400,
          "This correction makes the account a minor and no guardian is on file. Provide guardian name, email and relationship.",
        ),
      );
      fill("2012-05-05", "Typed the wrong year at the Age Gate");
      fireEvent.click(screen.getByRole("button", { name: "Review correction" }));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm correction" }));
      expect(await screen.findByTestId("guardian-fields")).not.toBeNull();
      expect(screen.getAllByRole("alert").map((a) => a.textContent).join(" ")).toMatch(/provide guardian/i);
    });
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
