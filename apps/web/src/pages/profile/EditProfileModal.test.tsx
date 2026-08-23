// sprint-1/f5-f6-bugfixes -- Bug 2 fix tests. Following
// AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established pattern
// (plain DOM assertions, no @testing-library/jest-dom, mock the api
// modules) and GuardianConsentConfirmPage.test.tsx's precedent for
// asserting real sessionStorage/localStorage state directly rather than
// trusting the component's own internal state.
//
// Real timers throughout, deliberately -- POST_ACTION_REDIRECT_DELAY_MS
// (EditProfileModal.tsx) is a real ~2.5s delay, and mixing vitest's fake
// timers with @testing-library's findBy*/waitFor polling is a known
// source of flakiness. Waiting out the real delay via a generous waitFor
// timeout is slower but reliable -- this file's own tests take a few
// real seconds each, not milliseconds.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import EditProfileModal from "./EditProfileModal";
import { AuthApiError } from "../../api/auth";
import type { UserProfile } from "../../api/users";

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, changePassword: vi.fn(), deactivateAccount: vi.fn(), deleteAccount: vi.fn() };
});

import { deactivateAccount, deleteAccount } from "../../api/auth";

const USER: UserProfile = {
  id: "user-1",
  email: "adeniyi@example.com",
  phone: null,
  displayName: "Adeniyi Christiana",
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
};

afterEach(cleanup);
beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(deactivateAccount).mockReset();
  vi.mocked(deleteAccount).mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function renderModal() {
  render(
    <MemoryRouter>
      <EditProfileModal accessToken="token-abc" user={USER} onClose={vi.fn()} onSaved={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("EditProfileModal -- Bug 2 fix: stale session after deactivation/deletion", () => {
  it(
    "clears the stored session immediately and redirects to /login after a successful deactivation",
    async () => {
      window.sessionStorage.setItem("sn_access_token", "stale-token");
      window.localStorage.setItem("sn_refresh_token", "stale-refresh");
      vi.mocked(deactivateAccount).mockResolvedValueOnce(undefined);

      renderModal();
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      fireEvent.change(screen.getByLabelText("Password to confirm deactivation"), {
        target: { value: "my-password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));

      // Session is cleared as soon as the success message appears -- i.e.
      // immediately, not held onto for the redirect delay.
      expect(await screen.findByText(/your account has been deactivated/i)).not.toBeNull();
      expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
      expect(window.localStorage.getItem("sn_refresh_token")).toBeNull();
      expect(navigateMock).not.toHaveBeenCalled();

      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 4000 });
    },
    6000,
  );

  it("does not clear the session or redirect when deactivation fails", async () => {
    window.sessionStorage.setItem("sn_access_token", "stale-token");
    vi.mocked(deactivateAccount).mockRejectedValueOnce(new AuthApiError("Incorrect password"));

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.change(screen.getByLabelText("Password to confirm deactivation"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("stale-token");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it(
    "applies the identical fix to delete-account: clears the session immediately and redirects to /login",
    async () => {
      window.sessionStorage.setItem("sn_access_token", "stale-token");
      vi.mocked(deleteAccount).mockResolvedValueOnce(undefined);

      renderModal();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      fireEvent.change(screen.getByLabelText("Password to confirm deletion"), {
        target: { value: "my-password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Confirm account deletion request" }));

      expect(await screen.findByText(/your request has been received/i)).not.toBeNull();
      expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
      expect(navigateMock).not.toHaveBeenCalled();

      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"), { timeout: 4000 });
    },
    6000,
  );

  it("does not clear the session or redirect when account deletion fails", async () => {
    window.sessionStorage.setItem("sn_access_token", "stale-token");
    vi.mocked(deleteAccount).mockRejectedValueOnce(new AuthApiError("Incorrect password"));

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.change(screen.getByLabelText("Password to confirm deletion"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm account deletion request" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(window.sessionStorage.getItem("sn_access_token")).toBe("stale-token");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
