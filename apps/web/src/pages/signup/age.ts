// Date-of-birth parsing/validation for the Age Gate step.
import type { AgeGateValues } from "./types";

export interface ParsedDateOfBirth {
  age: number;
}

// Returns null for anything that isn't a real, past calendar date --
// including day/month/year values that overflow (e.g. day 31 in April),
// which `new Date(...)` would otherwise silently roll into the next month
// instead of rejecting.
export function parseDateOfBirth(day: string, month: string, year: string): ParsedDateOfBirth | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
    return null;
  }

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }

  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return null; // date of birth can't be in the future
  }

  let age = now.getUTCFullYear() - y;
  const hadBirthdayThisYear = now.getUTCMonth() > m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() >= d);
  if (!hadBirthdayThisYear) {
    age -= 1;
  }

  return { age };
}

export function toIsoDate({ day, month, year }: AgeGateValues): string {
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// "4 September 2011" -- used by the Guardian Details Capture screen to
// read the declared date of birth back to the user (Figma node 5108:6627).
export function formatLongDate({ day, month, year }: AgeGateValues): string {
  const iso = toIsoDate({ day, month, year });
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}
