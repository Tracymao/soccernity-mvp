// PrivacySettingsPage (Settings — Privacy). Follows
// ProfilePage.test.tsx / ClubsPage.test.tsx: plain DOM assertions, mocks
// src/api/users.ts + src/api/auth.ts, session seeded directly into
// sessionStorage. GET /users/:id and GET /auth/guardian-consent/status
// are real merged endpoints — exercising them live is services/api's job.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PrivacySettingsPage from "./PrivacySettingsPage";
import { AuthApiError } from "../api/auth";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, getGuardianConsentStatus: vi.fn() };
});

import { getUser } from "../api/users";
import { getGuardianConsentStatus } from "../api/auth";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

const ADULT: UserProfile = {
  id: "user-1",
  email: "adult@example.com",
  phone: null,
  displayName: "Adeniyi Christiana",
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
};

const MINOR: UserProfile = { ...ADULT, id: "user-2", email: "minor@example.com", isMinor: true };

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
  vi.mocked(getGuardianConsentStatus).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy"]}>
      <PrivacySettingsPage />
    </MemoryRouter>,
  );
}

describe("PrivacySettingsPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to manage your privacy settings/i)).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(getGuardianConsentStatus).not.toHaveBeenCalled();
  });

  it("renders the core rows for a signed-in adult, with the guardian row hidden", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);

    renderPage();

    expect(await screen.findByText("Public profile")).not.toBeNull();
    expect(screen.getByText("Your Post")).not.toBeNull();
    expect(screen.getByText("Direct Message")).not.toBeNull();
    expect(screen.getByText("Download my data")).not.toBeNull();
    expect(screen.getByText("Account status")).not.toBeNull();
    expect(screen.getByText("Marketing emails")).not.toBeNull();

    // Not a minor -> guardian row absent, and the endpoint is not called.
    expect(screen.queryByText("Guardian approval")).toBeNull();
    expect(getGuardianConsentStatus).not.toHaveBeenCalled();
  });

  it("links Account status actions to the deactivate / delete stub routes", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);

    renderPage();

    const deactivate = await screen.findByRole("link", { name: /deactivate account/i });
    const del = screen.getByRole("link", { name: /delete account/i });
    expect(deactivate.getAttribute("href")).toBe("/settings/deactivate");
    expect(del.getAttribute("href")).toBe("/settings/delete-account");
  });

  it("does not render any live control: the toggles are not real inputs", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);

    renderPage();
    await screen.findByText("Public profile");

    // No <input>/<button> for the privacy controls — nothing that looks
    // interactive but silently does nothing (task brief: flag, don't fake).
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/data export needs a backend endpoint/i)).not.toBeNull();
  });

  it("shows the guardian approval row with an 'Approved' pill for a minor with confirmed consent", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-2"));
    vi.mocked(getUser).mockResolvedValueOnce(MINOR);
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "confirmed",
      guardianEmail: "parent@example.com",
      canResend: false,
      consentTimestamp: "2026-02-01T00:00:00.000Z",
    });

    renderPage();

    expect(await screen.findByText("Guardian approval")).not.toBeNull();
    expect(screen.getByText("Approved")).not.toBeNull();
    expect(screen.getByRole("link", { name: /view consent status/i }).getAttribute("href")).toBe(
      "/guardian-consent",
    );
  });

  it("shows a 'Pending' guardian pill and the guardian email while consent is pending", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-2"));
    vi.mocked(getUser).mockResolvedValueOnce(MINOR);
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "parent@example.com",
      canResend: true,
      consentTimestamp: null,
    });

    renderPage();

    expect(await screen.findByText("Pending")).not.toBeNull();
    expect(screen.getByText(/parent@example\.com/)).not.toBeNull();
  });

  it("hides the guardian row when the status endpoint 404s (not actually a minor)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-2"));
    vi.mocked(getUser).mockResolvedValueOnce(MINOR);
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(
      new AuthApiError("not found", { status: 404 }),
    );

    renderPage();

    await screen.findByText("Public profile");
    expect(screen.queryByText("Guardian approval")).toBeNull();
  });

  it("shows a soft error in the guardian row when the status endpoint fails non-404", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-2"));
    vi.mocked(getUser).mockResolvedValueOnce(MINOR);
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(
      new AuthApiError("server error", { status: 500 }),
    );

    renderPage();

    expect(await screen.findByText("Guardian approval")).not.toBeNull();
    expect(screen.getByText(/couldn.t load your guardian approval status/i)).not.toBeNull();
  });

  it("shows an error state without crashing when GET /users/:id fails", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken("user-1"));
    vi.mocked(getUser).mockRejectedValueOnce(new Error("boom"));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load your settings/i);
  });
});
