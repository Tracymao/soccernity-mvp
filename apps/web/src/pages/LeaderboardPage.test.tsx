// Follows ClubsPage.test.tsx / CommunityPage.test.tsx's pattern -- plain
// DOM assertions, mocks src/api/clubs.ts rather than hitting the network,
// session seeded directly into sessionStorage. The leaderboard ranking
// data itself is local dummy content (leaderboardData.ts) -- there is no
// endpoint to mock for it.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LeaderboardPage from "./LeaderboardPage";
import type { ClubSummary } from "../api/clubs";

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return {
    ...actual,
    listClubs: vi.fn(),
  };
});

import { listClubs } from "../api/clubs";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

const IKOYI: ClubSummary = {
  id: "club-ikoyi",
  name: "Ikoyi Rovers FC",
  league: "Lagos Sunday League",
  country: "Nigeria",
  logoUrl: null,
  memberCount: 40,
  joined: true,
};

const PORT_HARCOURT: ClubSummary = {
  id: "club-ph",
  name: "Port Harcourt Blues",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 12,
  joined: true,
};

const NOT_JOINED: ClubSummary = {
  id: "club-other",
  name: "Yaba Athletic",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 5,
  joined: false,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listClubs).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/leaderboard"]}>
      <LeaderboardPage />
    </MemoryRouter>,
  );
}

describe("LeaderboardPage", () => {
  it("shows a log-in prompt and never calls GET /clubs with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to see the leaderboard/i)).not.toBeNull();
    expect(listClubs).not.toHaveBeenCalled();
  });

  it("renders the Overall board with dummy ranking data once a session exists", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI, PORT_HARCOURT, NOT_JOINED], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Emeka John")).not.toBeNull();
    expect(screen.getByText("Adeniyi Christiana")).not.toBeNull();
    expect(screen.getByText("You")).not.toBeNull(); // the "You" tag on the caller's own row
    expect(listClubs).toHaveBeenCalledWith(expect.any(String));
  });

  it("switches to the Contest tab and shows Contest rows instead of Overall", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();
    await screen.findByText("Emeka John");

    fireEvent.click(screen.getByRole("tab", { name: "Contest" }));

    // Contest's dummy table has only 3 rows and no "Sarah Bello" (Overall-only row).
    expect(screen.queryByText("Sarah Bello")).toBeNull();
    expect(screen.getAllByText("Emeka John").length).toBeGreaterThan(0);
  });

  it("switches to the Competition tab and toggles between Prediction and Commentary", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();
    await screen.findByText("Emeka John");

    fireEvent.click(screen.getByRole("tab", { name: "Competition" }));

    expect(await screen.findByText("Abdul Yusuf")).not.toBeNull();
    expect(screen.getByText("94% accuracy")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Accuracy" })).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/competition type/i), { target: { value: "commentary" } });

    expect(await screen.findByText("Blessing Ade")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Votes" })).not.toBeNull();
  });

  it("populates the CLUB filter from real GET /clubs joined memberships and filters by club scope", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [IKOYI, PORT_HARCOURT, NOT_JOINED], nextCursor: null });

    renderPage();
    await screen.findByText("Emeka John");

    const clubSelect = screen.getByLabelText("Club") as HTMLSelectElement;
    // Only the two `joined: true` clubs are real options -- NOT_JOINED is excluded.
    const optionLabels = within(clubSelect)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(optionLabels).toEqual(["Ikoyi Rovers FC", "Port Harcourt Blues"]);

    fireEvent.click(screen.getByRole("radio", { name: "By club" }));
    // Default represented club is the first joined club (Ikoyi Rovers FC) --
    // its own player, Emeka John, should still show; a Port Harcourt-only
    // player should not.
    expect(screen.getByText("Emeka John")).not.toBeNull();
    expect(screen.queryByText("Abdul Yusuf")).toBeNull();
  });

  it("shows a 'no clubs joined' message when By club is selected with zero real memberships", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [NOT_JOINED], nextCursor: null });

    renderPage();
    await screen.findByText("Emeka John");

    fireEvent.click(screen.getByRole("radio", { name: "By club" }));

    expect(await screen.findByText(/haven.t joined a club yet/i)).not.toBeNull();
    const clubSelect = screen.getByLabelText("Club") as HTMLSelectElement;
    expect(clubSelect.disabled).toBe(true);
  });

  it("still renders the board (Global scope) if GET /clubs fails", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockRejectedValueOnce(new Error("network down"));

    renderPage();

    expect(await screen.findByText("Emeka John")).not.toBeNull();
  });

  it("switches time period without crashing", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(listClubs).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();
    await screen.findByText("Emeka John");

    fireEvent.click(screen.getByRole("radio", { name: "Weekly" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Weekly" }).getAttribute("aria-checked")).toBe("true"));
  });
});
