// ChangeEmailPage (/settings/account/information/change-email): the step order and every
// server answer. api/emailChange is mocked; the real request is the Playwright spec's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import ChangeEmailPage, { GUARDIAN_NOTICE, MESSAGES, OLD_ADDRESS_NOTICE } from "./ChangeEmailPage";

vi.mock("../../api/emailChange", async () => {
  const actual = await vi.importActual<typeof import("../../api/emailChange")>("../../api/emailChange");
  return { ...actual, requestEmailChange: vi.fn() };
});
vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getUser: vi.fn() };
});

import { EmailChangeApiError, requestEmailChange } from "../../api/emailChange";
import { getUser, type UserProfile } from "../../api/users";
import { seedSession, clearSession } from "../../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/account/information/change-email"]}>
      <Routes>
        <Route path="/settings/account/information/change-email" element={<ChangeEmailPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const err = (code: string, status = 403) => new EmailChangeApiError("x", { status, code });

function enterPassword(value = "hunter2hunter2") {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
function enterEmail(value = "new@example.com") {
  fireEvent.change(screen.getByLabelText("New email address"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Send link" }));
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(requestEmailChange).mockReset();
  vi.mocked(getUser).mockReset();
  vi.mocked(getUser).mockResolvedValue({ isMinor: false } as UserProfile);
});

describe("ChangeEmailPage", () => {
  it("asks a signed-out visitor to log in", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
  });

  describe("signed in", () => {
    beforeEach(() => seedSession(TOKEN));

    it("starts at the password step and sends nothing until the last step", () => {
      renderPage();
      expect(screen.getByRole("heading", { name: "Change email" })).not.toBeNull();
      expect(screen.getByText("Enter your password to continue.")).not.toBeNull();
      enterPassword();
      expect(screen.getByLabelText("New email address")).not.toBeNull();
      expect(requestEmailChange).not.toHaveBeenCalled();
    });

    it("asks for the password when it is empty", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByText(MESSAGES.passwordRequired)).not.toBeNull();
      expect(screen.queryByLabelText("New email address")).toBeNull();
    });

    it("password -> new email -> check your inbox, sending the password and the trimmed address", async () => {
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      enterPassword();
      enterEmail("  new@example.com ");
      await screen.findByRole("heading", { name: "Check your inbox" });
      expect(requestEmailChange).toHaveBeenCalledWith(TOKEN, {
        password: "hunter2hunter2",
        newEmail: "new@example.com",
        twoFactorCode: undefined,
      });
      expect(screen.getByText("We sent a link to new@example.com.")).not.toBeNull();
      expect(screen.getByText(OLD_ADDRESS_NOTICE)).not.toBeNull();
      expect(screen.queryByText(GUARDIAN_NOTICE)).toBeNull();
    });

    it("says the guardian will be told when the account is a minor's", async () => {
      vi.mocked(getUser).mockResolvedValue({ isMinor: true } as UserProfile);
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      await waitFor(() => expect(getUser).toHaveBeenCalled());
      enterPassword();
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      await waitFor(() => expect(screen.getByText(GUARDIAN_NOTICE)).not.toBeNull());
    });

    it("prints no link lifetime and no resend wait", async () => {
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      expect(document.body.textContent ?? "").not.toMatch(/\b\d+\s*(minutes?|hours?|seconds?|days?)\b/i);
    });

    it("shows the two-factor step ONLY after the server says two_factor_required, then sends the code", async () => {
      vi.mocked(requestEmailChange)
        .mockRejectedValueOnce(err("two_factor_required"))
        .mockResolvedValueOnce(undefined);
      renderPage();
      enterPassword();
      expect(screen.queryByLabelText("Authenticator code")).toBeNull();
      enterEmail();
      const code = await screen.findByLabelText("Authenticator code");
      fireEvent.change(code, { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: "Check your inbox" });
      expect(vi.mocked(requestEmailChange).mock.calls[1][1]).toEqual({
        password: "hunter2hunter2",
        newEmail: "new@example.com",
        twoFactorCode: "123456",
      });
    });

    it("asks for the code when it is empty, without a request", async () => {
      vi.mocked(requestEmailChange).mockRejectedValueOnce(err("two_factor_required"));
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByLabelText("Authenticator code");
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByText(MESSAGES.codeRequired)).not.toBeNull();
      expect(requestEmailChange).toHaveBeenCalledTimes(1);
    });

    it("keeps the code step and says so on a wrong code", async () => {
      vi.mocked(requestEmailChange)
        .mockRejectedValueOnce(err("two_factor_required"))
        .mockRejectedValueOnce(err("two_factor_invalid"));
      renderPage();
      enterPassword();
      enterEmail();
      fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "000000" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByText(MESSAGES.codeWrong)).not.toBeNull();
      expect(screen.getByLabelText("Authenticator code")).not.toBeNull();
    });

    it("lets the person use a backup code instead", async () => {
      vi.mocked(requestEmailChange)
        .mockRejectedValueOnce(err("two_factor_required"))
        .mockResolvedValueOnce(undefined);
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByLabelText("Authenticator code");
      fireEvent.click(screen.getByRole("button", { name: "Use a backup code instead." }));
      fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "ABCDE-FGHIJ" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: "Check your inbox" });
      expect(vi.mocked(requestEmailChange).mock.calls[1][1].twoFactorCode).toBe("ABCDE-FGHIJ");
    });

    it("goes back to the password step with the frame's error on wrong_password, with a forgot-password link", async () => {
      vi.mocked(requestEmailChange).mockRejectedValue(err("wrong_password"));
      renderPage();
      enterPassword();
      enterEmail();
      expect(await screen.findByText(MESSAGES.passwordWrong)).not.toBeNull();
      expect(screen.getByLabelText("Password")).not.toBeNull();
      expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
        "/forgot-password",
      );
    });

    it("shows ONE message on the new-email step for a not-accepted address, whatever the reason", async () => {
      vi.mocked(requestEmailChange).mockRejectedValue(err("email_change_not_accepted", 400));
      renderPage();
      enterPassword();
      enterEmail("taken@example.com");
      expect(await screen.findByText(MESSAGES.emailNotAccepted)).not.toBeNull();
      expect(screen.getByLabelText("New email address")).not.toBeNull();
    });

    it("refuses an address that is not shaped like an email without a request", () => {
      renderPage();
      enterPassword();
      enterEmail("not-an-email");
      expect(screen.getByText(MESSAGES.emailNotAccepted)).not.toBeNull();
      expect(requestEmailChange).not.toHaveBeenCalled();
    });

    it("says it is not available for a restricted-pending minor, by code, not a raw error", async () => {
      vi.mocked(requestEmailChange).mockRejectedValue(err("guardian_consent_pending"));
      renderPage();
      enterPassword();
      enterEmail();
      expect(await screen.findByText(MESSAGES.consentPending)).not.toBeNull();
      expect(screen.queryByLabelText("New email address")).toBeNull();
    });

    it("shows plain lines for 429, 503 and any other failure", async () => {
      vi.mocked(requestEmailChange)
        .mockRejectedValueOnce(new EmailChangeApiError("x", { status: 429 }))
        .mockRejectedValueOnce(err("email_change_unavailable", 503))
        .mockRejectedValueOnce(new EmailChangeApiError("x", { status: 500 }));
      renderPage();
      enterPassword();
      enterEmail();
      expect(await screen.findByText(MESSAGES.tooMany)).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Send link" }));
      expect(await screen.findByText(MESSAGES.unavailable)).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Send link" }));
      expect(await screen.findByText(MESSAGES.generic)).not.toBeNull();
    });

    it("sends the link again with the same details, and goes back to the code step if the server asks", async () => {
      vi.mocked(requestEmailChange)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(err("two_factor_required"));
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      fireEvent.click(screen.getByRole("button", { name: "Send the link again" }));
      expect(await screen.findByLabelText("Authenticator code")).not.toBeNull();
      expect(vi.mocked(requestEmailChange).mock.calls[1][1].password).toBe("hunter2hunter2");
    });

    it("confirms a resend with a status line", async () => {
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      fireEvent.click(screen.getByRole("button", { name: "Send the link again" }));
      expect(await screen.findByText(MESSAGES.sentAgain)).not.toBeNull();
    });

    it("'Use a different address' returns to the new-email step", async () => {
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      enterPassword();
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      fireEvent.click(screen.getByRole("button", { name: "Use a different address" }));
      expect(screen.getByLabelText("New email address")).not.toBeNull();
    });

    it("Cancel leaves for Account Information", () => {
      renderPage();
      fireEvent.click(screen.getByRole("link", { name: "Cancel" }));
      expect(screen.getByTestId("where").textContent).toBe("/settings/account/information");
    });

    it("keeps the password and the code out of storage and the console", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(requestEmailChange).mockResolvedValue(undefined);
      renderPage();
      enterPassword("super-secret-pw");
      enterEmail();
      await screen.findByRole("heading", { name: "Check your inbox" });
      expect(setItem).not.toHaveBeenCalled();
      expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain("super-secret-pw");
      setItem.mockRestore();
      log.mockRestore();
      error.mockRestore();
    });
  });
});
