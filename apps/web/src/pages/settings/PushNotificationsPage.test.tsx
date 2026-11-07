// Push Notifications leaf (B-062 / B-285): every state, the permission outcomes, and the
// subscribe / unsubscribe calls. The browser APIs are mocked (lib/pushBrowser); real delivery to a
// real browser is NOT exercised by these tests.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushApiError } from "../../api/push";
import { clearSession, seedSession } from "../../test/session";
import PushNotificationsPage from "./PushNotificationsPage";

vi.mock("../../api/push", async () => {
  const actual = await vi.importActual<typeof import("../../api/push")>("../../api/push");
  return {
    ...actual,
    getPushStatus: vi.fn(),
    savePushSubscription: vi.fn(),
    deletePushSubscription: vi.fn(),
  };
});

vi.mock("../../lib/pushBrowser", () => ({
  isPushSupported: vi.fn(),
  currentPermission: vi.fn(),
  currentSubscription: vi.fn(),
  subscribeThisBrowser: vi.fn(),
  toServerSubscription: vi.fn(),
  unsubscribeThisBrowser: vi.fn(),
}));

import * as pushApi from "../../api/push";
import * as browser from "../../lib/pushBrowser";

const getPushStatus = vi.mocked(pushApi.getPushStatus);
const savePushSubscription = vi.mocked(pushApi.savePushSubscription);
const deletePushSubscription = vi.mocked(pushApi.deletePushSubscription);
const isPushSupported = vi.mocked(browser.isPushSupported);
const currentPermission = vi.mocked(browser.currentPermission);
const currentSubscription = vi.mocked(browser.currentSubscription);
const subscribeThisBrowser = vi.mocked(browser.subscribeThisBrowser);
const toServerSubscription = vi.mocked(browser.toServerSubscription);
const unsubscribeThisBrowser = vi.mocked(browser.unsubscribeThisBrowser);

const TOKEN = "access-token-1";
const KEY = "BPublicVapidKey";
const PAYLOAD = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };

function fakeSubscription() {
  return { endpoint: PAYLOAD.endpoint, unsubscribe: vi.fn().mockResolvedValue(true) } as unknown as PushSubscription;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PushNotificationsPage />
    </MemoryRouter>,
  );
}

const toggle = () => screen.findByRole("switch", { name: "Turn on push notifications" });

beforeEach(() => {
  seedSession(TOKEN);
  isPushSupported.mockReturnValue(true);
  currentPermission.mockReturnValue("default");
  currentSubscription.mockResolvedValue(null);
  getPushStatus.mockResolvedValue({ available: true, publicKey: KEY });
  savePushSubscription.mockResolvedValue(undefined);
  deletePushSubscription.mockResolvedValue(undefined);
  unsubscribeThisBrowser.mockResolvedValue(PAYLOAD.endpoint);
  toServerSubscription.mockReturnValue(PAYLOAD);
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PushNotificationsPage: states", () => {
  it("asks a signed-out visitor to log in and calls nothing", () => {
    clearSession();
    renderPage();
    expect(screen.getByText(/Log in to manage push notifications/)).toBeTruthy();
    expect(getPushStatus).not.toHaveBeenCalled();
  });

  it("Off is the default: switch off, the tagged line and the per-browser footnote", async () => {
    renderPage();
    const sw = await toggle();
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect((sw as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Manage push notifications on this browser.")).toBeTruthy();
    expect(screen.getByText("Push notifications only say “You have a new notification”. Open Soccernity to see what it is. [COPY PENDING LEGAL REVIEW]")).toBeTruthy();
    expect(
      screen.getByText("This setting applies to this browser only. Turn it on separately on each browser or device you use."),
    ).toBeTruthy();
    expect(getPushStatus).toHaveBeenCalledWith(TOKEN);
  });

  it("On when this browser already has a subscription (no server read of it)", async () => {
    currentSubscription.mockResolvedValue(fakeSubscription());
    renderPage();
    expect((await toggle()).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/This setting applies to this browser only/)).toBeTruthy();
  });

  it("Blocked by browser: switch off and disabled, the blocked callout, no tagged line", async () => {
    currentPermission.mockReturnValue("denied");
    renderPage();
    const sw = await toggle();
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Notifications are blocked in this browser\. To turn push on, allow notifications/)).toBeTruthy();
    expect(screen.queryByText(/COPY PENDING LEGAL REVIEW/)).toBeNull();
    expect(subscribeThisBrowser).not.toHaveBeenCalled();
  });

  it("Check again re-reads the permission and leaves Blocked once it is allowed", async () => {
    currentPermission.mockReturnValue("denied");
    renderPage();
    await screen.findByText(/Notifications are blocked/);
    currentPermission.mockReturnValue("granted");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect((await toggle() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Notifications are blocked/)).toBeNull();
  });

  it("Not supported when the browser has no service worker, Notification or PushManager (server not asked)", async () => {
    isPushSupported.mockReturnValue(false);
    renderPage();
    expect(
      await screen.findByText(/This browser or device can’t receive push notifications\. You’ll still see your notifications in Soccernity\./),
    ).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(getPushStatus).not.toHaveBeenCalled();
  });

  it("Not supported when the server says available: false (VAPID keys not set)", async () => {
    getPushStatus.mockResolvedValue({ available: false });
    renderPage();
    expect(await screen.findByText(/can’t receive push notifications/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows a load error with Try again when the status call fails", async () => {
    getPushStatus.mockRejectedValueOnce(new PushApiError("x", 500));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t load your settings.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await toggle()).toBeTruthy();
  });
});

