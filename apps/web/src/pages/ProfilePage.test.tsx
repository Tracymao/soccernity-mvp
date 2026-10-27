// Following AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established
// pattern -- plain DOM assertions only, no @testing-library/jest-dom.
// Mocks src/api/users.ts and src/api/auth.ts rather than hitting a real
// network call. Session seeded directly into sessionStorage, same
// approach as GuardianConsentPage.test.tsx.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ProfilePage from "./ProfilePage";
import { UsersApiError } from "../api/users";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return {
    ...actual,
    getUser: vi.fn(),
    updateUser: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
  };
});

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    changePassword: vi.fn(),
    deactivateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  };
});

// The pinned contest entry is covered by community/PinnedEntry.test.tsx; here only the wiring.
vi.mock("./community/PinnedEntry", () => ({
  default: (props: { userId: string; currentUserId: string }) => (
    <div data-testid="pinned-entry-stub">{`${props.userId}|${props.currentUserId}`}</div>
  ),
}));

import { getUser, updateUser, getFollowers, getFollowing } from "../api/users";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeAccessToken(sub = "user-1"): string {
  const header = base64UrlEncode({ alg: "none", typ: "JWT" });
  const payload = base64UrlEncode({ sub, role: "fan" });
  return `${header}.${payload}.signature`;
}

const BASE_PROFILE: UserProfile = {
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
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
  vi.mocked(updateUser).mockReset();
  vi.mocked(getFollowers).mockReset();
  vi.mocked(getFollowing).mockReset();
});

function renderProfilePage(entry = "/profile") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe("ProfilePage", () => {
  it("shows a log-in prompt and never calls GET /users/:id when no session exists", () => {
    renderProfilePage();

    expect(screen.getByText(/log in to view your profile/i)).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("loads and renders the caller's own profile via GET /users/:id, using the id from the decoded access token", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);

    renderProfilePage();

    expect(await screen.findByText("Adeniyi Christiana")).not.toBeNull();
    expect(screen.getByText("adeniyi@example.com")).not.toBeNull();
    expect(getUser).toHaveBeenCalledWith(expect.any(String), "user-1");
  });

  it("shows the pinned contest entry for the owner on the Posts tab, and not on the Media tab", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);

    renderProfilePage();

    expect((await screen.findByTestId("pinned-entry-stub")).textContent).toBe("user-1|user-1");
    fireEvent.click(screen.getByRole("button", { name: "Media" }));
    expect(screen.queryByTestId("pinned-entry-stub")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Posts" }));
    expect(screen.getByTestId("pinned-entry-stub")).not.toBeNull();
  });

  it("/profile?edit=1 opens the edit form straight away (the image-decision notification row lands here)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce({
      ...BASE_PROFILE,
      avatar: { url: "u", status: "rejected", rejectionReason: "Not a clear photo of you" },
    });

    renderProfilePage("/profile?edit=1");

    expect(await screen.findByTestId("profile-image-avatar")).not.toBeNull();
    // The owner sees the moderator's reason on the rejected picture.
    expect(await screen.findByText(/Reason: Not a clear photo of you/)).not.toBeNull();
  });

  it("without ?edit=1 the edit form stays closed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);

    renderProfilePage();

    await screen.findByRole("button", { name: "Edit Profile" });
    expect(screen.queryByTestId("profile-image-avatar")).toBeNull();
  });

  it("shows a guardian consent status link when the profile is a minor", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce({ ...BASE_PROFILE, isMinor: true });

    renderProfilePage();

    const link = await screen.findByRole("link", { name: /guardian consent status/i });
    expect(link.getAttribute("href")).toBe("/guardian-consent");
  });

  it("loads followers via GET /users/:id/followers when the Followers stat is clicked, and supports Load more", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    vi.mocked(getFollowers).mockResolvedValueOnce({
      items: [{ id: "f1", publicName: "Emeka John" }],
      nextCursor: "cursor-1",
    });
    vi.mocked(getFollowers).mockResolvedValueOnce({
      items: [{ id: "f2", publicName: "Abdul Yusuf" }],
      nextCursor: null,
    });

    renderProfilePage();
    await screen.findByText("Adeniyi Christiana");

    fireEvent.click(screen.getByRole("button", { name: /followers/i }));
    expect(await screen.findByText("Emeka John")).not.toBeNull();
    expect(getFollowers).toHaveBeenCalledWith(expect.any(String), "user-1");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(screen.getByText("Abdul Yusuf")).not.toBeNull());
    expect(getFollowers).toHaveBeenLastCalledWith(expect.any(String), "user-1", "cursor-1");
  });

  it("opens Edit Profile with Bio, Country and Preferred Club editable and Date of Birth read-only, and saves only what changed via PATCH /users/:id", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    vi.mocked(updateUser).mockResolvedValueOnce({ ...BASE_PROFILE, publicName: "Adeniyi Okafor" });

    renderProfilePage();
    await screen.findByText("Adeniyi Christiana");

    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));

    expect((screen.getByLabelText(/Bio/) as HTMLTextAreaElement).disabled).toBe(false);
    expect((screen.getByLabelText(/Country/) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByLabelText(/Preferred Club/) as HTMLInputElement).disabled).toBe(false);
    const dobField = screen.getByLabelText(/Date of Birth/) as HTMLInputElement;
    expect(dobField.readOnly).toBe(true);

    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Okafor" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Profile" }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(expect.any(String), "user-1", { displayName: "Adeniyi Okafor" }),
    );
    expect(await screen.findByText("Adeniyi Okafor")).not.toBeNull();
  });

  it("shows an error message when saving fails, without closing the modal", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    vi.mocked(updateUser).mockRejectedValueOnce(new UsersApiError("Couldn't save those changes (500)."));

    renderProfilePage();
    await screen.findByText("Adeniyi Christiana");
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Update Profile" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t save those changes/i);
  });
});
