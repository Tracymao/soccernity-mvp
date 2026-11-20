// Push Notifications leaf. Figma: "Settings — Push Notifications" 2927:9954 (desktop) /
// 5696:8364 (mobile), now the live states drawn by Figma pass W8 (docs/figma-w8-settings.md row B):
// On 6990:54293 / mobile 6990:55818, Off 6990:54466 / 6990:55850, Blocked by browser 6990:54639 /
// 6990:55882, Not supported on this device 6990:54814 / 6990:55915.
//
// LIVE (build register B-062 / B-285, Decision Log #472 adopted default (e)). Backend:
// services/api/src/modules/push (GET status, POST/DELETE subscription). The browser side is in
// lib/pushBrowser.ts and the worker in public/sw.js.
//
// The four states:
//   Off                 -- the default; the browser has no push subscription for this site.
//   On                  -- this browser has a push subscription (PushManager.getSubscription();
//                          there is no server read of "is this browser subscribed").
//   Blocked by browser  -- Notification.permission is "denied". Turning on cannot ask again; the
//                          person has to allow notifications in the browser's site settings.
//   Not supported       -- no service worker / Notification / PushManager, OR the server says
//                          `available: false` (the VAPID keys are not set yet, register B-285).
//
// Turning on: ask the browser for permission, register /sw.js, subscribe with the server's public
// key, then POST the subscription. Turning off: unsubscribe locally, then DELETE. The setting is
// per browser (the frame says so).
//
// The frame's back arrow is not drawn here (the Settings shell already carries navigation, same
// as the other leaves). The Blocked callout's accent bar is the semantic/alert red the frame
// binds, the one authorised use for an error callout (Decision Log #408 item 4); the other
// callouts use the navy bar the frames draw.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PushApiError, deletePushSubscription, getPushStatus, savePushSubscription } from "../../api/push";
import { getStoredAccessToken } from "../../lib/session";
import {
  currentPermission,
  currentSubscription,
  isPushSupported,
  subscribeThisBrowser,
  toServerSubscription,
  unsubscribeThisBrowser,
} from "../../lib/pushBrowser";
import SettingToggle from "./SettingToggle";
import "./SettingsNotificationsPage.css";

type View = "loading" | "load-error" | "unsupported" | "blocked" | "off" | "on";

const ROW_TITLE_ID = "push-row-title";

// Tagged exactly as the Figma frame tags it (Push On and Off): a promise about what a lock screen shows.
const PUSH_CONTENT_NOTE =
  "Push notifications only say “You have a new notification”. Open Soccernity to see what it is. [COPY PENDING LEGAL REVIEW]";

