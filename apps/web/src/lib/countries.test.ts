import { describe, it, expect } from "vitest";
import { countryName, profileCountryOptions } from "./countries";

describe("countries", () => {
  it("offers the full ISO 3166-1 alpha-2 set the server accepts: 249 codes, no duplicates", () => {
    const options = profileCountryOptions();
    expect(options).toHaveLength(249);
    expect(new Set(options.map((o) => o.code)).size).toBe(249);
    for (const o of options) expect(o.code).toMatch(/^[A-Z]{2}$/);
  });

  it("includes the launch markets and the full list is alphabetical by name", () => {
    const options = profileCountryOptions();
    for (const code of ["GB", "NG", "US", "DE", "FR"]) {
      expect(options.some((o) => o.code === code)).toBe(true);
    }
    const names = options.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("resolves a code to its English name", () => {
    expect(countryName("NG")).toBe("Nigeria");
    expect(countryName("gb")).toMatch(/United Kingdom/);
  });
});
