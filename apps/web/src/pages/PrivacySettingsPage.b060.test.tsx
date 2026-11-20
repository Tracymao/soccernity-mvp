// B-060: the Download my data row is a real link, and the Adult / Under 18 variants of the Privacy
// page (Figma 6991:53454 / 6991:53687). The older PrivacySettingsPage.test.tsx is unchanged.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PrivacySettingsPage from "./PrivacySettingsPage";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
vi.mock("../api/userSettings", async () => {
  const actual = await vi.importActual<typeof import("../api/userSettings")>("../api/userSettings");
  return { ...actual, getUserSettings: vi.fn(), updateUserSettings: vi.fn() };
});
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, getGuardianConsentStatus: vi.fn() };
});

import { getUser } from "../api/users";
import { getUserSettings } from "../api/userSettings";
import { getGuardianConsentStatus } from "../api/auth";
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const token = (sub: string) => `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;

const ADULT = {
  id: "user-1",
  email: "a@example.com",
  isMinor: false,
  role: "fan",
} as unknown as UserProfile;
const MINOR = { ...ADULT, id: "user-2", isMinor: true } as UserProfile;

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(getUser).mockReset();
  vi.mocked(getGuardianConsentStatus).mockReset();
  vi.mocked(getUserSettings).mockReset();
  vi.mocked(getUserSettings).mockResolvedValue({
    dmPermission: "everyone",
    mediaSensitive: false,
    readReceipts: true,
    isProfilePublic: true,
  });
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy"]}>
      <PrivacySettingsPage />
    </MemoryRouter>,
  );
}

describe("Download my data row", () => {
  it("is an enabled link to the flow, with the frame description and no 'not available' note", async () => {
    seedSession(token("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);
    renderPage();
    await screen.findByText("Download my data");
    const link = screen.getByRole("link", { name: /download my data/i });
    expect(link.getAttribute("href")).toBe("/settings/privacy/download-data");
    expect(link.className).not.toMatch(/disabled/);
    expect(screen.getByText("Download a copy of your profile, posts, comments, follows and the messages you sent.")).not.toBeNull();
    expect(link.textContent).not.toMatch(/not available yet/i);
  });
});

describe("Adult variant", () => {
  it("shows Public profile and no Guardian approval row", async () => {
    seedSession(token("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);
    renderPage();
    expect(await screen.findByText("Public profile")).not.toBeNull();
    expect(screen.queryByText("Guardian approval")).toBeNull();
  });

  it("keeps Marketing emails visibly disabled (no backend, no decision); Public profile is a live switch (B-060)", async () => {
    seedSession(token("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);
    renderPage();
    await screen.findByText("Public profile");
    expect(await screen.findByRole("switch", { name: "Public profile" })).not.toBeNull();
    expect(screen.queryByRole("img", { name: /public profile/i })).toBeNull();
    expect(screen.getByRole("img", { name: /marketing emails: off \(not adjustable yet\)/i })).not.toBeNull();
    expect(screen.getByText("Coming soon")).not.toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // The only live switch is Public profile: Marketing emails is not one.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("makes Your Post and Direct Message real links (B-061)", async () => {
    seedSession(token("user-1"));
    vi.mocked(getUser).mockResolvedValueOnce(ADULT);
    renderPage();
    await screen.findByText("Your Post");
    expect(screen.queryByText("Not available yet.")).toBeNull();
    expect(screen.getByRole("link", { name: /your post/i }).getAttribute("href")).toBe("/settings/privacy/your-posts");
    expect(screen.getByRole("link", { name: /direct message/i }).getAttribute("href")).toBe(
      "/settings/privacy/direct-messages",
    );
  });
});

describe("Under 18 variant", () => {
  it("drops the Public profile row and shows Guardian approval linked to the consent status page", async () => {
    seedSession(token("user-2"));
    vi.mocked(getUser).mockResolvedValueOnce(MINOR);
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "confirmed",
      guardianEmail: "p@example.com",
      canResend: false,
      consentTimestamp: "2026-02-01T00:00:00.000Z",
    });
    renderPage();
    expect(await screen.findByText("Guardian approval")).not.toBeNull();
    expect(screen.queryByText("Public profile")).toBeNull();
    expect(screen.getByRole("link", { name: /view consent status/i }).getAttribute("href")).toBe("/guardian-consent");
    // Download my data is still a real link for a minor.
    expect(screen.getByRole("link", { name: /download my data/i }).getAttribute("href")).toBe(
      "/settings/privacy/download-data",
    );
  });
});
