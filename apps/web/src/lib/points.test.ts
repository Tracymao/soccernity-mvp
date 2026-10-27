import { describe, expect, it } from "vitest";
import { formatPoints, roundPoints } from "./points";

describe("points display", () => {
  it("rounds to the nearest whole point, a half rounding up", () => {
    expect(roundPoints(12.25)).toBe(12);
    expect(roundPoints(12.5)).toBe(13);
    expect(roundPoints(12.75)).toBe(13);
    expect(roundPoints(0.25)).toBe(0);
    expect(roundPoints(0)).toBe(0);
  });

  it("formats with thousands separators and never shows a fraction", () => {
    expect(formatPoints(3318)).toBe("3,318");
    expect(formatPoints(3317.75)).toBe("3,318");
    expect(formatPoints(1234567.25)).toBe("1,234,567");
  });

  it("treats a missing number as 0 rather than printing NaN", () => {
    expect(formatPoints(Number.NaN)).toBe("0");
  });
});
