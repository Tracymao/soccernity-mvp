// Direct Messages and Your Posts leaves (B-061). Every state the Figma rows E and F draw:
// loading, default, saving, save failed (control put back), load failed, no session.
// Mocks api/userSettings; the endpoints are exercised for real by the Playwright spec.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DirectMessagesSettingsPage, {
  DM_OPTIONS,
  MESSAGES as DM_MESSAGES,
  READ_RECEIPTS_LABEL,
} from "./DirectMessagesSettingsPage";
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
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean; readReceipts: boolean; isProfilePublic: boolean }>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    expect(screen.getByTestId("dm-skeleton")).not.toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    d.resolve({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    await screen.findByRole("radio", { name: /everyone the rules allow/i });
    expect(screen.queryByTestId("dm-skeleton")).toBeNull();
  });

  it("draws the three options with the current choice selected (E1 / E5)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "following", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
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

  it("saves on change: the new choice shows at once and the options dim while saving (E2 / E6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    const d = deferred<{ dmPermission: "none"; mediaSensitive: boolean; readReceipts: boolean; isProfilePublic: boolean }>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });

    fireEvent.click(radio("no one"));

    expect(updateUserSettings).toHaveBeenCalledWith("token", { dmPermission: "none" });
    expect(radio("no one").checked).toBe(true);
    expect(document.querySelector(".pvl-group--busy")).not.toBeNull();
    expect(radio("everyone the rules allow").matches(":disabled")).toBe(true);

    d.resolve({ dmPermission: "none", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    await waitFor(() => expect(document.querySelector(".pvl-group--busy")).toBeNull());
    expect(radio("no one").checked).toBe(true);
    expect(radio("no one").matches(":disabled")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts the control back and says so when the save fails (E3 / E7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "following", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
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
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    vi.mocked(updateUserSettings)
      .mockRejectedValueOnce(new UserSettingsApiError("nope"))
      .mockResolvedValueOnce({ dmPermission: "none", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
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
      .mockResolvedValueOnce({ dmPermission: "none", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
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
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });
    expect(screen.getByRole("link", { name: "Back to Privacy" }).getAttribute("href")).toBe("/settings/privacy");
  });
});

// Read receipts row (B-061, Figma S1 to S10): a live switch on GET / PATCH /users/me/settings.
describe("Direct Messages leaf: Read receipts row", () => {
  const receiptsSwitch = () => screen.getByRole("switch", { name: READ_RECEIPTS_LABEL }) as HTMLButtonElement;
  const settings = (readReceipts: boolean, dmPermission: "everyone" | "following" | "none" = "everyone") => ({
    dmPermission,
    mediaSensitive: false,
    readReceipts,
    isProfilePublic: true,
  });

  it("draws the switch On with the drawn title and description, and no 'not adjustable' note (S1 / S6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(READ_RECEIPTS_LABEL)).not.toBeNull();
    expect(screen.getByText(DM_MESSAGES.readReceiptsDescription)).not.toBeNull();
    expect(DM_MESSAGES.readReceiptsDescription).toContain("[COPY PENDING LEGAL REVIEW]");
    expect(DM_MESSAGES.readReceiptsDescription).toContain("Seen");
    expect(screen.queryByText(/not adjustable yet/i)).toBeNull();
    expect(screen.queryByRole("img", { name: /read receipts/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /learn more/i })).toBeNull();
    expect(screen.queryByText(/message requests/i)).toBeNull();
  });

  it("draws the switch Off when the effective value is off, e.g. the under-18 default (S2 / S7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(false));
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("shows a skeleton of the row while the settings load, with no switch (S5 / S10)", async () => {
    seedSession("token");
    const d = deferred<ReturnType<typeof settings>>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    expect(screen.getByTestId("receipts-skeleton")).not.toBeNull();
    expect(screen.getByTestId("dm-skeleton")).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(READ_RECEIPTS_LABEL)).toBeNull();
    d.resolve(settings(true));
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });
    expect(screen.queryByTestId("receipts-skeleton")).toBeNull();
  });

  it("flips at once, dims with 'Saving…' while saving, and sends only readReceipts (S3 / S8)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true, "following"));
    const d = deferred<ReturnType<typeof settings>>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });

    fireEvent.click(receiptsSwitch());

    expect(updateUserSettings).toHaveBeenCalledTimes(1);
    expect(updateUserSettings).toHaveBeenCalledWith("token", { readReceipts: false });
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("false");
    expect(receiptsSwitch().matches(":disabled")).toBe(true);
    expect(screen.getByText(DM_MESSAGES.saving)).not.toBeNull();
    // The Who can message me options are not dimmed by this save, and keep their choice.
    expect(document.querySelector(".pvl-group--busy")).toBeNull();
    expect(radio("people i follow").checked).toBe(true);

    d.resolve(settings(false, "following"));
    await waitFor(() => expect(screen.queryByText(DM_MESSAGES.saving)).toBeNull());
    expect(receiptsSwitch().matches(":disabled")).toBe(false);
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns it on again with a second PATCH", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(false));
    vi.mocked(updateUserSettings).mockResolvedValueOnce(settings(true));
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });
    fireEvent.click(receiptsSwitch());
    expect(updateUserSettings).toHaveBeenCalledWith("token", { readReceipts: true });
    await waitFor(() => expect(receiptsSwitch().matches(":disabled")).toBe(false));
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("puts the switch back and shows the banner ABOVE the row when the save fails (S4 / S9)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(false));
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope", { status: 500 }));
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });

    fireEvent.click(receiptsSwitch());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(DM_MESSAGES.saveFailed);
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("false");
    expect(receiptsSwitch().matches(":disabled")).toBe(false);
    // The banner comes before the row title in the page, and not inside the Who can message me group.
    const title = screen.getByText(READ_RECEIPTS_LABEL);
    expect(alert.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.closest("fieldset")).toBeNull();
  });

  it("clears the banner on the next try", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true));
    vi.mocked(updateUserSettings)
      .mockRejectedValueOnce(new UserSettingsApiError("nope"))
      .mockResolvedValueOnce(settings(false));
    renderDm();
    await screen.findByRole("switch", { name: READ_RECEIPTS_LABEL });
    fireEvent.click(receiptsSwitch());
    await screen.findByRole("alert");
    fireEvent.click(receiptsSwitch());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("keeps a failed Who can message me save inside its own group, not above the Read receipts row", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce(settings(true, "following"));
    vi.mocked(updateUserSettings).mockRejectedValueOnce(new UserSettingsApiError("nope", { status: 500 }));
    renderDm();
    await screen.findByRole("radio", { name: /no one/i });

    fireEvent.click(radio("no one"));

    const alert = await screen.findByRole("alert");
    expect(alert.closest("fieldset")).not.toBeNull();
    // The Read receipts switch is untouched by it.
    expect(receiptsSwitch().getAttribute("aria-checked")).toBe("true");
    expect(radio("people i follow").checked).toBe(true);
  });

  it("does not show the switch when the settings fail to load", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockRejectedValueOnce(new UserSettingsApiError("down"));
    renderDm();
    await screen.findByRole("alert");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(READ_RECEIPTS_LABEL)).toBeNull();
  });

  it("makes no request without a session", () => {
    renderDm();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(getUserSettings).not.toHaveBeenCalled();
    expect(updateUserSettings).not.toHaveBeenCalled();
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
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean; readReceipts: boolean; isProfilePublic: boolean }>();
    vi.mocked(getUserSettings).mockReturnValueOnce(d.promise);
    renderPosts();
    expect(screen.getByTestId("posts-skeleton")).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    d.resolve({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(screen.queryByTestId("posts-skeleton")).toBeNull();
  });

  it("draws the switch in the saved state with the drawn wording (F1 / F5)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/pictures and videos you post will be marked as sensitive/)).not.toBeNull();
    expect(screen.queryByRole("link", { name: /learn more/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Your Posts" })).not.toBeNull();
  });

  it("saves on toggle: the new state shows at once and the switch locks while saving (F2 / F6)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    const d = deferred<{ dmPermission: "everyone"; mediaSensitive: boolean; readReceipts: boolean; isProfilePublic: boolean }>();
    vi.mocked(updateUserSettings).mockReturnValueOnce(d.promise);
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(sw);

    expect(updateUserSettings).toHaveBeenCalledWith("token", { mediaSensitive: true });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect((sw as HTMLButtonElement).disabled).toBe(true);

    d.resolve({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("turns it off again with a second PATCH", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    vi.mocked(updateUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
    renderPosts();
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    fireEvent.click(sw);
    expect(updateUserSettings).toHaveBeenCalledWith("token", { mediaSensitive: false });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("false"));
  });

  it("puts the switch back and says it is back to Off when the save fails (F3 / F7)", async () => {
    seedSession("token");
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: false, readReceipts: true, isProfilePublic: true });
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
    vi.mocked(getUserSettings).mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
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
      .mockResolvedValueOnce({ dmPermission: "everyone", mediaSensitive: true, readReceipts: true, isProfilePublic: true });
    renderPosts();
    await screen.findByRole("alert");
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const sw = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});
