// The one small line on your own profile while "Public profile" is off (B-060, Figma PV2 / PV6).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PrivateProfileNote, { PRIVATE_PROFILE_NOTE } from "./PrivateProfileNote";
import { UserSettingsApiError, type UserSettings } from "../../api/userSettings";

vi.mock("../../api/userSettings", async () => {
  const actual = await vi.importActual<typeof import("../../api/userSettings")>("../../api/userSettings");
  return { ...actual, getUserSettings: vi.fn() };
});
import { getUserSettings } from "../../api/userSettings";
import { seedSession, clearSession } from "../../test/session";

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession("token");
  vi.mocked(getUserSettings).mockReset();
});

const settings = (isProfilePublic: boolean): UserSettings => ({
  dmPermission: "everyone",
  mediaSensitive: false,
  readReceipts: true,
  isProfilePublic,
});

describe("PrivateProfileNote", () => {
  it("shows the tagged line for an adult whose profile is private", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings(false));
    render(<PrivateProfileNote isMinor={false} />);
    expect((await screen.findByTestId("private-profile-note")).textContent).toBe(PRIVATE_PROFILE_NOTE);
    expect(PRIVATE_PROFILE_NOTE).toBe("Only people who follow you can see your profile. [COPY PENDING LEGAL REVIEW]");
  });

  it("shows nothing while the profile is public", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settings(true));
    render(<PrivateProfileNote isMinor={false} />);
    await waitFor(() => expect(getUserSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("private-profile-note")).toBeNull();
  });

  it("asks nothing and shows nothing for an under-18 account", async () => {
    render(<PrivateProfileNote isMinor />);
    expect(screen.queryByTestId("private-profile-note")).toBeNull();
    expect(getUserSettings).not.toHaveBeenCalled();
  });

  it("shows nothing when the settings cannot be read", async () => {
    vi.mocked(getUserSettings).mockRejectedValue(new UserSettingsApiError("x", { status: 500 }));
    render(<PrivateProfileNote isMinor={false} />);
    await waitFor(() => expect(getUserSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("private-profile-note")).toBeNull();
  });
});
