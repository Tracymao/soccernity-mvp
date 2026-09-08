// GrassrootsRegisterTeamPage. Same conventions as ClubsPage.test.tsx:
// plain DOM assertions, mocks src/api/grassroots.ts, session seeded into
// sessionStorage. POST /teams is a real merged endpoint — exercising it
// live is services/api's e2e layer's job (test/grassroots.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GrassrootsRegisterTeamPage from "./GrassrootsRegisterTeamPage";
import { GrassrootsApiError, type GrassrootsTeam } from "../api/grassroots";

vi.mock("../api/grassroots", async () => {
  const actual = await vi.importActual<typeof import("../api/grassroots")>("../api/grassroots");
  return { ...actual, createTeam: vi.fn() };
});

import { createTeam } from "../api/grassroots";

const CREATED: GrassrootsTeam = {
  id: "team-new",
  name: "Peckham Town Youth",
  city: "London",
  leagueType: "school",
  createdById: "me",
  verified: false,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(createTeam).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/grassroots/register"]}>
      <GrassrootsRegisterTeamPage />
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Peckham Town Youth" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "London" } });
  fireEvent.click(screen.getByRole("radio", { name: "School" }));
}

describe("GrassrootsRegisterTeamPage", () => {
  it("shows a log-in prompt with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to register a team/i)).not.toBeNull();
    expect(createTeam).not.toHaveBeenCalled();
  });

  it("submits POST /teams and shows the confirmation with schedule / view links", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockResolvedValueOnce(CREATED);

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));

    await waitFor(() =>
      expect(createTeam).toHaveBeenCalledWith("test-token", {
        name: "Peckham Town Youth",
        city: "London",
        leagueType: "school",
      }),
    );

    expect(await screen.findByRole("heading", { name: "Team registered" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Schedule a fixture" }).getAttribute("href")).toBe(
      "/grassroots/team-new/fixtures/new",
    );
    expect(screen.getByRole("link", { name: "View team page" }).getAttribute("href")).toBe(
      "/grassroots/team-new",
    );
  });

  it("keeps the Register button disabled until name and city are filled", () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    renderPage();
    expect((screen.getByRole("button", { name: "Register team" }) as HTMLButtonElement).disabled).toBe(true);
    fillForm();
    expect((screen.getByRole("button", { name: "Register team" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces a guardian-consent 403 with a link to /guardian-consent", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockRejectedValueOnce(
      new GrassrootsApiError("This account is awaiting guardian consent and cannot access this feature yet.", {
        status: 403,
      }),
    );

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("link", { name: /consent status/i }).getAttribute("href")).toBe("/guardian-consent");
  });

  it("shows a generic error message on other failures", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockRejectedValueOnce(new GrassrootsApiError("Couldn't register that team (500)."));

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t register that team/i);
  });
});
