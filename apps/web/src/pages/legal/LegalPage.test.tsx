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