export default function PushNotificationsPage() {
  const accessToken = getStoredAccessToken();
  const [view, setView] = useState<View>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setView("loading");
    setMessage(null);
    // The browser first: with no push support there is nothing to ask the server.
    if (!isPushSupported()) {
      setView("unsupported");
      return;
    }
    try {
      const status = await getPushStatus(accessToken);
      if (!alive.current) return;
      if (!status.available || !status.publicKey) {
        setView("unsupported");
        return;
      }
      setPublicKey(status.publicKey);
      if (currentPermission() === "denied") {
        setView("blocked");
        return;
      }
      const subscription = await currentSubscription();
      if (!alive.current) return;
      setView(subscription ? "on" : "off");
    } catch {
      if (alive.current) setView("load-error");
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function turnOn() {
    if (!accessToken || !publicKey || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = currentPermission() === "granted" ? "granted" : await Notification.requestPermission();
      if (!alive.current) return;
      if (permission === "denied") {
        setView("blocked");
        return;
      }
      if (permission !== "granted") {
        // The prompt was dismissed without an answer: nothing changed, stay Off.
        setMessage("Notifications weren’t allowed, so push is still off. You can try again.");
        return;
      }
      const subscription = await subscribeThisBrowser(publicKey);
      const payload = toServerSubscription(subscription);
      if (!payload) {
        await subscription.unsubscribe().catch(() => undefined);
        throw new Error("subscription without keys");
      }
      try {
        await savePushSubscription(accessToken, payload);
      } catch (err) {
        // Keep the browser and the server in step: no server row means no local subscription.
        await subscription.unsubscribe().catch(() => undefined);
        if (
          err instanceof PushApiError &&
          (err.code === "push_endpoint_not_accepted" || err.code === "push_not_configured")
        ) {
          if (alive.current) setView("unsupported");
          return;
        }
        throw err;
      }
      if (alive.current) setView("on");
    } catch {
      if (alive.current) setMessage("Couldn’t turn on push notifications. Check your connection and try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function turnOff() {
    if (!accessToken || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const removed = await unsubscribeThisBrowser();
      // The browser is already off. The server row is removed best effort; if this call fails the
      // push service answers 404 or 410 on the next send and the server deletes the row itself.
      if (removed) await deletePushSubscription(accessToken, removed).catch(() => undefined);
      if (alive.current) setView("off");
    } catch {
      if (alive.current) setMessage("Couldn’t turn off push notifications. Check your connection and try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (!accessToken) {
    return (
      <p className="settings-status" role="status">
        Log in to manage push notifications. <Link to="/login">Log in</Link>
      </p>
    );
  }

  const header = (
    <div>
      <h2 className="settings-page__title">Push notifications</h2>
      <p className="settings-page__lead">Manage push notifications on this browser.</p>
    </div>
  );

  if (view === "loading") {
    return (
      <div className="settings-page">
        {header}
        <p className="notif-state__line" role="status">
          Loading your settings&hellip;
        </p>
      </div>
    );
  }

  if (view === "load-error") {
    return (
      <div className="settings-page">
        {header}
        <div className="notif-state">
          <p className="notif-state__line" role="alert">
            Couldn&rsquo;t load your settings.
          </p>
          <button type="button" className="notif-state__retry" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (view === "unsupported") {
    return (
      <div className="settings-page">
        {header}
        <div className="push-callout">
          <span className="push-callout__bar" aria-hidden="true" />
          <p className="push-callout__text">
            This browser or device can&rsquo;t receive push notifications. You&rsquo;ll still see your notifications
            in Soccernity.
          </p>
        </div>
      </div>
    );
  }

  const on = view === "on";
  const blocked = view === "blocked";

  return (
    <div className="settings-page">
      {header}

      <ul className="notif-rows notif-rows--live">
        <li className="notif-row">
          <div className="notif-row__body">
            <p className="notif-row__title" id={ROW_TITLE_ID}>
              Turn on push notifications
            </p>
            <p className="notif-row__desc">
              Get push notifications to find out what&rsquo;s going on when you&rsquo;re not on Soccernity. You can
              turn them off anytime.
            </p>
          </div>
          <SettingToggle
            labelledBy={ROW_TITLE_ID}
            checked={on}
            disabled={blocked || busy}
            onChange={() => void (on ? turnOff() : turnOn())}
          />
        </li>
      </ul>

      {blocked ? (
        <>
          <div className="push-callout push-callout--alert" role="status">
            <span className="push-callout__bar" aria-hidden="true" />
            <p className="push-callout__text">
              Notifications are blocked in this browser. To turn push on, allow notifications for Soccernity in your
              browser&rsquo;s site settings, then come back and try again.
            </p>
          </div>
          <div>
            <button type="button" className="notif-state__retry" onClick={() => void load()}>
              Check again
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="push-callout">
            <span className="push-callout__bar" aria-hidden="true" />
            <p className="push-callout__text">{PUSH_CONTENT_NOTE}</p>
          </div>
          <p className="notif-footnote">
            This setting applies to this browser only. Turn it on separately on each browser or device you use.
          </p>
        </>
      )}

      {busy ? (
        <p className="notif-state__line" role="status">
          {on ? "Turning off…" : "Turning on…"}
        </p>
      ) : null}
      {message ? (
        <p className="notif-state__line notif-state__line--error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
