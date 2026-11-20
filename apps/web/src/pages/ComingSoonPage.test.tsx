// ComingSoonPage — one reusable component, no API calls, no session
// dependence (Decision Log #285). Both /scouting and /academy route to
// this same component with a different featureName prop.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ComingSoonPage from "./ComingSoonPage";

afterEach(cleanup);

function renderComingSoon(featureName: string) {
  render(
    <MemoryRouter>
      <ComingSoonPage featureName={featureName} />
    </MemoryRouter>,
  );
}

describe("ComingSoonPage", () => {
  it("renders the given feature name as its heading", () => {
    renderComingSoon("Scouting");
    expect(screen.getByRole("heading", { name: "Scouting" })).not.toBeNull();
  });

  it("renders a different feature name for a different prop, same component", () => {
    renderComingSoon("Academy");
    expect(screen.getByRole("heading", { name: "Academy" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Scouting" })).toBeNull();
  });

  it("renders the generic COMING SOON badge and sub-line, not feature-specific content", () => {
    renderComingSoon("Scouting");
    expect(screen.getByText("COMING SOON")).not.toBeNull();
    expect(
      screen.getByText(/This feature is part of our Phase 2 roadmap and isn't built yet\. Check back soon\./i),
    ).not.toBeNull();
  });

  it("links 'Back to Soccernity' to the home route", () => {
    renderComingSoon("Scouting");
    expect(screen.getByRole("link", { name: "Back to Soccernity" }).getAttribute("href")).toBe("/");
  });
});
