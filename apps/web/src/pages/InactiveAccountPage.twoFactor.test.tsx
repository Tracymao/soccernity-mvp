// B-111: "Activate account" on the Inactive Account page with two-factor on. POST
// /auth/reactivate-account answers a challenge instead of tokens; the account is only
// reactivated when POST /auth/login/two-factor accepts a code. Same prompt as sign-in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import InactiveAccountPage from "./InactiveAccountPage";
import { AuthApiError, type LoginResponse } from "../api/auth";

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, reactivateAccount: vi.fn(), completeTwoFactorLogin: vi.fn() };
});
vi.mock("../api/twoFactorRecovery", async () => {
  const actual = await vi.importActual<typeof import("../api/twoFactorRecovery")>("../api/twoFactorRecovery");
  return { ...actual, requestRecovery: vi.fn() };
});
import { completeTwoFactorLogin, reactivateAccount } from "../api/auth";
import { requestRecovery } from "../api/twoFactorRecovery";
import { clearSession, heldAccessToken } from "../test/session";

const CHALLENGE = { twoFactorRequired: true as const, challengeToken: "chal-r", challengeExpiresInSeconds: 300 };
const SESSION = {
  accessToken: "acc-react",
  accessTokenExpiresIn: 900,
  refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
  user: { id: "u1", nextStep: "none", guardianConsentStatus: "not_applicable" },
} as unknown as LoginResponse;

beforeEach(() => {
  clearSession();
  navigateMock.mockReset();
  vi.mocked(reactivateAccount).mockReset();
  vi.mocked(completeTwoFactorLogin).mockReset();
});
afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/account/inactive", state: { email: "sam@example.com", password: "hunter2" } }]}
    >
      <Routes>
        <Route path="/account/inactive" element={<InactiveAccountPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Inactive Account, two-factor on", () => {
  it("a challenge shows the shared code prompt and stores no session", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    expect(await screen.findByRole("heading", { name: "Enter the 6-digit code" })).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("a right code finishes the reactivation: session stored, routed on nextStep", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "482017" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/community"));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-r", "482017");
    expect(heldAccessToken()).toBe("acc-react");
  });

  it("a backup code works here too", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockResolvedValue(SESSION);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use a backup code instead" }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "ABCDE-12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/community"));
    expect(completeTwoFactorLogin).toHaveBeenCalledWith("chal-r", "ABCDE-12345");
  });

  it("an expired challenge goes back to the choices with a plain note", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    vi.mocked(completeTwoFactorLogin).mockRejectedValue(
      new AuthApiError("expired", { status: 401, code: "two_factor_invalid_challenge" }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    await screen.findByRole("heading", { name: "Enter the 6-digit code" });
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "482017" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/this step has expired/i);
    expect(screen.getByRole("button", { name: "Activate account" })).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
  });
});

// B-278 (Decision Log #455): the same lost-device recovery entry point on the reactivation prompt.
describe("Inactive Account, lost-device recovery", () => {
  it("the shared prompt offers the link, prefilled with the account email", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lost your device and backup codes?" }));
    expect(screen.getByRole("heading", { name: "Confirm it’s you" })).not.toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@example.com");
    expect(requestRecovery).not.toHaveBeenCalled();
  });

  it("'Back to log in' leaves for /login", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(CHALLENGE);
    vi.mocked(requestRecovery).mockResolvedValue({ audience: "guardian" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lost your device and backup codes?" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back to log in" }));
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });

  it("a challenge with recoveryPending shows the banner", async () => {
    vi.mocked(reactivateAccount).mockResolvedValue({ ...CHALLENGE, recoveryPending: true });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    expect(await screen.findByText("A recovery request is waiting")).not.toBeNull();
  });
});
