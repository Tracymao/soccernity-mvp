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

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, updateUser: vi.fn() };
});

import { deactivateAccount, deleteAccount } from "../../api/auth";
import { updateUser, UsersApiError } from "../../api/users";

const USER: UserProfile = {
  id: "user-1",
  email: "adeniyi@example.com",
  phone: null,
  displayName: "Adeniyi Christiana",
  username: null,
  publicName: "Adeniyi Christiana",
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  profileComplete: true,
  guardianConsentStatus: "not_applicable",
  nextStep: "none",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
  isTeamOrganiser: false,
  representedClub: null,
  bio: null,
  preferredClub: null,
  profileCountry: null,
  avatar: null,
  cover: null,
};

afterEach(cleanup);
beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(deactivateAccount).mockReset();
  vi.mocked(deleteAccount).mockReset();
  vi.mocked(updateUser).mockReset();
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

describe("EditProfileModal -- Username (profile/username-column-and-display-convention)", () => {
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Update Profile" }));
  const usernameInput = () => screen.getByLabelText("Username") as HTMLInputElement;

  function renderWith(user: UserProfile) {
    render(
      <MemoryRouter>
        <EditProfileModal accessToken="token-abc" user={user} onClose={vi.fn()} onSaved={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it("shows the current username, and sends the new one when it is set", async () => {
    vi.mocked(updateUser).mockResolvedValueOnce({ ...USER, username: "goalie_9", publicName: "goalie_9" });
    renderWith(USER);
    expect(usernameInput().value).toBe("");

    fireEvent.change(usernameInput(), { target: { value: "  goalie_9 " } });
    save();

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateUser).mock.calls[0][2]).toMatchObject({ username: "goalie_9" });
  });

  it("does not send a username at all when it was not changed (fallback-to-displayName users are untouched)", async () => {
    vi.mocked(updateUser).mockResolvedValueOnce(USER);
    renderWith(USER);
    save();

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateUser).mock.calls[0][2]).not.toHaveProperty("username");
  });

  it("never sends username null: emptying an existing username is refused client-side (B-133)", async () => {
    const withHandle = { ...USER, username: "goalie_9", publicName: "goalie_9" };
    renderWith(withHandle);
    expect(usernameInput().value).toBe("goalie_9");

    fireEvent.change(usernameInput(), { target: { value: "" } });
    save();

    expect(await screen.findByText(/a username can.t be removed/i)).not.toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("no longer calls the username optional (QA D-05)", () => {
    renderWith(USER);
    expect(document.body.textContent ?? "").not.toMatch(/optional\. if you set one/i);
  });

  it("shows the server's username_* error under the username field, with its message verbatim (B-133)", async () => {
    vi.mocked(updateUser).mockRejectedValueOnce(
      new UsersApiError("You changed your username recently. You can change it again on 2026-11-18.", {
        status: 429,
        code: "username_change_cooldown",
      }),
    );
    renderWith({ ...USER, username: "goalie_9", publicName: "goalie_9" });
    fireEvent.change(usernameInput(), { target: { value: "goalie_10" } });
    save();

    const alert = await screen.findByText(/you changed your username recently/i);
    expect(alert.id).toBe("edit-profile-username-error");
  });

  it("rejects an invalid username client-side without calling the API", async () => {
    renderWith(USER);
    fireEvent.change(usernameInput(), { target: { value: "no spaces!" } });
    save();

    expect(await screen.findByText(/username must be 3-30 characters/i)).not.toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces the server's 409 when the username is already taken", async () => {
    vi.mocked(updateUser).mockRejectedValueOnce(
      new UsersApiError("That username is already taken", { status: 409 }),
    );
    renderWith(USER);
    fireEvent.change(usernameInput(), { target: { value: "taken_name" } });
    save();

    expect(await screen.findByText("That username is already taken")).not.toBeNull();
  });
});

describe("EditProfileModal -- bio, country, preferred club, images (B-081, B-194, B-195, B-196)", () => {
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Update Profile" }));

  function renderWith(user: UserProfile) {
    render(
      <MemoryRouter>
        <EditProfileModal accessToken="token-abc" user={user} onClose={vi.fn()} onSaved={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it("shows a read-only date of birth and both image controls", () => {
    renderWith(USER);
    const dob = screen.getByLabelText(/Date of Birth/) as HTMLInputElement;
    expect(dob.readOnly).toBe(true);
    expect(screen.getByTestId("profile-image-avatar")).not.toBeNull();
    expect(screen.getByTestId("profile-image-cover")).not.toBeNull();
  });

  it("sends the changed profile fields (and no username when it did not change)", async () => {
    vi.mocked(updateUser).mockResolvedValueOnce(USER);
    renderWith(USER);
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "Winger from Lagos" } });
    fireEvent.change(screen.getByLabelText(/Country/), { target: { value: "NG" } });
    fireEvent.change(screen.getByLabelText(/Preferred Club/), { target: { value: "Ikoyi Rovers" } });
    save();
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    const body = vi.mocked(updateUser).mock.calls[0][2];
    expect(body).toMatchObject({ bio: "Winger from Lagos", profileCountry: "NG", preferredClub: "Ikoyi Rovers" });
    // The unchanged username is not sent.
    expect(body).not.toHaveProperty("username");
  });

  it("a flagged bio shows 'Please rephrase', keeps the typed text and offers no override", async () => {
    vi.mocked(updateUser).mockRejectedValueOnce(
      new UsersApiError("Please rephrase.", {
        status: 422,
        code: "sensitive_content_rephrase_required",
        flaggedFields: [{ field: "bio", categories: ["health"] }],
      }),
    );
    renderWith(USER);
    fireEvent.change(screen.getByLabelText(/Bio/), { target: { value: "my typed bio" } });
    save();
    expect(await screen.findByText("Please rephrase")).not.toBeNull();
    expect((screen.getByLabelText(/Bio/) as HTMLTextAreaElement).value).toBe("my typed bio");
    expect(screen.queryByRole("button", { name: /anyway|override/i })).toBeNull();
  });

  it("clearing a previously-set country sends null (the country is optional)", async () => {
    vi.mocked(updateUser).mockResolvedValueOnce(USER);
    renderWith({ ...USER, profileCountry: "NG" });
    fireEvent.change(screen.getByLabelText(/Country/), { target: { value: "" } });
    save();
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    const body = vi.mocked(updateUser).mock.calls[0][2];
    expect(body).toMatchObject({ profileCountry: null });
    expect(body).not.toHaveProperty("bio");
  });
});
