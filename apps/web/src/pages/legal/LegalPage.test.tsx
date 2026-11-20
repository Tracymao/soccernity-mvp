import { describe, it, expect, afterEach } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TermsPage, PrivacyPage } from "./LegalPage";
import { IS_NOT_APPROVED, TERMS_MARKDOWN, PRIVACY_MARKDOWN } from "./legalDocument";

afterEach(cleanup);
const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("legal pages", () => {
  it("splits the source into a non-empty ToS half and Privacy half", () => {
    expect(TERMS_MARKDOWN.startsWith("# Soccernity Terms of Service")).toBe(true);
    expect(PRIVACY_MARKDOWN.startsWith("# Soccernity Privacy Policy")).toBe(true);
    expect(TERMS_MARKDOWN).not.toContain("Soccernity Privacy Policy\n");
    expect(PRIVACY_MARKDOWN).not.toContain("PART C");
  });

  it("/terms renders the ToS heading and the not-approved banner", () => {
    wrap(<TermsPage />);
    expect(screen.getByRole("heading", { name: "Soccernity Terms of Service" })).toBeTruthy();
    expect(IS_NOT_APPROVED).toBe(true);
    expect(screen.getByRole("note").textContent).toMatch(/not approved/i);
  });

  it("/privacy renders the Privacy heading, banner and retention table", () => {
    wrap(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "Soccernity Privacy Policy" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/not approved/i);
    expect(document.querySelector("table")).not.toBeNull();
  });
});

// The Terms/Privacy text in the 8 Figma frames was synced from the same source
// file (legal/tos-pp-figma-sync) and verified to match these pages. These tests
// keep the live pages honest about the same three things: nothing is dropped by
// the renderer, the special-category clause is present, and the deliberate TBD
// placeholders are still unfilled.
describe("legal pages carry the v0.7 source copy", () => {
  // Alphanumerics only, lowercase: ignores Markdown syntax and element boundaries.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const withoutTitle = (md: string) => md.split("\n").slice(1).join("\n");

  // Text of everything the page renders from the source, minus the page's own
  // <h1>-level title (the first heading), the draft banner and the "See also" link.
  function renderedBody(ui: ReactNode): string {
    const { container, unmount } = wrap(ui);
    const parts: string[] = [];
    let skippedTitle = false;
    for (const el of Array.from(container.querySelector("main")!.children)) {
      if (el.classList.contains("legal-banner") || el.classList.contains("legal-page__other")) continue;
      if (!skippedTitle && /^H[1-5]$/.test(el.tagName)) {
        skippedTitle = true;
        continue;
      }
      parts.push(el.textContent ?? "");
    }
    unmount();
    return parts.join("\n");
  }

  it("/terms renders every character of the source, none dropped or invented", () => {
    expect(norm(renderedBody(<TermsPage />))).toBe(norm(withoutTitle(TERMS_MARKDOWN)));
  });

  it("/privacy renders every character of the source, including the retention table", () => {
    expect(norm(renderedBody(<PrivacyPage />))).toBe(norm(withoutTitle(PRIVACY_MARKDOWN)));
  });

  it("/privacy includes the special-category data clause; /terms does not", () => {
    wrap(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Special-category data.");
    expect(text).toMatch(/does not request, require, or intentionally collect special\s*category data/);
    cleanup();
    wrap(<TermsPage />);
    expect(document.body.textContent).not.toContain("Special-category data.");
  });

  it.each([
    ["/terms", <TermsPage />],
    ["/privacy", <PrivacyPage />],
  ] as const)("%s keeps the entity and effective-date placeholders unfilled", (_path, page) => {
    wrap(page);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Effective date: [PROPOSAL — TBD");
    expect(text).toContain("[Soccernity's legal entity name, registration number, and");
    expect(text).not.toMatch(/lorem ipsum/i);
  });
});
