// What sits inside the signed-in header avatar circle (B-230, Decision Log
// #417 item 2 / #468; Figma "Avatar - Initials" 6959:46000 and the navbar
// variants `header 4 - initials` 6961:45993 / `header 4 - mobile - initials`
// 6961:46102, docs/figma-w9-header-initials-activation.md).
//
//   - an APPROVED picture -> the picture;
//   - otherwise (no picture, or one still pending / rejected) -> the person's
//     initials, taken from their OWN displayName. The header is the owner's own
//     view, so this is deliberately not the public name (the username, or
//     "Soccernity member", Decision Log #364 / B-027), which is what other users
//     see. Same rule as the drawer's identity block: lib/initials.ts;
//   - the profile still loading, or its fetch failed -> nothing (the plain
//     circle, exactly as before), so a "?" never flashes while the profile loads.
//
// A picture that cannot be loaded (a broken or not-yet-public object-store URL,
// B-207) falls back to the initials rather than leaving a broken-image icon.
//
// The Figma frame for the photo variant is the old behaviour of the header; in
// code the header never drew a picture before this PR, so the approved-picture
// branch is new (the pending / rejected picture is never shown here: only the
// owner can see those, and the Create Profile / Edit Profile screens own that).
import { useState } from "react";
import type { UserProfile } from "../api/users";
import { initialsFor } from "../lib/initials";

export default function HeaderAvatarFace({ profile }: { profile: UserProfile | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!profile) return null;

  const picture = profile.avatar;
  if (picture && picture.status === "approved" && picture.url && picture.url !== failedUrl) {
    return (
      <img
        className="sn-header__avatar-img"
        src={picture.url}
        alt=""
        onError={() => setFailedUrl(picture.url)}
      />
    );
  }

  return (
    <span className="sn-header__avatar-initials" aria-hidden="true">
      {initialsFor(profile.displayName ?? "")}
    </span>
  );
}
