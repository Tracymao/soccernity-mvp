// Plain DOM assertions, same convention as the other converted pages.
// No API mocking needed -- this page calls no endpoint at all (Decision
// Log #6 still blocks Sprint 4's real fixtures/scores data), and it
// renders identically with or without a session.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SportsHubPage from "./SportsHubPage";

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/sports-hub"]}>
      <SportsHubPage />
    </MemoryRouter>,
  );
}

describe("SportsHubPage", () => {
  it("renders with no session at all -- no login gate on this page", () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    renderPage();
    expect(screen.getByText("Livescores")).not.toBeNull();
    expect(screen.getAllByText("Chelsea").length).toBeGreaterThan(0);
  });

  it("filters matches to the selected league", () => {
    renderPage();
    expect(screen.getAllByText("Chelsea").length).toBe(5); // all 5 dummy matches shown by default

    fireEvent.click(screen.getByRole("button", { name: "NPFL" }));

    expect(screen.getAllByText("Chelsea").length).toBe(1); // only the one NPFL match
  });

  it("shows an empty state when the league filter excludes every match", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Serie A" }));
    expect(screen.getByText(/no matches for this league yet/i)).not.toBeNull();
  });

  it("filters the league sidebar itself by the search box", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Serie A" })).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/search league/i), { target: { value: "bundesliga" } });

    expect(screen.queryByRole("button", { name: "Serie A" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bundesliga" })).not.toBeNull();
  });

  it("renders the illustrative-data disclosure note", () => {
    renderPage();
    expect(screen.getByText(/has not yet selected a sports-data vendor/i)).not.toBeNull();
  });
});
