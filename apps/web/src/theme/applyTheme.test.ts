import { describe, it, expect } from "vitest";
import { applyTheme } from "./applyTheme";

// B-166 (Decision Log #408 item 4): semantic/alert is available to apps/web too.
describe("semantic/alert token", () => {
  it("is applied as --sn-semantic-alert (#FA0606)", () => {
    applyTheme("light");
    expect(document.documentElement.style.getPropertyValue("--sn-semantic-alert").toUpperCase()).toBe("#FA0606");
  });
});