describe("PushNotificationsPage: turning on", () => {
  it("asks permission, subscribes with the public key and POSTs the subscription", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { requestPermission, permission: "default" });
    const subscription = fakeSubscription();
    subscribeThisBrowser.mockResolvedValue(subscription);
    renderPage();

    fireEvent.click(await toggle());

    await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribeThisBrowser).toHaveBeenCalledWith(KEY);
    expect(savePushSubscription).toHaveBeenCalledWith(TOKEN, PAYLOAD);
  });

  it("does not ask again when permission is already granted", async () => {
    currentPermission.mockReturnValue("granted");
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission, permission: "granted" });
    subscribeThisBrowser.mockResolvedValue(fakeSubscription());
    renderPage();
    fireEvent.click(await toggle());
    await waitFor(() => expect(savePushSubscription).toHaveBeenCalled());
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("permission denied at the prompt moves to Blocked and subscribes nothing", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied"), permission: "default" });
    renderPage();
    fireEvent.click(await toggle());
    expect(await screen.findByText(/Notifications are blocked in this browser/)).toBeTruthy();
    expect(subscribeThisBrowser).not.toHaveBeenCalled();
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("a dismissed prompt stays Off with a plain note and subscribes nothing", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("default"), permission: "default" });
    renderPage();
    fireEvent.click(await toggle());
    expect((await screen.findByRole("alert")).textContent).toContain("push is still off");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(subscribeThisBrowser).not.toHaveBeenCalled();
  });

  it("a failed POST removes the local subscription again and shows the error, still Off", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted"), permission: "default" });
    const subscription = fakeSubscription();
    subscribeThisBrowser.mockResolvedValue(subscription);
    savePushSubscription.mockRejectedValue(new PushApiError("x", 500));
    renderPage();
    fireEvent.click(await toggle());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t turn on push notifications");
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("an endpoint the server does not accept ends in Not supported", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted"), permission: "default" });
    const subscription = fakeSubscription();
    subscribeThisBrowser.mockResolvedValue(subscription);
    savePushSubscription.mockRejectedValue(new PushApiError("x", 400, "push_endpoint_not_accepted"));
    renderPage();
    fireEvent.click(await toggle());
    expect(await screen.findByText(/can’t receive push notifications/)).toBeTruthy();
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it("a browser failure while subscribing shows the error and stays Off", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted"), permission: "default" });
    subscribeThisBrowser.mockRejectedValue(new Error("push service unreachable"));
    renderPage();
    fireEvent.click(await toggle());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t turn on push notifications");
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
});

describe("PushNotificationsPage: turning off", () => {
  beforeEach(() => {
    currentSubscription.mockResolvedValue(fakeSubscription());
  });

  it("unsubscribes locally, then DELETEs the endpoint", async () => {
    renderPage();
    fireEvent.click(await toggle());
    await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    expect(unsubscribeThisBrowser).toHaveBeenCalledTimes(1);
    expect(deletePushSubscription).toHaveBeenCalledWith(TOKEN, PAYLOAD.endpoint);
  });

  it("is still Off when the DELETE fails (the browser is already unsubscribed)", async () => {
    deletePushSubscription.mockRejectedValue(new PushApiError("x", 503, "push_not_configured"));
    renderPage();
    fireEvent.click(await toggle());
    await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error and stays On when the browser cannot unsubscribe", async () => {
    unsubscribeThisBrowser.mockRejectedValue(new Error("nope"));
    renderPage();
    fireEvent.click(await toggle());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t turn off push notifications");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(deletePushSubscription).not.toHaveBeenCalled();
  });
});
