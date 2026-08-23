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
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
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

function renderProfilePage() {
  render(
    <MemoryRouter initialEntries={["/profile"]}>
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
      items: [{ id: "f1", displayName: "Emeka John" }],
      nextCursor: "cursor-1",
    });
    vi.mocked(getFollowers).mockResolvedValueOnce({
      items: [{ id: "f2", displayName: "Abdul Yusuf" }],
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

  it("opens Edit Profile, renders Bio/Location/Preferred Club/Date of Birth as disabled, and saves via PATCH /users/:id", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    vi.mocked(updateUser).mockResolvedValueOnce({ ...BASE_PROFILE, displayName: "Adeniyi Okafor" });

    renderProfilePage();
    await screen.findByText("Adeniyi Christiana");

    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));

    const bioField = screen.getByLabelText("Bio") as HTMLTextAreaElement;
    const locationField = screen.getByLabelText("Location") as HTMLInputElement;
    const clubField = screen.getByLabelText("Preferred Club") as HTMLInputElement;
    const dobField = screen.getByLabelText("Date of Birth") as HTMLInputElement;
    expect(bioField.disabled).toBe(true);
    expect(locationField.disabled).toBe(true);
    expect(clubField.disabled).toBe(true);
    expect(dobField.disabled).toBe(true);

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
