// B-087: LoginPage with two-factor on. login() answers a challenge (no tokens); the page asks
// for the code, finishes with POST /auth/login/two-factor, and only then stores the session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import LoginPage from "./LoginPage";
import type { LoginResponse } from "../api/auth";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn(), completeTwoFactorLogin: vi.fn() };
});
vi.mock("../api/twoFactorRecovery", async () => {
  const actual = await vi.importActual<typeof import("../api/twoFactorRecovery")>("../api/twoFactorRecovery");
  return { ...actual, requestRecovery: vi.fn() };
});
import { AuthApiError, completeTwoFactorLogin, login } from "../api/auth";
import { requestRecovery } from "../api/twoFactorRecovery";
import { clearSession, heldAccessToken } from "../test/session";

const CHALLENGE = { twoFactorRequired: true as const, challengeToken: "chal-9", challengeExpiresInSeconds: 300 };
const SESSION = {
  accessToken: "acc-2fa",
  accessTokenExpiresIn: 900,
  refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
  user: { id: "u1", nextStep: "none", guardianConsentStatus: "not_applicable" },
} as unknown as LoginResponse;

beforeEach(() => {
  clearSession();
  vi.mocked(login).mockReset();
  vi.mocked(completeTwoFactorLogin).mockReset();
});
afterEach(cleanup);

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/community" element={<p>community page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitPassword(stay = false) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "tobi@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
  if (stay) fireEvent.click(screen.getByLabelText(/stay signed in/i));
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage, two-factor on", () => {
  it("a challenge shows the code prompt, stores NO session, and finishes nothing yet", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    renderLogin();
    submitPassword();
    expect(await screen.findByRole("heading", { name: "Enter the 6-digit code" })).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
    expect(screen.queryByText("community page")).toBeNull();
    expect(completeTwoFactorLogin).not.toHaveBeenCalled();
  });

  it("keeps the 'stay signed in' choice on the password step; the code step sends only challenge and code", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    renderLogin();
    submitPassword(true);
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    expect(login).toHaveBeenCalledWith({ email: "tobi@example.com", password: "longenough1", staySignedIn: true });
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "482017" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-9", "482017"));
  });

  it("a right code stores the session and routes on the server's nextStep", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderLogin();
    submitPassword();
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "482017" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(heldAccessToken()).toBe("acc-2fa");
  });

  it("a backup code finishes sign-in the same way", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderLogin();
    submitPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Use a backup code instead" }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "ABCDE-12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-9", "ABCDE-12345");
  });

  it("an expired challenge returns to sign-in with a note, the email kept and the password gone", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(
      new AuthApiError("expired", { status: 401, code: "two_factor_invalid_challenge" }),
    );
    renderLogin();
    submitPassword();
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "482017" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Your sign-in expired. Please log in again.")).not.toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("tobi@example.com");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect(heldAccessToken()).toBeNull();
  });

  it("an account without two-factor signs in exactly as before (no prompt)", async () => {
    vi.mocked(login).mockResolvedValue(SESSION);
    renderLogin();
    submitPassword();
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(screen.queryByText("Enter the 6-digit code")).toBeNull();
  });
});

// B-278 (Decision Log #455): lost-device recovery from the sign-in code prompt.
describe("LoginPage, lost-device recovery", () => {
  it("the code prompt offers the link; it opens the request prefilled with the sign-in email, and the password is NOT carried over", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    renderLogin();
    submitPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Lost your device and backup codes?" }));
    expect(screen.getByRole("heading", { name: "Confirm it’s you" })).not.toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("tobi@example.com");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect(requestRecovery).not.toHaveBeenCalled();
  });

  it("'Back to log in' after a request returns to the log-in form with the email kept and no expired message", async () => {
    vi.mocked(login).mockResolvedValue(CHALLENGE);
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "account" });
    renderLogin();
    submitPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Lost your device and backup codes?" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back to log in" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("tobi@example.com");
    expect(screen.queryByText(/sign-in expired/i)).toBeNull();
    expect(heldAccessToken()).toBeNull();
  });

  it("a challenge with recoveryPending shows the banner (Figma 2.8); one without shows none", async () => {
    vi.mocked(login).mockResolvedValue({
      ...CHALLENGE,
      recoveryPending: true,
      recoveryExecuteAt: "2026-11-03T14:30:00.000Z",
    });
    renderLogin();
    submitPassword();
    expect(await screen.findByText("A recovery request is waiting")).not.toBeNull();
    expect(screen.getByText("Entering a code now cancels it.")).not.toBeNull();
    cleanup();
    vi.mocked(login).mockResolvedValue({ ...CHALLENGE, recoveryPending: false });
    renderLogin();
    submitPassword();
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    expect(screen.queryByText("A recovery request is waiting")).toBeNull();
  });
});

