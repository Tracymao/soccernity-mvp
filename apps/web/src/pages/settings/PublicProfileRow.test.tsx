// The live Public profile row (B-060, Figma PP1 to PP8): loading skeleton, on, off, saving, save failed
// (the switch goes back and the drawn banner shows), load failed with a retry. Mocks api/userSettings.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PublicProfileRow, { PUBLIC_PROFILE_MESSAGES } from "./PublicProfileRow";
import { UserSettingsApiError, type UserSettings } from "../../api/userSettings";

vi.mock("../../api/userSettings", async () => {
  const actual = await vi.importActual<typeof import("../../api/userSettings")>("../../api/userSettings");
  return { ...actual, getUserSettings: vi.fn(), updateUserSettings: vi.fn() };
});

import { getUserSettings, updateUserSettings } from "../../api/userSettings";
import { seedSession, clearSession } from "../../test/session";

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(getUserSettings).mockReset();
  vi.mocked(updateUserSettings).mockReset();
});

const settings = (isProfilePublic: boolean): UserSettings => ({
  dmPermission: "everyone",
  mediaSensitive: false,
  readReceipts: true,
  isProfilePublic,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderRow() {
  render(
    <ul>
      <PublicProfileRow />
    </ul>,
  );
}

const toggle = () => screen.getByRole("switch", { name: "Public profile" }) as HTMLButtonElement;

describe("Public profile row", () => {
  it("shows a skeleton of the same shape while the settings load, and requests only GET /users/me/settings", async () => {
    seedSession("token");
    const d = deferred<UserSettings>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderRow();
    expect(screen.getByTestId("public-profile-skeleton")).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    d.resolve(settings(true));
    await screen.findByRole("switch", { name: "Public profile" });
    expect(screen.queryByTestId("public-profile-skeleton")).toBeNull();
    expect(getUserSettings).toHaveBeenCalledTimes(1);
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it("draws On with the drawn description and no 'not adjustable' note (PP1 / PP5)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(PUBLIC_PROFILE_MESSAGES.description)).not.toBeNull();
    expect(PUBLIC_PROFILE_MESSAGES.description).toBe(
      "When this is off, only people who follow you can see your profile, posts, and activity.",
    );
    expect(screen.queryByText(/not adjustable yet/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("draws Off when the setting is off (PP2 / PP6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(false));
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("flips at once, says Saving and locks the switch while saving, sends only isProfilePublic (PP3 / PP7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    const d = deferred<UserSettings>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });

    fireEvent.click(toggle());

    expect(updateUserSettings).toHaveBeenCalledTimes(1);
    expect(updateUserSettings).toHaveBeenCalledWith("token", { isProfilePublic: false });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().matches(":disabled")).toBe(true);
    expect(screen.getByText(PUBLIC_PROFILE_MESSAGES.saving)).not.toBeNull();

    // A second press while saving does nothing.
    fireEvent.click(toggle());
    expect(updateUserSettings).toHaveBeenCalledTimes(1);

    d.resolve(settings(false));
    await waitFor(() => expect(screen.queryByText(PUBLIC_PROFILE_MESSAGES.saving)).toBeNull());
    expect(toggle().matches(":disabled")).toBe(false);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns it back on with a second PATCH", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(false));
    vi.mocked(updateUserSettings).mockResolvedValueOnce(settings(true));
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });
    fireEvent.click(toggle());
    expect(updateUserSettings).toHaveBeenCalledWith("token", { isProfilePublic: true });
    await waitFor(() => expect(toggle().matches(":disabled")).toBe(false));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("puts the switch back and shows the drawn banner when the save fails (PP4 / PP8)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope", { status: 500 }));
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });

    fireEvent.click(toggle());

    expect((await screen.findByRole("alert")).textContent).toBe(PUBLIC_PROFILE_MESSAGES.saveFailed);
    expect(PUBLIC_PROFILE_MESSAGES.saveFailed).toBe("Couldn’t save your change. Your setting is back to what it was.");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(toggle().matches(":disabled")).toBe(false);
  });

  it("a refused save (403, an under-18 account) is put back the same way", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("forbidden", { status: 403 }));
    renderRow();
    await screen.findByRole("switch", { name: "Public profile" });
    fireEvent.click(toggle());
    await screen.findByRole("alert");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the row with a plain line and a retry when the settings cannot be loaded", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockRejectedValueOnce(new UserSettingsApiError("x", { status: 500 }));
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    renderRow();
    expect(await screen.findByText("Public profile")).not.toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain(PUBLIC_PROFILE_MESSAGES.loadFailed);
    expect(screen.queryByRole("switch")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("switch", { name: "Public profile" });
    expect(getUserSettings).toHaveBeenCalledTimes(2);
  });

  it("renders nothing and calls nothing without a session", () => {
    renderRow();
    expect(screen.queryByText("Public profile")).toBeNull();
    expect(getUserSettings).not.toHaveBeenCalled();
  });
});
