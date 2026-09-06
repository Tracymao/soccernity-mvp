// InactiveAccountPage (/account/inactive) — the login-time interstitial
// for a deactivated account. Conventions match the other page tests;
// react-router's location.state carries the { email, password } that
// LoginPage would have passed. POST /auth/reactivate-account and
// /auth/delete-inactive-account are real merged endpoints.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import InactiveAccountPage from "./InactiveAccountPage";
import { AuthApiError, type LoginResponse } from "../api/auth";

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, reactivateAccount: vi.fn(), deleteInactiveAccount: vi.fn() };
});

import { reactivateAccount, deleteInactiveAccount } from "../api/auth";

const TOKENS: LoginResponse = {
  accessToken: "new-access",
  accessTokenExpiresIn: 900,
  refreshToken: "new-refresh",
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

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  navigateMock.mockReset();
  vi.mocked(reactivateAccount).mockReset();
  vi.mocked(deleteInactiveAccount).mockReset();
});

function renderWithCreds(state: unknown = { email: "sam@example.com", password: "hunter2" }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/account/inactive", state }]}>
      <Routes>
        <Route path="/account/inactive" element={<InactiveAccountPage />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InactiveAccountPage", () => {
  it("redirects to /login when there are no carried credentials", () => {
    renderWithCreds(null);
    expect(screen.getByText("login page")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Hello!" })).toBeNull();
  });

  it("renders the Activate / Delete choice for a carried-in inactive account", () => {
    renderWithCreds();
    expect(screen.getByRole("heading", { name: "Hello!" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Activate account" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete account" })).not.toBeNull();
    // No password field on the choice screen — the password is already
    // known from the login attempt.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it("reactivates with the carried credentials, stores the tokens, and lands on /", async () => {
    vi.mocked(reactivateAccount).mockResolvedValueOnce(TOKENS);
    renderWithCreds();

    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));

    await waitFor(() => expect(reactivateAccount).toHaveBeenCalledWith("sam@example.com", "hunter2"));
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("new-access");
    expect(window.sessionStorage.getItem("sn_refresh_token")).toBe("new-refresh");
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("shows an inline error and does not navigate when reactivation is rejected", async () => {
    vi.mocked(reactivateAccount).mockRejectedValueOnce(
      new AuthApiError("We couldn't reactivate this account.", { status: 401 }),
    );
    renderWithCreds();

    fireEvent.click(screen.getByRole("button", { name: "Activate account" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(navigateMock).not.toHaveBeenCalledWith("/");
  });

  it("Delete account → 30-day-grace confirm step with a required password re-entry", async () => {
    renderWithCreds();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByRole("heading", { name: "Delete your account?" })).not.toBeNull();
    expect(screen.getByText(/30-day grace period/i)).not.toBeNull();

    // Empty password → validation, no call.
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("alert").textContent).toMatch(/enter your password/i);
    expect(deleteInactiveAccount).not.toHaveBeenCalled();
  });

  it("submits delete-from-inactive and redirects to /login after the grace message", async () => {
    vi.mocked(deleteInactiveAccount).mockResolvedValueOnce(undefined);
    renderWithCreds();

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() =>
      expect(deleteInactiveAccount).toHaveBeenCalledWith("sam@example.com", "hunter2"),
    );
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/30 days to sign back in and cancel/i);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 3500 });
  });

  it("Cancel on the delete step returns to the Activate / Delete choice", () => {
    renderWithCreds();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Hello!" })).not.toBeNull();
  });
});
