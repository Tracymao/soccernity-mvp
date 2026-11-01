// B-271: the sign-in page with two-factor. The password step can answer a challenge or an enrolment step;
// the page then shows the second screen and only leaves for the Console once a session has been adopted.
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import AdminLoginPage from "./AdminLoginPage";
import * as copy from "./two-factor/twoFactorCopy";

vi.mock("../auth/AdminAuthContext", () => ({ useAdminAuth: vi.fn() }));
import { useAdminAuth } from "../auth/AdminAuthContext";

vi.mock("../api/adminTwoFactor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/adminTwoFactor")>();
  return {
    ...actual,
    completeTwoFactorLogin: vi.fn(),
    startEnrolmentAtSignIn: vi.fn(),
    confirmEnrolmentAtSignIn: vi.fn(),
  };
});
import {
  completeTwoFactorLogin,
  confirmEnrolmentAtSignIn,
  startEnrolmentAtSignIn,
} from "../api/adminTwoFactor";

const login = vi.fn();
const adoptSession = vi.fn();
const SESSION = {
  accessToken: "acc-1",
  accessTokenExpiresIn: 900,
  refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
  admin: { id: "a1", email: "ada@soccernity.com", fullName: "Ada", phone: null, role: "superadmin", accountStatus: "active", createdAt: "", updatedAt: "" },
};

function mockAuth(extra: Record<string, unknown> = {}) {
  (useAdminAuth as unknown as Mock).mockReturnValue({
    status: "unauthenticated",
    admin: null,
    login,
    adoptSession,
    logout: vi.fn(),
    ...extra,
  });
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitPassword() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@soccernity.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  login.mockReset();
  adoptSession.mockReset();
  vi.mocked(completeTwoFactorLogin).mockReset();
  vi.mocked(startEnrolmentAtSignIn).mockReset();
  vi.mocked(confirmEnrolmentAtSignIn).mockReset();
  mockAuth();
});
afterEach(cleanup);

describe("AdminLoginPage: two-factor", () => {
  it("shows the refresh-gate notice above the form, and the form still works", () => {
    mockAuth({ signedOutReason: "two-factor-enrolment-required" });
    renderLogin();
    expect(screen.getByText(copy.NOTICE_TITLE)).not.toBeNull();
    expect(screen.getByText(copy.NOTICE_BODY)).not.toBeNull();
    expect(screen.getByLabelText("Email")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeNull();
    // the notice is not an error: the page's own error alert is not used for it
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no notice for an ordinary sign-out", () => {
    renderLogin();
    expect(screen.queryByText(copy.NOTICE_TITLE)).toBeNull();
  });

  it("a challenge answer opens the code prompt; the code finishes the sign-in and enters the Console", async () => {
    login.mockResolvedValue({ kind: "challenge", challengeToken: "chal-1", challengeExpiresInSeconds: 300 });
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderLogin();
    submitPassword();
    expect(await screen.findByRole("heading", { name: copy.PROMPT_TITLE })).not.toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText("DASHBOARD")).toBeNull();

    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: copy.SIGN_IN }));
    await waitFor(() => expect(screen.queryByText("DASHBOARD")).not.toBeNull());
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-1", "123456");
    expect(adoptSession).toHaveBeenCalledWith(SESSION);
  });

  it("Back to sign in returns to the password form with the email kept and the password cleared", async () => {
    login.mockResolvedValue({ kind: "challenge", challengeToken: "chal-1", challengeExpiresInSeconds: 300 });
    renderLogin();
    submitPassword();
    fireEvent.click(await screen.findByRole("button", { name: copy.BACK_TO_SIGN_IN }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ada@soccernity.com");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("an enrolment answer opens setup; the Console is NOT entered until the backup codes are saved", async () => {
    login.mockResolvedValue({ kind: "enrolment", enrolmentToken: "enrol-1", expiresInSeconds: 600 });
    vi.mocked(startEnrolmentAtSignIn).mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Soccernity:ada?secret=JBSWY3DPEHPK3PXP" });
    vi.mocked(confirmEnrolmentAtSignIn).mockResolvedValue({ ...SESSION, backupCodes: ["ABCDE23456"] });
    const { container } = renderLogin();
    submitPassword();
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(startEnrolmentAtSignIn).toHaveBeenCalledWith("enrol-1");

    fireEvent.click(screen.getByRole("button", { name: copy.CONTINUE }));
    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: copy.CONFIRM }));
    await screen.findByRole("heading", { name: copy.BACKUP_TITLE });

    // the session exists server-side (the cookie is set) but the page holds it: not adopted, not navigated
    expect(adoptSession).not.toHaveBeenCalled();
    expect(screen.queryByText("DASHBOARD")).toBeNull();

    fireEvent.click(screen.getByLabelText(copy.SAVED_CODES_LABEL));
    fireEvent.click(screen.getByRole("button", { name: copy.CONTINUE_TO_CONSOLE }));
    await waitFor(() => expect(screen.queryByText("DASHBOARD")).not.toBeNull());
    expect(adoptSession).toHaveBeenCalledWith(SESSION);
  });
});
