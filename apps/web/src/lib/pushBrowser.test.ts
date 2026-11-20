// The browser side of web push (lib/pushBrowser.ts) and the sign-out cleanup rule (founder,
// 2026-11-07): when a session ends, THIS browser's push subscription is removed first. The browser
// APIs are faked; nothing here talks to a real push service.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SERVICE_WORKER_URL,
  isPushSupported,
  removeThisBrowserPush,
  subscribeThisBrowser,
  toServerSubscription,
  unsubscribeThisBrowser,
  urlBase64ToUint8Array,
} from "./pushBrowser";
import { clearStoredSession, storeSession, takePendingSessionEndWork } from "./session";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function fakeSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: "p256", auth: "auth" } }),
  };
}

interface Fakes {
  register: ReturnType<typeof vi.fn>;
  getRegistration: ReturnType<typeof vi.fn>;
  getSubscription: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

// Installs a fake service worker + PushManager + Notification on the jsdom window.
function installPushBrowser(existing: ReturnType<typeof fakeSubscription> | null = null): Fakes {
  const getSubscription = vi.fn().mockResolvedValue(existing);
  const subscribe = vi.fn().mockImplementation(async () => fakeSubscription());
  const registration = { pushManager: { getSubscription, subscribe } };
  const register = vi.fn().mockResolvedValue(registration);
  const getRegistration = vi.fn().mockResolvedValue(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration, ready: Promise.resolve(registration) },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default" } });
  return { register, getRegistration, getSubscription, subscribe };
}

function uninstallPushBrowser() {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (window as unknown as Record<string, unknown>).PushManager;
  delete (window as unknown as Record<string, unknown>).Notification;
}

afterEach(() => {
  uninstallPushBrowser();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isPushSupported", () => {
  it("is false in a browser with none of the three APIs", () => {
    expect(isPushSupported()).toBe(false);
  });

  it("needs all three: service worker, PushManager and Notification", () => {
    installPushBrowser();
    expect(isPushSupported()).toBe(true);
    delete (window as unknown as Record<string, unknown>).PushManager;
    expect(isPushSupported()).toBe(false);
  });
});

describe("helpers", () => {
  it("decodes a URL-safe base64 key to bytes", () => {
    // "hello?>" in url-safe base64 without padding.
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_Pg"))).toEqual([104, 101, 108, 108, 111, 63, 62]);
  });

  it("takes endpoint, p256dh and auth from the subscription, and refuses one without keys", () => {
    expect(toServerSubscription(fakeSubscription() as unknown as PushSubscription)).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: "p256", auth: "auth" },
    });
    const noKeys = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT }) } as unknown as PushSubscription;
    expect(toServerSubscription(noKeys)).toBeNull();
  });
});

describe("subscribeThisBrowser", () => {
  it("registers /sw.js at scope / and subscribes user-visibly with the decoded public key", async () => {
    const fakes = installPushBrowser();
    await subscribeThisBrowser("aGVsbG8_Pg");
    expect(fakes.register).toHaveBeenCalledWith(SERVICE_WORKER_URL, { scope: "/" });
    expect(SERVICE_WORKER_URL).toBe("/sw.js");
    const options = fakes.subscribe.mock.calls[0][0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey)).toEqual([104, 101, 108, 108, 111, 63, 62]);
  });

  it("reuses a subscription the browser already holds", async () => {
    const existing = fakeSubscription();
    const fakes = installPushBrowser(existing);
    const result = await subscribeThisBrowser("aGVsbG8_Pg");
    expect(result).toBe(existing);
    expect(fakes.subscribe).not.toHaveBeenCalled();
  });
});

describe("unsubscribeThisBrowser", () => {
  it("returns null and registers nothing when the worker was never registered", async () => {
    const fakes = installPushBrowser();
    fakes.getRegistration.mockResolvedValue(undefined);
    expect(await unsubscribeThisBrowser()).toBeNull();
    expect(fakes.register).not.toHaveBeenCalled();
  });

  it("unsubscribes the held subscription and returns its endpoint", async () => {
    const existing = fakeSubscription();
    installPushBrowser(existing);
    expect(await unsubscribeThisBrowser()).toBe(ENDPOINT);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("removeThisBrowserPush (the sign-out privacy rule)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("unsubscribes locally first, then DELETEs the endpoint with the ending session's token", async () => {
    const order: string[] = [];
    const existing = fakeSubscription();
    existing.unsubscribe.mockImplementation(async () => {
      order.push("unsubscribe");
      return true;
    });
    fetchMock.mockImplementation(async () => {
      order.push("delete");
      return new Response(null, { status: 204 });
    });
    installPushBrowser(existing);

    await removeThisBrowserPush("old-token");

    expect(order).toEqual(["unsubscribe", "delete"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toMatch(/\/notification-settings\/push\/subscription$/);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer old-token");
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: ENDPOINT });
  });

  it("is a no-op when this browser has no subscription", async () => {
    installPushBrowser(null);
    await removeThisBrowserPush("old-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws: a failing DELETE or a failing unsubscribe is swallowed", async () => {
    const existing = fakeSubscription();
    installPushBrowser(existing);
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(removeThisBrowserPush("t")).resolves.toBeUndefined();
    expect(existing.unsubscribe).toHaveBeenCalled();

    const broken = fakeSubscription();
    broken.unsubscribe.mockRejectedValue(new Error("nope"));
    installPushBrowser(broken);
    await expect(removeThisBrowserPush("t")).resolves.toBeUndefined();
  });

  it("does not wait longer than a few seconds for a hanging server", async () => {
    vi.useFakeTimers();
    installPushBrowser(fakeSubscription());
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const done = removeThisBrowserPush("t");
    await vi.advanceTimersByTimeAsync(3100);
    await expect(done).resolves.toBeUndefined();
  });
});

describe("clearStoredSession starts the cleanup", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("removes this browser's subscription when a signed-in session ends", async () => {
    const existing = fakeSubscription();
    installPushBrowser(existing);
    storeSession({ accessToken: "session-token" });

    clearStoredSession();
    const pending = takePendingSessionEndWork();
    expect(pending).not.toBeNull();
    await pending;

    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as FetchInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
    expect(init.method).toBe("DELETE");
  });

  it("does nothing when nobody was signed in (a second clear is not a second cleanup)", () => {
    installPushBrowser(fakeSubscription());
    clearStoredSession();
    expect(takePendingSessionEndWork()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing, and returns no pending work, in a browser without push support", () => {
    storeSession({ accessToken: "session-token" });
    clearStoredSession();
    expect(takePendingSessionEndWork()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
