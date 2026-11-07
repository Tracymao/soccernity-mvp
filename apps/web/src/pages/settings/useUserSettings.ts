// Load and save the caller's own settings (GET / PATCH /users/me/settings) for the two Privacy
// leaves. Save on change, optimistic: the new value shows at once (the "saving" frames), and a
// failed save puts the control back to what it was and says so (the "save failed" frames).
import { useCallback, useEffect, useRef, useState } from "react";
import { getUserSettings, updateUserSettings, type UserSettings } from "../../api/userSettings";
import { getStoredAccessToken } from "../../lib/session";

export type SettingsView = "no-session" | "loading" | "error" | "ready";

export function useUserSettings() {
  const token = getStoredAccessToken();
  const [view, setView] = useState<SettingsView>(token ? "loading" : "no-session");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  // The setting as it was before a failed save; null when there is no failure to show.
  const [failedFrom, setFailedFrom] = useState<Partial<UserSettings> | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setView("no-session");
      return;
    }
    setView("loading");
    try {
      const loaded = await getUserSettings(token);
      if (!mounted.current) return;
      setSettings(loaded);
      setView("ready");
    } catch {
      if (mounted.current) setView("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!token || !settings || busy.current) return;
      busy.current = true;
      const previous = settings;
      setFailedFrom(null);
      setSettings({ ...settings, ...patch });
      setSaving(true);
      try {
        const saved = await updateUserSettings(token, patch);
        if (mounted.current) setSettings(saved);
      } catch {
        if (mounted.current) {
          setSettings(previous);
          setFailedFrom(previous);
        }
      } finally {
        busy.current = false;
        if (mounted.current) setSaving(false);
      }
    },
    [token, settings],
  );

  return { view, settings, saving, failedFrom, save, reload: load };
}
