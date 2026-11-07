// ChangePasswordPage (/settings/account/change-password). Plain DOM
// assertions like DeactivateAccountPage.test.tsx: mocks api/auth.changePassword,
// session seeded into the in-memory store. POST /auth/change-password is a
// real merged endpoint; exercising it live is the Playwright spec's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ChangePasswordPage, { MESSAGES, validate } from "./ChangePasswordPage";
import { AuthApiError } from "../../api/auth";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, changePassword: vi.fn() };
});

import { changePassword } from "../../api/auth";
import { seedSession, clearSession } from "../../test/session";

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(changePassword).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/account/change-password"]}>
      <ChangePasswordPage />
    </MemoryRouter>,
  );
}

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("validate (the server's one rule plus the client-only match)", () => {
  it("accepts 8 characters and a matching confirmation", () => {
    expect(validate("old", "12345678", "12345678")).toEqual({});
  });
  it("rejects 7 characters", () => {
    expect(validate("old", "1234567", "1234567")).toEqual({ next: MESSAGES.newTooShort });
  });
  it("does not add rules the server lacks (no digits, symbols or max length)", () => {
    expect(validate("old", "aaaaaaaa", "aaaaaaaa")).toEqual({});
    expect(validate("old", "a".repeat(300), "a".repeat(300))).toEqual({});
  });
  it("flags a mismatch and a missing current password", () => {
    expect(validate("", "12345678", "12345679")).toEqual({
      current: MESSAGES.currentRequired,
      confirm: MESSAGES.confirmMismatch,
    });
  });
});

