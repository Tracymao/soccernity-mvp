// ClubFanPage (Club — Fan Page). Same conventions as ClubsPage.test.tsx.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ClubFanPage from "./ClubFanPage";
import { ClubsApiError, type ClubSummary } from "../api/clubs";

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return {
    ...actual,
    getClubById: vi.fn(),
    joinClub: vi.fn(),
    leaveClub: vi.fn(),
  };
});

import { getClubById, joinClub, leaveClub } from "../api/clubs";

const SURULERE: ClubSummary = {
  id: "club-s",
  name: "Surulere United",
  league: "Lagos Island Amateur",
  country: "Nigeria",
  logoUrl: null,
  memberCount: 2106,
  joined: false,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getClubById).mockReset();
  vi.mocked(joinClub).mockReset();
  vi.mocked(leaveClub).mockReset();
});

function renderPage(id = "club-s") {
  render(
    <MemoryRouter initialEntries={[`/clubs/${id}`]}>
      <Routes>
        <Route path="/clubs/:id" element={<ClubFanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClubFanPage", () => {
  it("shows a log-in prompt and never calls GET /clubs/:id with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this club/i)).not.toBeNull();
    expect(getClubById).not.toHaveBeenCalled();
  });

  it("renders a club's real data from GET /clubs/:id", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Surulere United" })).not.toBeNull();
    expect(screen.getByText("Lagos Island Amateur • Nigeria")).not.toBeNull();
    expect(screen.getByText("2,106 members")).not.toBeNull();
    expect(getClubById).toHaveBeenCalledWith("test-token", "club-s");
  });

  it("reproduces the scope note verbatim (Decision Log #157 — the capability does not exist)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);

    renderPage();
    await screen.findByRole("heading", { name: "Surulere United" });

    expect(screen.getByText("Member posts and a full member list aren’t part of club pages yet.")).not.toBeNull();
  });

  it("shows the Join button for a club the caller has not joined, and toggles to Leave", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce(SURULERE);
    vi.mocked(joinClub).mockResolvedValueOnce({ clubId: SURULERE.id, joined: true, memberCount: 2107 });

    renderPage();
    await screen.findByRole("heading", { name: "Surulere United" });

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => expect(joinClub).toHaveBeenCalledWith("test-token", "club-s"));
    expect(await screen.findByRole("button", { name: "Leave" })).not.toBeNull();
    expect(screen.getByText("2,107 members")).not.toBeNull();
  });

  it("shows the Leave button for a club the caller already belongs to (joined: true)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockResolvedValueOnce({ ...SURULERE, joined: true });
    vi.mocked(leaveClub).mockResolvedValueOnce({ clubId: SURULERE.id, joined: false, memberCount: 2105 });

    renderPage();
    const leaveBtn = await screen.findByRole("button", { name: "Leave" });
    fireEvent.click(leaveBtn);

    await waitFor(() => expect(leaveClub).toHaveBeenCalledWith("test-token", "club-s"));
    expect(await screen.findByRole("button", { name: "Join" })).not.toBeNull();
    expect(joinClub).not.toHaveBeenCalled();
  });

  it("renders an honest 'Club not found' state on a 404, with a link back to /clubs", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockRejectedValueOnce(new ClubsApiError("Couldn't load that club (404).", { status: 404 }));

    renderPage("does-not-exist");

    expect(await screen.findByText(/club not found/i)).not.toBeNull();
    const backLinks = screen.getAllByRole("link", { name: /clubs/i });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /join|leave/i })).toBeNull();
  });

  it("shows a generic error (not 'not found') on a non-404 failure", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getClubById).mockRejectedValueOnce(new ClubsApiError("Couldn't load that club (500).", { status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load this club/i);
  });
});
