// Contest times are always shown in Europe/London, whatever the viewer's own clock says (the
// calendar is fixed: docs/contest-spec.md section 5, "All boundaries are evaluated in Europe/London
// time, including across the BST/GMT change").
const TZ = "Europe/London";

function parts(iso: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options }).formatToParts(date);
}

/** "20:00" (24-hour, London). */
export function londonClock(iso: string): string {
  const p = parts(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (!p) return "";
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/** The day of the London calendar month the instant falls on (1-31). */
export function londonDayOfMonth(iso: string): number | null {
  const p = parts(iso, { day: "numeric" });
  const day = p?.find((x) => x.type === "day")?.value;
  return day ? Number(day) : null;
}

/** "Monday 8 June" (London). */
export function londonLongDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function ordinalPlace(position: number): string {
  return position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;
}

export function pluralVotes(count: number): string {
  return count === 1 ? "1 Vote" : `${count} Votes`;
}
