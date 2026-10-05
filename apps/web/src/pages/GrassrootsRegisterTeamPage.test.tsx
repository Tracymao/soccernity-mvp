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
    vi.mocked(createTeam).mockResolvedValueOnce({ ...CREATED, reclaimed: false });

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

  it("shows the backend's takeover message instead of 'Team registered' when reclaimed", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockResolvedValueOnce({
      ...CREATED,
      reclaimed: true,
      message: "This team had no organiser, so you now manage it. Its fixtures and results were kept.",
    });

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));

    expect(await screen.findByRole("heading", { name: /now this team.s organiser/i })).not.toBeNull();
    expect(
      screen.getByText("This team had no organiser, so you now manage it. Its fixtures and results were kept."),
    ).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Team registered" })).toBeNull();
    expect(screen.getByRole("link", { name: "View team page" })).not.toBeNull();
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

  // ---- Pre-publication sensitive-content screen ----

  function flaggedError(field: string, categories: string[]) {
    return new GrassrootsApiError("This looks like it may mention something sensitive about someone.", {
      status: 422,
      code: "sensitive_content_review_required",
      flaggedFields: [{ field, categories }],
    });
  }

  it("a 422 from the screen shows the confirm-or-edit step instead of an error, and nothing is confirmed yet", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockRejectedValueOnce(flaggedError("name", ["health"]));

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));

    expect(await screen.findByText(/may mention something sensitive about someone/i)).not.toBeNull();
    expect(screen.getByText(/Flagged: Team name/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Register team" })).toBeNull();
    expect(createTeam).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createTeam).mock.calls[0][1]).not.toHaveProperty("confirmSensitive");
  });

  it("'Share anyway' resends with confirmSensitive: true and shows the confirmation", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam)
      .mockRejectedValueOnce(flaggedError("name", ["health"]))
      .mockResolvedValueOnce({ ...CREATED, reclaimed: false });

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share anyway" }));

    await waitFor(() => expect(createTeam).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createTeam).mock.calls[1][1]).toMatchObject({ confirmSensitive: true });
    expect(await screen.findByRole("heading", { name: "Team registered" })).not.toBeNull();
  });

  it("'Edit what I wrote' returns to the form without confirming, and editing a field withdraws the warning", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(createTeam).mockRejectedValue(flaggedError("name", ["health"]));

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit what I wrote" }));
    expect(screen.getByRole("button", { name: "Register team" })).not.toBeNull();

    // Warned again -> then typing in a screened field withdraws the warning,
    // so the confirm button can never apply to text the person didn't see flagged.
    fireEvent.click(screen.getByRole("button", { name: "Register team" }));
    await screen.findByRole("button", { name: "Share anyway" });
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Peckham Town" } });
    expect(screen.queryByRole("button", { name: "Share anyway" })).toBeNull();
    expect(screen.getByRole("button", { name: "Register team" })).not.toBeNull();
    expect(createTeam).toHaveBeenCalledTimes(2);
  });
});
