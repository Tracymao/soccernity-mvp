// The two live Notification Preferences leaves (build register B-062): Filters and Muted
// accounts. Every state: loading, load error and retry, off, on, saving, a failed save that
// puts the toggle back, and which toggle maps to which option. api/notificationSettings is
// mocked; the real endpoints are exercised by the Playwright spec.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotificationFiltersPage from "./NotificationFiltersPage";
import MutedAccountsPage from "./MutedAccountsPage";
import NotificationPreferencesPage from "./NotificationPreferencesPage";
import { NotificationSettingsApiError, type NotificationSettings } from "../../api/notificationSettings";
import { seedSession, clearSession } from "../../test/session";

vi.mock("../../api/notificationSettings", async () => {
  const actual = await vi.importActual<typeof import("../../api/notificationSettings")>(
    "../../api/notificationSettings",
  );
  return { ...actual, getNotificationSettings: vi.fn(), updateNotificationSettings: vi.fn() };
});

import { getNotificationSettings, updateNotificationSettings } from "../../api/notificationSettings";

const OFF: NotificationSettings = {
  qualityFilter: false,
  muteNonFollowing: false,
  muteNonFollowers: false,
  muteNewAccounts: false,
};

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession("test-token");
  vi.mocked(getNotificationSettings).mockReset();
  vi.mocked(updateNotificationSettings).mockReset();
});

function renderLeaf(page: "filters" | "muted") {
  render(
    <MemoryRouter>{page === "filters" ? <NotificationFiltersPage /> : <MutedAccountsPage />}</MemoryRouter>,
  );
}

const sw = (name: string) => screen.findByRole("switch", { name });

describe("Filters leaf", () => {
  it("shows the frame wording, the rule and the not-affected line", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    renderLeaf("filters");
    expect(screen.getByRole("heading", { name: "Filters" })).not.toBeNull();
    expect(screen.getByText("Choose which notifications you see.")).not.toBeNull();
    expect(
      await screen.findByText(
        "Hides likes, comments and follows from accounts you don’t follow and haven’t interacted with in the last 30 days.",
      ),
    ).not.toBeNull();
    expect(screen.getByText("Messages, fixtures, results and Contest notifications are not affected.")).not.toBeNull();
    expect(screen.queryByText(/not adjustable yet/i)).toBeNull();
  });

  it("loading: no toggle until the settings arrive", () => {
    vi.mocked(getNotificationSettings).mockReturnValue(new Promise(() => {}));
    renderLeaf("filters");
    expect(screen.getByRole("status").textContent).toContain("Loading your settings");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("load error: a plain line and Try again, which reads again", async () => {
    vi.mocked(getNotificationSettings)
      .mockRejectedValueOnce(new NotificationSettingsApiError("x", 500))
      .mockResolvedValueOnce({ ...OFF, qualityFilter: true });
    renderLeaf("filters");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t load your settings");
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const toggle = await sw("Quality filter");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(getNotificationSettings).toHaveBeenCalledTimes(2);
  });

  it("off, then on from the server", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    renderLeaf("filters");
    expect((await sw("Quality filter")).getAttribute("aria-checked")).toBe("false");
    cleanup();
    vi.mocked(getNotificationSettings).mockResolvedValue({ ...OFF, qualityFilter: true });
    renderLeaf("filters");
    expect((await sw("Quality filter")).getAttribute("aria-checked")).toBe("true");
  });

  it("saves on change: flips at once, is locked while saving, then keeps the server answer", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    let resolve!: (s: NotificationSettings) => void;
    vi.mocked(updateNotificationSettings).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderLeaf("filters");
    const toggle = await sw("Quality filter");
    fireEvent.click(toggle);
    // Sent with the new value, for this one option only.
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.any(String), { qualityFilter: true });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Saving/).textContent).toContain("Saving");
    // A second press while saving is ignored.
    fireEvent.click(toggle);
    expect(updateNotificationSettings).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ...OFF, qualityFilter: true }));
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/Saving/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turning it back off sends false", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue({ ...OFF, qualityFilter: true });
    vi.mocked(updateNotificationSettings).mockResolvedValue(OFF);
    renderLeaf("filters");
    const toggle = await sw("Quality filter");
    fireEvent.click(toggle);
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.any(String), { qualityFilter: false });
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
  });

  it("a failed save puts the toggle back and says so", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    vi.mocked(updateNotificationSettings).mockRejectedValue(new NotificationSettingsApiError("x", 500));
    renderLeaf("filters");
    const toggle = await sw("Quality filter");
    fireEvent.click(toggle);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t save that change");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    // The next attempt clears the message.
    vi.mocked(updateNotificationSettings).mockResolvedValue({ ...OFF, qualityFilter: true });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("no session: a log-in prompt and no request", () => {
    clearSession();
    renderLeaf("filters");
    expect(screen.getByText(/log in to manage your notification filters/i)).not.toBeNull();
    expect(getNotificationSettings).not.toHaveBeenCalled();
  });
});

