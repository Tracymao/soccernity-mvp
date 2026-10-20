import { describe, it, expect } from "vitest";
import { applyAdminTheme } from "./adminTheme";

// B-166 (Decision Log #408 item 4): semantic/alert, #FA0606 in both modes, the one
// authorised exception to the two-colour palette. Error-callout accent only.
describe("semantic/alert token", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`is applied as --sn-semantic-alert in ${mode} mode`, () => {
      applyAdminTheme(mode);
      expect(document.documentElement.style.getPropertyValue("--sn-semantic-alert").toUpperCase()).toBe("#FA0606");
    });
  }
});
