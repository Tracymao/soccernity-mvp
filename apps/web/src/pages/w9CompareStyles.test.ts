import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// W9 (B-174, B-175): pins the style differences fixed against the Figma frames. jsdom does not lay anything out,
// so these read the stylesheet text. Each value cites the frame node it was taken from.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const club = readFileSync(path.join(HERE, "signup", "ClubPickerStep.css"), "utf8").split("\r\n").join("\n");
const verify = readFileSync(path.join(HERE, "verify-email", "VerifyEmail.css"), "utf8").split("\r\n").join("\n");

const MOBILE = "@media (max-width: 520px) {";

function block(css: string, selector: string, afterMarker?: string): string {
  const from = afterMarker ? css.indexOf(afterMarker) : 0;
  expect(from, `marker ${afterMarker} not found`).toBeGreaterThanOrEqual(0);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css.slice(from));
  expect(match, `rule ${selector} not found`).not.toBeNull();
  return match![1];
}

describe("Club Picker styles match the frames (5146:6635, 5645:8023)", () => {
  it("desktop: 60px under the bar, 13/20 member line, 12% green tint, 50px Load more, 20px error line", () => {
    expect(block(club, ".club-picker-page")).toContain("padding: 60px 32px 64px");
    expect(block(club, ".club-picker__members")).toContain("font: 400 13px/20px");
    expect(block(club, ".club-picker__secondary")).toContain("font: 400 14px/21px");
    expect(block(club, ".club-picker__logo")).toContain("var(--picker-green-tint)");
    expect(block(club, ".club-picker__join-button--joined")).toContain("var(--picker-green-tint)");
    expect(club).not.toContain("--picker-green-tint-28)"); // Decision Log #47: not a real token
    expect(block(club, ".club-picker__load-more")).toContain("height: 50px");
    expect(block(club, ".club-picker__item-error")).toContain("/20px");
    expect(block(club, ".club-picker__subheading")).toContain("margin: -16px 0 0");
  });

  it("mobile: 20px side padding, stacked full-width Join, 44px logo, 45px Load more, 50px full-width continue", () => {
    expect(block(club, ".club-picker-page", MOBILE)).toContain("padding: 24px 20px 40px");
    expect(block(club, ".club-picker__heading", MOBILE)).toContain("600 26px");
    expect(block(club, ".club-picker__item-row", MOBILE)).toContain("flex-wrap: wrap");
    expect(block(club, ".club-picker__join-button", MOBILE)).toContain("width: 100%");
    expect(block(club, ".club-picker__logo", MOBILE)).toContain("width: 44px");
    expect(block(club, ".club-picker__logo", MOBILE)).toContain("border-radius: 10px");
    expect(block(club, ".club-picker__item", MOBILE)).toContain("padding: 14px 16px");
    expect(block(club, ".club-picker__search-bar", MOBILE)).toContain("height: 48px");
    expect(block(club, ".club-picker__load-more", MOBILE)).toContain("height: 45px");
    expect(block(club, ".club-picker__continue", MOBILE)).toContain("height: 50px");
    expect(block(club, ".club-picker__continue", MOBILE)).toContain("width: 100%");
  });
});

describe("Verify email prompt styles match the frames (6750:29378 .. 6750:29633)", () => {
  it("desktop: 60px under the bar, 14/18 resend row with a 10px gap, step numbers at weight 600", () => {
    expect(block(verify, ".verify-page--prompt")).toContain("padding-top: 60px");
    expect(block(verify, ".verify-page--prompt .verify-resend")).toContain("gap: 10px");
    expect(block(verify, ".verify-page--prompt .verify-link-button,\n.verify-page--prompt .verify-resend__message")).toContain(
      "line-height: 18px",
    );
    expect(block(verify, ".verify-page--prompt .verify-row__icon")).toContain("font-weight: 600");
    expect(block(verify, ".verify-page--prompt .verify-subheading")).toContain("line-height: 26px");
  });

  it("mobile: 24px side padding, 72px icon, stacked buttons 12px apart", () => {
    const marker = "@media (max-width: 520px) {\n  .verify-page--prompt";
    expect(block(verify, ".verify-page--prompt", marker)).toContain("padding: 20px 24px 64px");
    expect(block(verify, ".verify-page--prompt .verify-prompt-icon", marker)).toContain("width: 72px");
    expect(block(verify, ".verify-page--prompt .verify-actions", marker)).toContain("gap: 12px");
  });
});
