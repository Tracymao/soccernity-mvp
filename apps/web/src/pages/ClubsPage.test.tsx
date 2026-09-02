// ClubsPage (Clubs — Browse). Follows CommunityPage.test.tsx /
// ClubPickerStep.test.tsx: plain DOM assertions, mocks src/api/clubs.ts,
// session seeded directly into sessionStorage. GET /clubs, POST/DELETE
// /clubs/:id/join are real merged endpoints — exercising them live is
// services/api's e2e layer's job (test/clubs.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ClubsPage from "./ClubsPage";
import { ClubsApiError, type ClubSummary } from "../api/clubs";

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return {
    ...actual,
    listClubs: vi.fn(),
    joinClub: vi.fn(),
    leaveClub: vi.fn(),
  };
});

import { listClubs, joinClub, leaveClub } from "../api/clubs";

const RIVERSIDE: ClubSummary = {
  id: "club-a",
  name: "Riverside FC",
  league: "Sunday League",
  country: "England",
  logoUrl: null,
  memberCount: 12,
  joined: false,
};

const HARBOUR: ClubSummary = {
  id: "club-b",
  name: "Harbour United",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 1,
  joined: true,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listClubs).mockReset();
  vi.mocked(joinClub).mockReset();
  vi.mocked(leaveClub).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/clubs"]}>
      <ClubsPage />
    </MemoryRouter>,
  );
}

describe("ClubsPage", () => {
  it("shows a log-in prompt and never calls GET /clubs with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to browse clubs/i)).not.toBeNull();
    expect(listClubs).not.toHaveBeenCalled();
  });

  it("renders a loaded page of clubs with Join / Leave button states from real `joined` values", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [RIVERSIDE, HARBOUR], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Riverside FC")).not.toBeNull();
    expect(screen.getByText("Sunday League • England")).not.toBeNull();
    expect(screen.getByText("12 members")).not.toBeNull();
    // Harbour: no league/country -> "Independent", memberCount 1 -> singular
    expect(screen.getByText("Independent")).not.toBeNull();
    expect(screen.getByText("1 member")).not.toBeNull();

    // joined:false -> "Join"; joined:true -> "Leave"
    expect(screen.getByRole("button", { name: "Join" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Leave" })).not.toBeNull();
    expect(listClubs).toHaveBeenCalledWith("test-token");
  });

  it("joins a club via POST /clubs/:id/join and flips the button to Leave", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [RIVERSIDE], nextCursor: null });
    vi.mocked(joinClub).mockResolvedValueOnce({ clubId: RIVERSIDE.id, joined: true, memberCount: 13 });

    renderPage();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(joinClub).toHaveBeenCalledWith("test-token", RIVERSIDE.id));
    expect(await screen.findByRole("button", { name: "Leave" })).not.toBeNull();
    expect(screen.getByText("13 members")).not.toBeNull();
  });

  it("leaves a club via DELETE /clubs/:id/join and flips the button to Join", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [HARBOUR], nextCursor: null });
    vi.mocked(leaveClub).mockResolvedValueOnce({ clubId: HARBOUR.id, joined: false, memberCount: 0 });

    renderPage();
    await screen.findByText("Harbour United");

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(leaveClub).toHaveBeenCalledWith("test-token", HARBOUR.id));
    expect(await screen.findByRole("button", { name: "Join" })).not.toBeNull();
    expect(joinClub).not.toHaveBeenCalled();
  });

  it("filters the loaded list client-side by name", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [RIVERSIDE, HARBOUR], nextCursor: null });

    renderPage();
    await screen.findByText("Riverside FC");

    fireEvent.change(screen.getByLabelText(/filter loaded clubs by name/i), { target: { value: "harbour" } });

    expect(screen.queryByText("Riverside FC")).toBeNull();
    expect(screen.getByText("Harbour United")).not.toBeNull();
    // Client-side only — no second GET /clubs call for a filter.
    expect(listClubs).toHaveBeenCalledTimes(1);
  });

  it("shows 'No clubs match that filter.' when the filter excludes everything", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [RIVERSIDE], nextCursor: null });

    renderPage();
    await screen.findByText("Riverside FC");

    fireEvent.change(screen.getByLabelText(/filter loaded clubs by name/i), { target: { value: "zzz" } });
    expect(screen.getByText("No clubs match that filter.")).not.toBeNull();
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [RIVERSIDE], nextCursor: "cursor-1" });
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [HARBOUR], nextCursor: null });

    renderPage();
    await screen.findByText("Riverside FC");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => expect(listClubs).toHaveBeenCalledWith("test-token", "cursor-1"));
    expect(await screen.findByText("Harbour United")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("shows a load error without crashing", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listClubs).mockRejectedValueOnce(new ClubsApiError("Couldn't load clubs (500)."));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load clubs/i);
  });
});
