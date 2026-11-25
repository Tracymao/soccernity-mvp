// The 404 page (Figma F-1 to F-4, founder-approved 2026-11-24).
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { clearSession, seedSession } from "../test/session";

afterEach(() => {
  cleanup();
  clearSession();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe("NotFoundPage", () => {
  it("shows the approved heading and paragraph", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "We can’t find that page" })).toBeTruthy();
    expect(
      screen.getByText("The link may be wrong, or the page may have moved. Here are some places to go instead."),
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("hides the 404 label from assistive technology", () => {
    renderPage();
    const label = screen.getByText("404");
    expect(label.tagName).toBe("P");
    expect(label.getAttribute("aria-hidden")).toBe("true");
  });

  it("Back to home goes to / when signed out", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });

  it("Back to home goes to /community when signed in", () => {
    seedSession("a.b.c");
    renderPage();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/community");
  });

  it("links to Sports Hub and Contact us", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Sports Hub" }).getAttribute("href")).toBe("/sports-hub");
    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
  });
});
