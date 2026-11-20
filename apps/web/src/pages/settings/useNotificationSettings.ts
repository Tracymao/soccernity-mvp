// Shared state for the two Notification Preferences leaves that save live (Filters and Muted
// accounts; build register B-062). One read on mount, then each toggle saves on change:
//   - the toggle flips at once, the key is locked while its PATCH is in flight;
//   - on success the server's answer replaces the local copy;
//   - on failure the toggle goes back to what it was and a plain error line is shown.
// The page never computes a rule: what a toggle means is the server's business.
import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "../../lib/session";
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingKey,
  type NotificationSettings,
} from "../../api/notificationSettings";

export type NotificationSettingsLoad = "loading" | "ready" | "error";

export interface UseNotificationSettings {
  load: NotificationSettingsLoad;
  settings: NotificationSettings | null;
  /** Keys whose save is in flight. */
  saving: ReadonlySet<NotificationSettingKey>;
  saveFailed: boolean;
  toggle: (key: NotificationSettingKey) => void;
  retry: () => void;
}

export function useNotificationSettings(): UseNotificationSettings {
  const [load, setLoad] = useState<NotificationSettingsLoad>("loading");
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<NotificationSettingKey>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const current = useRef<NotificationSettings | null>(null);
  const inFlight = useRef<Set<NotificationSettingKey>>(new Set());
  current.current = settings;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    setLoad("loading");
    getNotificationSettings(token).then(
      (result) => {
        if (cancelled) return;
        setSettings(result);
        setLoad("ready");
      },
      () => {
        if (cancelled) return;
        setLoad("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const finish = useCallback((key: NotificationSettingKey) => {
    inFlight.current.delete(key);
    setSaving(new Set(inFlight.current));
  }, []);

  const toggle = useCallback(
    (key: NotificationSettingKey) => {
      const token = getStoredAccessToken();
      const before = current.current;
      if (!token || !before) return;
      // A second press on the same toggle while it is saving is ignored.
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setSaving(new Set(inFlight.current));
      const previousValue = before[key];
      setSaveFailed(false);
      setSettings({ ...before, [key]: !previousValue });
      updateNotificationSettings(token, { [key]: !previousValue }).then(
        (result) => {
          if (!alive.current) return;
          setSettings(result);
          finish(key);
        },
        () => {
          if (!alive.current) return;
          // Put back only this toggle; another one may have changed meanwhile.
          setSettings((now) => (now ? { ...now, [key]: previousValue } : now));
          setSaveFailed(true);
          finish(key);
        },
      );
    },
    [finish],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { load, settings, saving, saveFailed, toggle, retry };
}
