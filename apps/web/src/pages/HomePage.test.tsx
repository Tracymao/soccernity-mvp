// Following AgeGateStep.test.tsx / ProfilePage.test.tsx's established
// pattern -- plain DOM assertions, no @testing-library/jest-dom. Session
// seeded directly into sessionStorage.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import HomePage from "./HomePage";

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/community" element={<div>COMMUNITY FEED</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("renders the marketing page when there is no session", () => {
    renderAt("/");
    expect(screen.getByText(/deserves a record/i)).not.toBeNull();
    expect(screen.getByRole("heading", { name: /nobody keeps records for/i })).not.toBeNull();
    expect(screen.queryByText("COMMUNITY FEED")).toBeNull();
  });

  it("points its primary CTAs at /signup", () => {
    renderAt("/");
    const ctas = screen.getAllByRole("link", { name: /create your profile/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta.getAttribute("href")).toBe("/signup"));
  });

  it("relabels the closing CTA to Register your team and keeps it pointed at /signup (breadth retouch)", () => {
    renderAt("/");
    const cta = screen.getByRole("link", { name: /register your team/i });
    expect(cta.getAttribute("href")).toBe("/signup");
    expect(screen.queryByText(/browse grassroots teams/i)).toBeNull();
  });

  it("shows the retouched hero eyebrow and pillar 3 copy (breadth retouch)", () => {
    renderAt("/");
    expect(screen.getByText(/where the whole game lives/i)).not.toBeNull();
    expect(screen.queryByText(/built for grassroots football/i)).toBeNull();
    expect(screen.getByText(/the professional game, live\./i)).not.toBeNull();
    expect(screen.queryByText(/a record that travels with you/i)).toBeNull();
  });

  it("shows a two-section Sports Hub + Grassroots hero fixture card (breadth retouch)", () => {
    renderAt("/");
    expect(screen.getByText("SPORTS HUB")).not.toBeNull();
    expect(screen.getByText("GRASSROOTS")).not.toBeNull();
    expect(screen.getByText("Chelsea")).not.toBeNull();
    expect(screen.getByText("Liverpool")).not.toBeNull();
    // "Ikoyi Rovers FC" / "Surulere United" also appear in the Today's
    // Fixtures strip (FIXTURES[0]) -- the hero card relocated, not
    // replaced, this same illustrative grassroots match, so both places
    // render it.
    expect(screen.getAllByText("Ikoyi Rovers FC").length).toBe(2);
    expect(screen.getAllByText("Surulere United").length).toBe(2);
    expect(screen.getByText(/plus bants, blog stories/i)).not.toBeNull();
  });

  it("redirects a signed-in visitor to /community instead of rendering the marketing page (Decision Log #152)", () => {
    window.sessionStorage.setItem("sn_access_token", "header.payload.sig");
    renderAt("/");
    expect(screen.getByText("COMMUNITY FEED")).not.toBeNull();
    expect(screen.queryByText(/deserves a record/i)).toBeNull();
  });
});
