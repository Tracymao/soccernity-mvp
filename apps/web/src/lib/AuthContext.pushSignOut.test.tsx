// Sign-out ordering (founder privacy rule, 2026-11-07): the push subscription of THIS browser is
// removed first, then the refresh cookie is revoked (POST /auth/logout). The screen signs out at
// once either way. Browser APIs are faked.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, logoutSession: vi.fn().mockResolvedValue(undefined) };
});

import { logoutSession } from "../api/auth";
import { seedSession } from "../test/session";
import { useAuth } from "./AuthContext";
import type { Auth } from "./AuthContext";
import { getStoredAccessToken } from "./session";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function Probe({ onAuth }: { onAuth: (auth: Auth) => void }) {
  onAuth(useAuth());
  return null;
}

function installPushBrowser(subscription: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "granted" } });
}

afterEach(() => {
  cleanup();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (window as unknown as Record<string, unknown>).PushManager;
  delete (window as unknown as Record<string, unknown>).Notification;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("signOut with a push subscription on this browser", () => {
  let events: string[];
  beforeEach(() => {
    events = [];
    seedSession("session-token");
  });

  it("signs the screen out at once, removes the subscription, and only then calls logout", async () => {
    installPushBrowser({
      endpoint: ENDPOINT,
      unsubscribe: async () => {
        events.push("unsubscribe");
        return true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: { method?: string }) => {
        if (init?.method === "DELETE") events.push("delete-subscription");
        return new Response(null, { status: 204 });
      }),
    );
    vi.mocked(logoutSession).mockImplementation(async () => {
      events.push("logout");
    });

    let auth!: Auth;
    render(<Probe onAuth={(a) => (auth = a)} />);
    act(() => auth.signOut());

    // The session is gone immediately, before any of the async cleanup.
    expect(getStoredAccessToken()).toBeNull();
    expect(events).toEqual([]);

    await vi.waitFor(() => expect(events).toContain("logout"));
    expect(events).toEqual(["unsubscribe", "delete-subscription", "logout"]);
    expect(logoutSession).toHaveBeenCalledTimes(1);
  });

  it("still logs out when the browser has no subscription", async () => {
    installPushBrowser(null);
    vi.stubGlobal("fetch", vi.fn());
    let auth!: Auth;
    render(<Probe onAuth={(a) => (auth = a)} />);
    act(() => auth.signOut());
    await vi.waitFor(() => expect(logoutSession).toHaveBeenCalledTimes(1));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls logout straight away in a browser without push (nothing to wait for)", () => {
    let auth!: Auth;
    render(<Probe onAuth={(a) => (auth = a)} />);
    act(() => auth.signOut());
    expect(logoutSession).toHaveBeenCalledTimes(1);
  });
});
