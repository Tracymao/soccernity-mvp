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

  it("redirects a signed-in visitor to /community instead of rendering the marketing page (Decision Log #152)", () => {
    window.sessionStorage.setItem("sn_access_token", "header.payload.sig");
    renderAt("/");
    expect(screen.getByText("COMMUNITY FEED")).not.toBeNull();
    expect(screen.queryByText(/deserves a record/i)).toBeNull();
  });
});
