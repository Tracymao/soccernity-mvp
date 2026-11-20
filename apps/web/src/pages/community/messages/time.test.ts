import { describe, it, expect } from "vitest";
import { clockTime, initialsFor, messageTimeLabel, relativeShort, seenLabel } from "./time";

const NOW = new Date("2026-11-06T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeShort", () => {
  it("reads now, minutes, hours, days and weeks", () => {
    expect(relativeShort(ago(10_000), NOW)).toBe("now");
    expect(relativeShort(ago(5 * MIN), NOW)).toBe("5m");
    expect(relativeShort(ago(59 * MIN), NOW)).toBe("59m");
    expect(relativeShort(ago(22 * HOUR), NOW)).toBe("22h");
    expect(relativeShort(ago(3 * DAY), NOW)).toBe("3d");
    expect(relativeShort(ago(15 * DAY), NOW)).toBe("2w");
  });

  it("never goes negative for a time in the future", () => {
    expect(relativeShort(new Date(NOW + HOUR).toISOString(), NOW)).toBe("now");
  });
});

describe("messageTimeLabel", () => {
  it("uses a weekday inside the last week and a date after that", () => {
    expect(messageTimeLabel(ago(2 * DAY), NOW)).toMatch(/^[A-Z][a-z]{2} \d{2}:\d{2} (AM|PM)$/);
    expect(messageTimeLabel(ago(20 * DAY), NOW)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2} (AM|PM)$/);
  });
});

describe("clockTime and seenLabel (B-061: the drawn 'Seen 08:09 AM')", () => {
  it("is a two-digit clock time with AM or PM, and messageTimeLabel still ends with it", () => {
    const iso = ago(2 * DAY);
    expect(clockTime(iso)).toMatch(/^\d{2}:\d{2} (AM|PM)$/);
    expect(messageTimeLabel(iso, NOW).endsWith(clockTime(iso))).toBe(true);
  });

  it("puts 'Seen ' in front of the clock time", () => {
    const iso = ago(3 * HOUR);
    expect(seenLabel(iso)).toBe(`Seen ${clockTime(iso)}`);
    expect(seenLabel(iso)).toMatch(/^Seen \d{2}:\d{2} (AM|PM)$/);
  });
});

describe("initialsFor", () => {
  it("takes first and last initials, one for a single name, ? for none", () => {
    expect(initialsFor("Kingsley Chukwudi")).toBe("KC");
    expect(initialsFor("Emeka")).toBe("E");
    expect(initialsFor("  ")).toBe("?");
    expect(initialsFor(null)).toBe("?");
  });
});
