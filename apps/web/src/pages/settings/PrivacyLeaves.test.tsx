// Direct Messages and Your Posts leaves (B-061). Every state the Figma rows E and F draw:
// loading, default, saving, save failed (control put back), load failed, no session.
// Mocks api/userSettings; the endpoints are exercised for real by the Playwright spec.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DirectMessagesSettingsPage, { DM_OPTIONS, MESSAGES as DM_MESSAGES } from "./DirectMessagesSettingsPage";
import YourPostsSettingsPage, { SWITCH_LABEL, saveFailedMessage } from "./YourPostsSettingsPage";
import { UserSettingsApiError } from "../../api/userSettings";

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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDm() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy/direct-messages"]}>
      <DirectMessagesSettingsPage />
    </MemoryRouter>,
  );
}

function renderPosts() {
  render(
    <MemoryRouter initialEntries={["/settings/privacy/your-posts"]}>
      <YourPostsSettingsPage />
    </MemoryRouter>,
  );
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(name, "i") }) as HTMLInputElement;

describe("Direct Messages leaf", () => {
  it("shows the log-in prompt and calls nothing without a session", () => {
    renderDm();
    expect(screen.getByText(/Log in to manage your privacy settings/)).not.toBeNull();
    expect(getUserSettings).not.toHaveBeenCalled();
  });

  it("shows skeleton options while the settings load (E4 / E8)", async () => {
    seedSession("token");
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean }>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    expect(screen.getByTestId("dm-skeleton")).not.toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    d.resolve({ dmPermission: "everyone", mediaSensitive: false });
    await screen.findByRole("radio", { name: /everyone the rules allow/i });
    expect(screen.queryByTestId("dm-skeleton")).toBeNull();
  });

  it("draws the three options with the current choice selected (E1 / E5)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "following", mediaSensitive: false });
    renderDm();
    await screen.findByRole("radio", { name: /people i follow/i });
    expect(DM_OPTIONS.map((o) => o.name)).toEqual(["Everyone the rules allow", "People I follow", "No one"]);
    expect(radio("everyone the rules allow").checked).toBe(false);
    expect(radio("people i follow").checked).toBe(true);
    expect(radio("no one").checked).toBe(false);
    expect(screen.getByText("Who can message me")).not.toBeNull();
    expect(screen.getByText("Choose who can start a new conversation with you.")).not.toBeNull();
    expect(screen.getByText(DM_MESSAGES.stricterOnly)).not.toBeNull();
    expect(DM_MESSAGES.stricterOnly).toContain("[COPY PENDING LEGAL REVIEW]");
  });

  it("keeps the Read receipts row visibly disabled and does nothing with it", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });
    expect(screen.getByText("Read receipts")).not.toBeNull();
    expect(screen.getByRole("img", { name: /read receipts: not adjustable yet/i })).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("link", { name: /learn more/i })).toBeNull();
  });

  it("saves on change: the new choice shows at once and the options dim while saving (E2 / E6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    const d = deferred<{ dmPermission: "none"; mediaSensitive: boolean }>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });

    fireEvent.click(radio("no one"));

    expect(updateUserSettings).toHaveBeenCalledWith("token", { dmPermission: "none" });
    expect(radio("no one").checked).toBe(true);
    expect(document.querySelector(".pvl-group--busy")).not.toBeNull();
    expect(radio("everyone the rules allow").matches(":disabled")).toBe(true);

    d.resolve({ dmPermission: "none", mediaSensitive: false });
    await waitFor(() => expect(document.querySelector(".pvl-group--busy")).toBeNull());
    expect(radio("no one").checked).toBe(true);
    expect(radio("no one").matches(":disabled")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts the control back and says so when the save fails (E3 / E7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "following", mediaSensitive: false });
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope", { status: 500 }));
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });

    fireEvent.click(radio("no one"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(DM_MESSAGES.saveFailed);
    expect(radio("people i follow").checked).toBe(true);
    expect(radio("no one").checked).toBe(false);
    expect(radio("no one").matches(":disabled")).toBe(false);
  });

  it("clears the failure banner on the next attempt", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    vi.mocked(updateUserSettings)
      .mockRejectedValueOnce(new UserSettingsApiError("nope"))
      .mockResolvedValueOnce({ dmPermission: "none", mediaSensitive: false });
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });
    fireEvent.click(radio("no one"));
    await screen.findByRole("alert");
    fireEvent.click(radio("no one"));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(radio("no one").checked).toBe(true);
  });

  it("shows a load error with Try again, and loads again when pressed", async () => {
    seedSession("token");
    vi.mocked(getUserSettings)
      .mockRejectedValueOnce(new UserSettingsApiError("down"))
      .mockResolvedValueOnce({ dmPermission: "none", mediaSensitive: false });
    renderDm();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(DM_MESSAGES.loadFailed);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("radio", { name: /no one/i });
    expect(radio("no one").checked).toBe(true);
  });

  it("links the back arrow to Privacy", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });
    expect(screen.getByRole("link", { name: "Back to Privacy" }).getAttribute("href")).toBe("/settings/privacy");
  });
});

describe("Your Posts leaf", () => {
  it("shows the log-in prompt and calls nothing without a session", () => {
    renderPosts();
    expect(screen.getByText(/Log in to manage your privacy settings/)).not.toBeNull();
    expect(getUserSettings).not.toHaveBeenCalled();
  });

  it("shows a skeleton in place of the switch while loading (F4 / F8)", async () => {
    seedSession("token");
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean }>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderPosts();
    expect(screen.getByTestId("posts-skeleton")).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    d.resolve({ dmPermission: "everyone", mediaSensitive: true });
    await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(screen.queryByTestId("posts-skeleton")).toBeNull();
  });

  it("draws the switch in the saved state with the drawn wording (F1 / F5)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true });
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/pictures and videos you post will be marked as sensitive/)).not.toBeNull();
    expect(screen.queryByRole("link", { name: /learn more/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Your Posts" })).not.toBeNull();
  });

  it("saves on toggle: the new state shows at once and the switch locks while saving (F2 / F6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean }>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(sw);

    expect(updateUserSettings).toHaveBeenCalledWith("token", { mediaSensitive: true });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect((sw as HTMLButtonElement).disabled).toBe(true);

    d.resolve({ dmPermission: "everyone", mediaSensitive: true });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("turns it off again with a second PATCH", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true });
    vi.mocked(updateUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    fireEvent.click(sw);
    expect(updateUserSettings).toHaveBeenCalledWith("token", { mediaSensitive: false });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("false"));
  });

  it("puts the switch back and says it is back to Off when the save fails (F3 / F7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false });
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope", { status: 500 }));
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    fireEvent.click(sw);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(saveFailedMessage(false));
    expect(alert.textContent).toContain("back to Off");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect((sw as HTMLButtonElement).disabled).toBe(false);
  });

  it("says it is back to On when turning it off fails", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true });
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope"));
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    fireEvent.click(sw);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("back to On");
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("shows a load error with Try again", async () => {
    seedSession("token");
    vi.mocked(getUserSettings)
      .mockRejectedValueOnce(new UserSettingsApiError("down"))
      .mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true });
    renderPosts();
    await screen.findByRole("alert");
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});