describe("Muted accounts leaf", () => {
  it("shows the frame wording and the three rows in the frame order, with no per-account list", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    renderLeaf("muted");
    expect(screen.getByRole("heading", { name: "Muted accounts" })).not.toBeNull();
    expect(screen.getByText("Mute notifications from these people.")).not.toBeNull();
    await sw("People you don’t follow");
    const names = screen.getAllByRole("switch").map((el) => el.getAttribute("aria-labelledby"));
    expect(names).toEqual(["notif-muteNonFollowing", "notif-muteNonFollowers", "notif-muteNewAccounts"]);
    expect(screen.queryByText(/not adjustable yet/i)).toBeNull();
  });

  it("all off, then two on (the frames' two states)", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    renderLeaf("muted");
    for (const label of ["People you don’t follow", "People who don’t follow you", "People with a new account"]) {
      expect((await sw(label)).getAttribute("aria-checked")).toBe("false");
    }
    cleanup();
    vi.mocked(getNotificationSettings).mockResolvedValue({ ...OFF, muteNonFollowing: true, muteNewAccounts: true });
    renderLeaf("muted");
    expect((await sw("People you don’t follow")).getAttribute("aria-checked")).toBe("true");
    expect((await sw("People who don’t follow you")).getAttribute("aria-checked")).toBe("false");
    expect((await sw("People with a new account")).getAttribute("aria-checked")).toBe("true");
  });

  it.each([
    ["People you don’t follow", "muteNonFollowing"],
    ["People who don’t follow you", "muteNonFollowers"],
    ["People with a new account", "muteNewAccounts"],
  ])("%s saves %s only", async (label, key) => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    vi.mocked(updateNotificationSettings).mockResolvedValue({ ...OFF, [key]: true });
    renderLeaf("muted");
    fireEvent.click(await sw(label));
    expect(updateNotificationSettings).toHaveBeenCalledWith(expect.any(String), { [key]: true });
    await waitFor(() => expect(screen.getByRole("switch", { name: label }).getAttribute("aria-checked")).toBe("true"));
  });

  it("two toggles can save at once; one failing puts back only that one", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue(OFF);
    let failFirst!: (e: unknown) => void;
    vi.mocked(updateNotificationSettings)
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          failFirst = reject;
        }),
      )
      .mockResolvedValueOnce({ ...OFF, muteNewAccounts: true });
    renderLeaf("muted");
    const first = await sw("People you don’t follow");
    const third = await sw("People with a new account");
    fireEvent.click(first);
    fireEvent.click(third);
    await waitFor(() => expect(third.getAttribute("aria-checked")).toBe("true"));
    await act(async () => failFirst(new NotificationSettingsApiError("x", 500)));
    await waitFor(() => expect(first.getAttribute("aria-checked")).toBe("false"));
    expect(third.getAttribute("aria-checked")).toBe("true");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t save that change");
  });

  it("loading, load error and no session", async () => {
    vi.mocked(getNotificationSettings).mockRejectedValue(new NotificationSettingsApiError("x", 500));
    renderLeaf("muted");
    expect(screen.getByRole("status").textContent).toContain("Loading your settings");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t load your settings");
    cleanup();
    clearSession();
    renderLeaf("muted");
    expect(screen.getByText(/log in to manage muted accounts/i)).not.toBeNull();
  });
});

describe("Notification Preferences hub", () => {
  it("links Filters and Muted accounts; Push and Email stay as they are", () => {
    render(
      <MemoryRouter>
        <NotificationPreferencesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /^Filters/ }).getAttribute("href")).toBe(
      "/settings/notifications/filters",
    );
    expect(screen.getByRole("link", { name: /^Muted accounts/ }).getAttribute("href")).toBe(
      "/settings/notifications/muted-accounts",
    );
    expect(screen.getByRole("link", { name: /^Push notifications/ }).getAttribute("href")).toBe(
      "/settings/notifications/push",
    );
    expect(screen.getByRole("link", { name: /^Email notifications/ }).getAttribute("href")).toBe(
      "/settings/notifications/email",
    );
  });
});
