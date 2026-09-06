// DeleteAccountPage (/settings/delete-account). Same conventions as
// DeactivateAccountPage.test.tsx. POST /auth/delete-account is a real
// merged endpoint.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DeleteAccountPage from "./DeleteAccountPage";
import { AuthApiError } from "../../api/auth";

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, deleteAccount: vi.fn() };
});

import { deleteAccount } from "../../api/auth";

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  navigateMock.mockReset();
  vi.mocked(deleteAccount).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/delete-account"]}>
      <DeleteAccountPage />
    </MemoryRouter>,
  );
}

function seedSession() {
  window.sessionStorage.setItem("sn_access_token", "token-abc");
}

describe("DeleteAccountPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("states the 30-day grace period and never implies instant deletion", () => {
    seedSession();
    renderPage();
    expect(screen.getByText(/30-day grace period/i)).not.toBeNull();
    expect(screen.getByText(/sign back in within 30 days to cancel/i)).not.toBeNull();
  });

  it("blocks with an empty password and does not call the API", () => {
    seedSession();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("alert").textContent).toMatch(/enter your password/i);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("submits, clears the session, shows grace-period copy, and redirects to /login", async () => {
    seedSession();
    window.sessionStorage.setItem("sn_refresh_token", "refresh-abc");
    vi.mocked(deleteAccount).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("token-abc", "hunter2"));
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(window.sessionStorage.getItem("sn_refresh_token")).toBeNull();
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/30 days to sign back in and cancel/i);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 3500 });
  });

  it("shows an error and keeps the session on a wrong password", async () => {
    seedSession();
    vi.mocked(deleteAccount).mockRejectedValueOnce(new AuthApiError("That password is incorrect.", { status: 401 }));
    renderPage();

    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("token-abc");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("Cancel links back to /settings/privacy", () => {
    seedSession();
    renderPage();
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/settings/privacy");
  });
});
