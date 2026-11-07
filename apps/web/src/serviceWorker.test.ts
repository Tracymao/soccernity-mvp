// public/sw.js: the push service worker. It is plain JavaScript served from the web root, so it is
// loaded here as text and run against a fake worker scope (no real browser). It must show a
// notification from the payload (title and body only) and, on click, focus or open /notifications.
/* global process */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "public", "sw.js"), "utf8");

type Listener = (event: unknown) => void;

function loadWorker(windows: Array<{ url: string; focus: () => Promise<unknown>; navigate?: (u: string) => unknown }> = []) {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    location: { origin: "https://app.soccernity.test" },
    registration: { showNotification },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue(windows),
      openWindow,
    },
  };
  runInNewContext(SOURCE, { self, URL });
  return { listeners, showNotification, openWindow, self };
}

function pushEvent(payload: unknown, raw?: string) {
  const waits: Promise<unknown>[] = [];
  const event = {
    data: raw !== undefined || payload !== undefined ? { json: () => (raw !== undefined ? JSON.parse(raw) : payload) } : null,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  };
  return { event, settle: () => Promise.all(waits) };
}

describe("public/sw.js", () => {
  it("shows the notification from the push payload, title and body only", async () => {
    const { listeners, showNotification } = loadWorker();
    const { event, settle } = pushEvent({ title: "Soccernity", body: "You have a new notification", extra: "ignored" });
    listeners.push(event);
    await settle();
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Soccernity", { body: "You have a new notification", tag: "soccernity-notification" });
  });

  it("falls back to the generic text when the payload is empty or unreadable", async () => {
    const { listeners, showNotification } = loadWorker();
    const empty = pushEvent(undefined);
    listeners.push(empty.event);
    await empty.settle();
    const broken = pushEvent(undefined, "not json {");
    listeners.push(broken.event);
    await broken.settle();
    expect(showNotification).toHaveBeenNthCalledWith(1, "Soccernity", expect.objectContaining({ body: "You have a new notification" }));
    expect(showNotification).toHaveBeenNthCalledWith(2, "Soccernity", expect.objectContaining({ body: "You have a new notification" }));
  });

  it("on click, closes the notification and opens /notifications when no Soccernity tab is open", async () => {
    const { listeners, openWindow } = loadWorker([{ url: "https://elsewhere.test/x", focus: vi.fn() }]);
    const close = vi.fn();
    const waits: Promise<unknown>[] = [];
    listeners.notificationclick({ notification: { close }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(close).toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith("https://app.soccernity.test/notifications");
  });

  it("on click, focuses an open Soccernity tab and sends it to /notifications", async () => {
    const navigate = vi.fn();
    const focus = vi.fn().mockResolvedValue({ navigate });
    const { listeners, openWindow } = loadWorker([{ url: "https://app.soccernity.test/community", focus }]);
    const waits: Promise<unknown>[] = [];
    listeners.notificationclick({ notification: { close: vi.fn() }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("https://app.soccernity.test/notifications");
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("takes control on install and activate, and handles no other events", () => {
    const { listeners, self } = loadWorker();
    listeners.install({});
    expect(self.skipWaiting).toHaveBeenCalled();
    const waits: Promise<unknown>[] = [];
    listeners.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    expect(self.clients.claim).toHaveBeenCalled();
    expect(Object.keys(listeners).sort()).toEqual(["activate", "install", "notificationclick", "push"]);
  });
});
