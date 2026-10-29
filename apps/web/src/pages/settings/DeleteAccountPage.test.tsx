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
import { seedSession, clearSession, heldAccessToken } from "../../test/session";

afterEach(cleanup);
beforeEach(() => {
  clearSession();
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

describe("DeleteAccountPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your account/i)).not.toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("states the 30-day grace period and never implies instant deletion", () => {
    seedSession("token-abc");
    renderPage();
    expect(screen.getByText(/30-day grace period/i)).not.toBeNull();
    expect(screen.getByText(/sign back in within 30 days to cancel/i)).not.toBeNull();
  });

  it("blocks with an empty password and does not call the API", () => {
    seedSession("token-abc");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("alert").textContent).toMatch(/enter your password/i);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("submits, clears the session, shows grace-period copy, and redirects to /login", async () => {
    seedSession("token-abc");
    vi.mocked(deleteAccount).mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith("token-abc", "hunter2"));
    expect(heldAccessToken()).toBeNull();
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/30 days to sign back in and cancel/i);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 3500 });
  });

  it("shows an error and keeps the session on a wrong password", async () => {
    seedSession("token-abc");
    vi.mocked(deleteAccount).mockRejectedValueOnce(new AuthApiError("That password is incorrect.", { status: 401 }));
    renderPage();

    fireEvent.change(screen.getByLabelText(/enter your password to confirm/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(heldAccessToken()).toBe("token-abc");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("Cancel links back to /settings/account", () => {
    seedSession("token-abc");
    renderPage();
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/settings/account");
  });
});