describe("ChangePasswordPage", () => {
  it("asks a signed-out visitor to log in and renders no form", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  describe("the form (2924:6870)", () => {
    beforeEach(() => seedSession("tok"));

    it("shows the title, lead, three fields, the sessions note and Save", () => {
      renderPage();
      expect(screen.getByRole("heading", { name: "Change Password" })).not.toBeNull();
      expect(screen.getByText("Update the password you use to log in to Soccernity.")).not.toBeNull();
      expect(screen.getByLabelText("Current password")).not.toBeNull();
      expect(screen.getByLabelText("New password")).not.toBeNull();
      expect(screen.getByLabelText("Confirm password")).not.toBeNull();
      expect(
        screen.getByText("Changing your password will log you out of your other active Soccernity sessions."),
      ).not.toBeNull();
      expect(screen.getByRole("button", { name: "Save" })).not.toBeNull();
      expect(screen.getByText("Use at least 8 characters.")).not.toBeNull();
    });

    it("links back to Account", () => {
      renderPage();
      expect(screen.getByRole("link", { name: "Back to Account" }).getAttribute("href")).toBe("/settings/account");
    });

    it("masks all three fields", () => {
      renderPage();
      for (const label of ["Current password", "New password", "Confirm password"]) {
        expect(screen.getByLabelText(label).getAttribute("type")).toBe("password");
      }
    });
  });

  describe("new password problems (6990:53912)", () => {
    beforeEach(() => seedSession("tok"));

    it("shows both errors at once, sends nothing and focuses the first bad field", async () => {
      renderPage();
      fill("oldpass1", "1234567", "12345678");
      save();
      expect(await screen.findByText(MESSAGES.confirmMismatch)).not.toBeNull();
      // the hint line is the same words, so the error must be the alert one
      expect(screen.getAllByRole("alert").map((n) => n.textContent)).toEqual([
        MESSAGES.newTooShort,
        MESSAGES.confirmMismatch,
      ]);
      expect(screen.getByLabelText("New password").getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(screen.getByLabelText("New password"));
      expect(changePassword).not.toHaveBeenCalled();
    });

    it("flags only the mismatch when the new password is long enough", async () => {
      renderPage();
      fill("oldpass1", "12345678", "12345679");
      save();
      expect(await screen.findByText(MESSAGES.confirmMismatch)).not.toBeNull();
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(document.activeElement).toBe(screen.getByLabelText("Confirm password"));
      expect(changePassword).not.toHaveBeenCalled();
    });

    it("asks for the current password when it is empty", async () => {
      renderPage();
      fill("", "12345678", "12345678");
      save();
      expect(await screen.findByText(MESSAGES.currentRequired)).not.toBeNull();
      expect(document.activeElement).toBe(screen.getByLabelText("Current password"));
      expect(changePassword).not.toHaveBeenCalled();
    });

    it("keeps what was typed after a validation error", async () => {
      renderPage();
      fill("oldpass1", "1234567", "1234567");
      save();
      await screen.findByRole("alert");
      expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("1234567");
    });

    it("accepts exactly 8 characters (the server's minimum)", async () => {
      vi.mocked(changePassword).mockResolvedValue(undefined);
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      await waitFor(() => expect(changePassword).toHaveBeenCalledWith("tok", "oldpass1", "12345678"));
    });
  });

  describe("wrong current password (6990:53716)", () => {
    beforeEach(() => seedSession("tok"));

    it("flags the current field on a 401, keeps the typed values and stays on the form", async () => {
      vi.mocked(changePassword).mockRejectedValue(new AuthApiError("Your current password is incorrect.", { status: 401 }));
      renderPage();
      fill("wrongpass", "12345678", "12345678");
      save();
      expect(await screen.findByText(MESSAGES.currentWrong)).not.toBeNull();
      expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(screen.getByLabelText("Current password"));
      expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("wrongpass");
      expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("12345678");
      expect(screen.queryByText("Password changed")).toBeNull();
    });

    it("clears the error on the next attempt", async () => {
      vi.mocked(changePassword)
        .mockRejectedValueOnce(new AuthApiError("x", { status: 401 }))
        .mockResolvedValueOnce(undefined);
      renderPage();
      fill("wrongpass", "12345678", "12345678");
      save();
      await screen.findByText(MESSAGES.currentWrong);
      fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "rightpass" } });
      save();
      expect(await screen.findByText("Password changed")).not.toBeNull();
    });
  });

  describe("sending and other failures", () => {
    beforeEach(() => seedSession("tok"));

    it("disables the form while saving and ignores a second submit", async () => {
      let resolve!: () => void;
      vi.mocked(changePassword).mockReturnValue(new Promise<void>((r) => (resolve = r)));
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      const busy = await screen.findByRole("button", { name: "Saving…" });
      expect((busy as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText("Current password") as HTMLInputElement).disabled).toBe(true);
      fireEvent.submit(busy.closest("form") as HTMLFormElement);
      expect(changePassword).toHaveBeenCalledTimes(1);
      resolve();
      await screen.findByText("Password changed");
    });

    it("shows a plain line for a server error and keeps the values", async () => {
      vi.mocked(changePassword).mockRejectedValue(new AuthApiError("Couldn't change your password.", { status: 500 }));
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      expect(await screen.findByText(MESSAGES.generic)).not.toBeNull();
      expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("12345678");
    });

    it("shows the client's own message when the server cannot be reached", async () => {
      vi.mocked(changePassword).mockRejectedValue(
        new AuthApiError("Couldn't reach the Soccernity server. Please try again shortly."),
      );
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      expect(await screen.findByText(/couldn't reach the soccernity server/i)).not.toBeNull();
    });
  });

  describe("password changed (6990:54110)", () => {
    beforeEach(() => seedSession("tok"));

    it("shows the confirmation, the true sessions line and a way back, and clears the fields", async () => {
      vi.mocked(changePassword).mockResolvedValue(undefined);
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      expect(await screen.findByText("Password changed")).not.toBeNull();
      expect(screen.getByText("Your password has been updated.")).not.toBeNull();
      expect(
        screen.getByText("Your other active sessions have been logged out. You stay logged in on this device."),
      ).not.toBeNull();
      expect(screen.getByRole("link", { name: "Back to Account" }).getAttribute("href")).toBe("/settings/account");
      expect(screen.queryByLabelText("New password")).toBeNull();
      expect(changePassword).toHaveBeenCalledWith("tok", "oldpass1", "12345678");
    });

    it("does not log this device out", async () => {
      vi.mocked(changePassword).mockResolvedValue(undefined);
      renderPage();
      fill("oldpass1", "12345678", "12345678");
      save();
      await screen.findByText("Password changed");
      expect(screen.queryByText(/log in to manage your account/i)).toBeNull();
    });
  });
});
