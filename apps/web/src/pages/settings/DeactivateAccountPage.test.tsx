// DeactivateAccountPage (/settings/deactivate). Follows
// PrivacySettingsPage.test.tsx / EditProfileModal.test.tsx: plain DOM
// assertions, mocks src/api/auth.ts, session seeded into sessionStorage,
// useNavigate mocked. POST /auth/deactivate-account is a real merged
// endpoint — exercising it live is services/api's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DeactivateAccountPage from "./DeactivateAccountPage";
import { AuthApiError } from "../../api/auth";

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, deactivateAccount: vi.fn() };
});

import { deactivateAccount } from "../../api/auth";

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  navigateMock.mockReset();
  vi.mocked(deactivateAccount).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/deactivate"]}>
      <DeactivateAccountPage />
    </MemoryRouter>,
  );
}

function seedSession() {
  window.sessionStorage.setItem("sn_access_token", "token-abc");
}

describe("DeactivateAccountPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
    expect(deactivateAccount).not.toHaveBeenCalled();
  });

  it("advances intro → confirm on Continue and states deactivation has no time limit", () => {
    seedSession();
    renderPage();

    expect(screen.getByRole("heading", { name: "Deactivate Account" })).not.toBeNull();
    // The corrected K1 copy — deactivation is indefinite, not 30 days.
    expect(screen.getByText(/no time limit/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Deactivate your account" })).not.toBeNull();
    expect(screen.getByLabelText("Password")).not.toBeNull();
  });

  it("blocks confirm with an empty password and does not call the API", () => {
    seedSession();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));

    expect(screen.getByRole("alert").textContent).toMatch(/enter your password/i);
    expect(deactivateAccount).not.toHaveBeenCalled();
  });

  it("deactivates, clears the session, and redirects to /login on success", async () => {
    seedSession();
    window.localStorage.setItem("sn_refresh_token", "refresh-abc");
    vi.mocked(deactivateAccount).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));

    await waitFor(() => expect(deactivateAccount).toHaveBeenCalledWith("token-abc", "hunter2"));
    // Session cleared immediately on success (both storages, both keys).
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(window.localStorage.getItem("sn_refresh_token")).toBeNull();
    expect(await screen.findByRole("status")).not.toBeNull();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 3500 });
  });

  it("shows an error and keeps the session when the password is wrong", async () => {
    seedSession();
    vi.mocked(deactivateAccount).mockRejectedValueOnce(new AuthApiError("That password is incorrect.", { status: 401 }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/password is incorrect/i);
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("token-abc");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("Cancel on the confirm step links back to /settings/privacy", () => {
    seedSession();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/settings/privacy");
  });
});
