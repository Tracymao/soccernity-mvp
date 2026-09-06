import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateCompetitionPage from "./CreateCompetitionPage";
import CompetitionCreatedPage from "./CompetitionCreatedPage";

afterEach(cleanup);

describe("Competitions stub screens", () => {
  it("Create: discloses the parked umbrella, form disabled", () => {
    render(<MemoryRouter><CreateCompetitionPage /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toMatch(/Competition umbrella .* parked|umbrella .* parked/i);
    expect(screen.getByRole("button", { name: "Create Competition" }).hasAttribute("disabled")).toBe(true);
    for (const el of screen.queryAllByRole("textbox")) {
      expect(el.hasAttribute("disabled")).toBe(true);
    }
  });

  it("Created: renders the success layout, discloses it's unreachable", () => {
    render(<MemoryRouter><CompetitionCreatedPage /></MemoryRouter>);
    expect(screen.getByText(/not reachable from a real flow/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Create another" }).getAttribute("href")).toBe("/competitions");
  });
});
