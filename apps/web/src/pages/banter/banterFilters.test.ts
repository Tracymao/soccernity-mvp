import { describe, it, expect } from "vitest";
import {
  NO_BANTER_FILTERS,
  activeFilterChips,
  dateRangeError,
  dateRangeLabel,
  toRoomFilters,
  type BanterFilters,
} from "./banterFilters";

function filters(overrides: Partial<BanterFilters> = {}): BanterFilters {
  return { ...NO_BANTER_FILTERS, ...overrides };
}

describe("toRoomFilters", () => {
  it("drops every unset filter so none reach the query string", () => {
    expect(toRoomFilters(NO_BANTER_FILTERS)).toEqual({});
  });

  it("maps each set filter to its API parameter, with the tag text as tagQuery", () => {
    expect(
      toRoomFilters(
        filters({
          scopeType: "league",
          tagQuery: "Arsenal",
          dateFrom: "2026-10-01",
          dateTo: "2026-10-04",
          q: "derby",
        }),
      ),
    ).toEqual({
      scopeType: "league",
      tagQuery: "Arsenal",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-04",
      q: "derby",
    });
  });
});

describe("dateRangeError", () => {
  it("is null for an open or ordered range", () => {
    expect(dateRangeError({ dateFrom: "", dateTo: "" })).toBeNull();
    expect(dateRangeError({ dateFrom: "2026-10-01", dateTo: "" })).toBeNull();
    expect(dateRangeError({ dateFrom: "2026-10-01", dateTo: "2026-10-01" })).toBeNull();
  });

  it("flags a From date after To, matching the server's 400", () => {
    expect(dateRangeError({ dateFrom: "2026-10-05", dateTo: "2026-10-01" })).not.toBeNull();
  });
});

describe("dateRangeLabel", () => {
  it("labels a two-ended, one-ended and empty range", () => {
    expect(dateRangeLabel({ dateFrom: "2026-10-01", dateTo: "2026-10-04" })).toBe("1 Oct 2026 – 4 Oct 2026");
    expect(dateRangeLabel({ dateFrom: "2026-10-01", dateTo: "" })).toBe("From 1 Oct 2026");
    expect(dateRangeLabel({ dateFrom: "", dateTo: "2026-10-04" })).toBe("To 4 Oct 2026");
    expect(dateRangeLabel({ dateFrom: "", dateTo: "" })).toBeNull();
  });
});

describe("activeFilterChips", () => {
  it("returns one chip per applied filter, in a stable order, and none when clear", () => {
    expect(activeFilterChips(NO_BANTER_FILTERS)).toEqual([]);
    expect(
      activeFilterChips(
        filters({ scopeType: "club", tagQuery: "Arsenal", dateFrom: "2026-10-01", q: "derby" }),
      ),
    ).toEqual([
      { key: "scope", label: "Club" },
      { key: "tag", label: "“Arsenal”" },
      { key: "date", label: "From 1 Oct 2026" },
      { key: "q", label: "“derby”" },
    ]);
  });
});
