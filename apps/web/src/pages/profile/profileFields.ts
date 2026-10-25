// Small helpers shared by Create Profile and Edit Profile.
export const BIO_MAX_LENGTH = 160;
export const PREFERRED_CLUB_MAX_LENGTH = 80;
// Mirrors services/api's UpdateUserDto.username rule.
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** "2011-09-04..." -> "04 / 09 / 2011" (the Figma read-only date of birth field). */
export function formatDobField(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]} / ${match[2]} / ${match[1]}`;
}
