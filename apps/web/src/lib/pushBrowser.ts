// The browser side of web push (build register B-062 / B-285). Everything that touches
// navigator.serviceWorker, PushManager or Notification lives here so the page and the
// sign-out cleanup share one implementation and tests can mock one module.
//
// The browser is the source of truth for "is THIS browser subscribed": there is no server read.
import { deletePushSubscription } from "../api/push";
import type { BrowserPushSubscription } from "../api/push";

export const SERVICE_WORKER_URL = "/sw.js";

// True when the browser can do web push at all (service worker + Notification + PushManager).
// Insecure origins and some embedded browsers fail this; the page then shows "Not supported".
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushPermission = "granted" | "denied" | "default";

export function currentPermission(): PushPermission {
  return Notification.permission as PushPermission;
}

// The VAPID public key arrives URL-safe base64; PushManager.subscribe wants bytes.
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// The registration for this site's worker, if the worker was ever registered. Never registers.
async function existingRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration("/");
}

// This browser's push subscription, or null. Reads only; never prompts, never registers.
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await existingRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// The pieces the server stores. toJSON() is the only place the browser exposes p256dh and auth.
export function toServerSubscription(subscription: PushSubscription): BrowserPushSubscription | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) return null;
  return { endpoint: subscription.endpoint, keys: { p256dh, auth } };
}

// Registers the worker (idempotent), waits until it is active, and subscribes with the public key.
// The caller has already obtained notification permission.
export async function subscribeThisBrowser(publicKey: string): Promise<PushSubscription> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

// Turns THIS browser's subscription off locally. Returns the endpoint that was removed, or null.
export async function unsubscribeThisBrowser(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}

const SIGN_OUT_SERVER_WAIT_MS = 3000;

// PRIVACY RULE (founder, 2026-11-07): when a person's session ends, THIS browser's push
// subscription is removed first so the next person to sign in here does not receive the previous
// person's alerts. Best effort, never throws:
//   1. unsubscribe locally -- the guarantee: the browser stops delivering at once, whatever the
//      network does next;
//   2. DELETE the server row with the token the session just ended with (capped wait), so the row
//      goes now instead of waiting for the push service to answer 404/410 on the next send.
// Called from lib/session.ts clearStoredSession(), so it covers every way a session ends.
export async function removeThisBrowserPush(accessToken: string): Promise<void> {
  try {
    const endpoint = await unsubscribeThisBrowser();
    if (!endpoint) return;
    await Promise.race([
      deletePushSubscription(accessToken, endpoint).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_SERVER_WAIT_MS)),
    ]);
  } catch {
    /* sign-out must never fail because of push cleanup */
  }
}
