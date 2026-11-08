// The one small line on your OWN profile when "Public profile" is off (build register B-060; Figma PV2
// 7015:58666 mobile / PV6 7015:59532 desktop, docs/figma-w8-privacy-reporting.md section PV).
// Adult accounts only: an under-18 account cannot turn the setting off, so nothing is asked or shown
// for it. The setting is read from GET /users/me/settings (isProfilePublic is the EFFECTIVE value);
// a failed read shows nothing (the line is an extra, never a blocker). Nothing changes when the
// setting is on.
import { useEffect, useState } from "react";
import { getUserSettings } from "../../api/userSettings";
import { getStoredAccessToken } from "../../lib/session";

// Tagged exactly as the frame tags it (B-124, docs/pending-copy-manifest.md).
export const PRIVATE_PROFILE_NOTE = "Only people who follow you can see your profile. [COPY PENDING LEGAL REVIEW]";

export default function PrivateProfileNote({ isMinor }: { isMinor: boolean }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (isMinor || !token) {
      setIsPrivate(false);
      return;
    }
    let cancelled = false;
    getUserSettings(token)
      .then((settings) => {
        if (!cancelled) setIsPrivate(settings.isProfilePublic === false);
      })
      .catch(() => {
        if (!cancelled) setIsPrivate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isMinor]);

  if (!isPrivate) return null;
  return (
    <p className="profile-header__meta" data-testid="private-profile-note">
      {PRIVATE_PROFILE_NOTE}
    </p>
  );
}
