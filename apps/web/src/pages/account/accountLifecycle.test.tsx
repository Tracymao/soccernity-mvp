// Full UI walk of the account deactivation lifecycle, mirroring
// services/api's test/account-deactivation.e2e-spec.ts:
//
//   deactivate (Settings)
//     -> login rejected as deactivated -> Inactive Account interstitial
//     -> reactivate -> signed back in
//     -> deactivate again (Settings)
//     -> login rejected as deactivated -> Inactive Account interstitial
//     -> delete-from-inactive (30-day grace)
//     -> account can no longer log in
//
// A real MemoryRouter with the real page components and real react-router
// navigation (useNavigate is NOT mocked here). Only src/api/auth.ts is
// mocked — the endpoints themselves are exercised live by services/api.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router";
import LoginPage from "../LoginPage";
import InactiveAccountPage from "../InactiveAccountPage";
import DeactivateAccountPage from "../settings/DeactivateAccountPage";
import { AuthApiError, type LoginResponse } from "../../api/auth";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return {
    ...actual,
    login: vi.fn(),
    reactivateAccount: vi.fn(),
    deactivateAccount: vi.fn(),
    deleteInactiveAccount: vi.fn(),
  };
});

import { login, reactivateAccount, deactivateAccount, deleteInactiveAccount } from "../../api/auth";

const TOKENS: LoginResponse = {
  accessToken: "reactivated-access",
  accessTokenExpiresIn: 900,
  refreshToken: "reactivated-refresh",
  refreshTokenExpiresAt: "2026-09-07T00:00:00.000Z",
  user: {
    id: "u1",
    email: "sam@example.com",
    phone: null,
    displayName: "Sam",
    dateOfBirth: "1990-01-01",
    isMinor: false,
    role: "fan",
    verificationStatus: "verified",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

function HomeStub() {
  const navigate = useNavigate();
  return (
    <div>
      <p>home feed</p>
      <button type="button" onClick={() => navigate("/settings/deactivate")}>
        go to deactivate
      </button>
    </div>
  );
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(login).mockReset();
  vi.mocked(reactivateAccount).mockReset();
  vi.mocked(deactivateAccount).mockReset();
  vi.mocked(deleteInactiveAccount).mockReset();
});

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/settings/deactivate"]}>
      <Routes>
        <Route path="/" element={<HomeStub />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/account/inactive" element={<InactiveAccountPage />} />
        <Route path="/settings/deactivate" element={<DeactivateAccountPage />} />
        <Route path="/settings/privacy" element={<p>privacy settings</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function deactivateFromSettings(password: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
}

async function loginAs(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("account deactivation lifecycle (UI walk)", () => {
  // Three sequential ~2.5s auto-redirects to /login -> well past the 5s
  // default per-test timeout.
  it("deactivate → reactivate → deactivate → delete-from-inactive → locked out", async () => {
    window.sessionStorage.setItem("sn_access_token", "original-token");
    vi.mocked(deactivateAccount).mockResolvedValue(undefined);
    vi.mocked(deleteInactiveAccount).mockResolvedValueOnce(undefined);
    vi.mocked(reactivateAccount).mockResolvedValueOnce(TOKENS);

    renderApp();

    // 1) Deactivate from Settings.
    await deactivateFromSettings("hunter2");
    await waitFor(() => expect(deactivateAccount).toHaveBeenCalledWith("original-token", "hunter2"));
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    // The success message, then the auto-redirect to /login.
    await screen.findByRole("status");
    await waitFor(() => expect(screen.getByText("Welcome Back")).not.toBeNull(), { timeout: 3500 });

    // 2) Login is rejected as deactivated → Inactive Account interstitial.
    vi.mocked(login).mockRejectedValueOnce(
      new AuthApiError("This account has been deactivated.", { status: 401, code: "account_deactivated" }),
    );
    await loginAs("sam@example.com", "hunter2");
    expect(await screen.findByRole("heading", { name: "Hello!" })).not.toBeNull();

    // 3) Reactivate → tokens stored → signed back in on the home feed.
    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));
    await waitFor(() =>
      expect(reactivateAccount).toHaveBeenCalledWith("sam@example.com", "hunter2"),
    );
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("reactivated-access");
    expect(await screen.findByText("home feed")).not.toBeNull();

    // 4) Deactivate again from Settings.
    fireEvent.click(screen.getByRole("button", { name: "go to deactivate" }));
    await deactivateFromSettings("hunter2");
    await waitFor(() =>
      expect(deactivateAccount).toHaveBeenCalledWith("reactivated-access", "hunter2"),
    );
    await waitFor(() => expect(screen.getByText("Welcome Back")).not.toBeNull(), { timeout: 3500 });

    // 5) Login rejected as deactivated again → interstitial → Delete.
    vi.mocked(login).mockRejectedValueOnce(
      new AuthApiError("This account has been deactivated.", { status: 401, code: "account_deactivated" }),
    );
    await loginAs("sam@example.com", "hunter2");
    await screen.findByRole("heading", { name: "Hello!" });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    // 6) Delete-from-inactive with the 30-day grace confirm.
    expect(await screen.findByRole("heading", { name: "Delete your account?" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() =>
      expect(deleteInactiveAccount).toHaveBeenCalledWith("sam@example.com", "hunter2"),
    );
    expect((await screen.findByRole("status")).textContent).toMatch(/30 days to sign back in/i);
    await waitFor(() => expect(screen.getByText("Welcome Back")).not.toBeNull(), { timeout: 3500 });

    // 7) The account is now pending_deletion — login gets the generic
    //    rejection (no "deactivated" code), so there is no way back to
    //    the interstitial. It stays on /login with a wrong-credentials
    //    message. Mirrors K2's e2e "login/reactivate now rejected".
    vi.mocked(login).mockRejectedValueOnce(
      new AuthApiError("That email and password don't match.", { status: 401 }),
    );
    await loginAs("sam@example.com", "hunter2");
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/don.t match/i);
    expect(screen.queryByRole("heading", { name: "Hello!" })).toBeNull();
  }, 30000);
});
