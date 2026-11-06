// Time wording for the Community message sidebar and chat pop-up (B-066,
// Figma frame 1306:354): "22h" / "10h" on a conversation row, and a
// centred "Fri 08:00 AM" label between messages in the chat window.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A short age: now / 5m / 22h / 3d / 2w. Dates in the future (clock skew)
// read as "now" rather than a negative number.
export function relativeShort(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return `${Math.floor(diff / (7 * DAY))}w`;
}

// "Fri 08:00 AM" within the last week, "8 Aug 08:00 AM" for anything older.
export function messageTimeLabel(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  if (now - date.getTime() < 6 * DAY) {
    return `${date.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
  }
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

// A time label is shown before the first message and whenever two
// neighbouring messages are at least this far apart.
export const TIME_LABEL_GAP_MS = 30 * MINUTE;

export function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
