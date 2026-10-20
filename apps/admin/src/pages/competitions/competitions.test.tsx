import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateCompetitionPage from "./CreateCompetitionPage";
import CompetitionCreatedPage from "./CompetitionCreatedPage";

afterEach(cleanup);

const DEVELOPER_NOTE = /Decision Log|Build Plan|endpoint|services\/api/i;

describe("Competitions stub screens", () => {
  it("Create: discloses the parked umbrella, form disabled", () => {
    render(<MemoryRouter><CreateCompetitionPage /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toMatch(/competitions can.t be created yet/i);
    expect(screen.getByRole("note").textContent).not.toMatch(DEVELOPER_NOTE);
    expect(screen.getByRole("button", { name: "Create Competition" }).hasAttribute("disabled")).toBe(true);
    for (const el of screen.queryAllByRole("textbox")) {
      expect(el.hasAttribute("disabled")).toBe(true);
    }
  });

  it("Created: renders the success layout, discloses it's unreachable", () => {
    render(<MemoryRouter><CompetitionCreatedPage /></MemoryRouter>);
    expect(screen.getByText(/competitions can.t be created yet, so this screen can.t be reached/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Create another" }).getAttribute("href")).toBe("/competitions");
  });
});
