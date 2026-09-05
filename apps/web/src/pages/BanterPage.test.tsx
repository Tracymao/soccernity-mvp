// Follows CommunityPage.test.tsx's pattern -- plain DOM assertions,
// mocks src/api/users.ts, session seeded directly into sessionStorage.
// Room/trend/fixture content is local dummy data (banterData.ts) -- no
// endpoint exists to mock for any of it.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BanterPage from "./BanterPage";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return {
    ...actual,
    getUser: vi.fn(),
  };
});

import { getUser } from "../api/users";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "temi@example.com",
    phone: null,
    displayName: "Temi Titiloye",
    dateOfBirth: "2000-01-01",
    isMinor: false,
    role: "fan",
    verificationStatus: "verified",
    createdAt: new Date().toISOString(),
    clubAffiliationId: null,
    ...overrides,
  };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/banter"]}>
      <BanterPage />
    </MemoryRouter>,
  );
}

describe("BanterPage", () => {
  it("shows a log-in prompt and never calls GET /users/:id with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to join the conversation on bants/i)).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("renders the caller's real display name in the profile card once a session exists", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValueOnce(profile());

    renderPage();

    expect(await screen.findByText("Temi Titiloye")).not.toBeNull();
    expect(getUser).toHaveBeenCalledWith(expect.any(String), "user-1");
  });

  it("falls back to a generic label if the profile fetch fails", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockRejectedValueOnce(new Error("network down"));

    renderPage();

    // Room list still renders even though the profile call failed, and the
    // profile card falls back to a generic "You" label.
    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByText("You", { selector: ".banter-profile__name" })).not.toBeNull();
  });

  it("filters the dummy room list client-side by search term", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValueOnce(profile());

    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.change(screen.getByLabelText(/search bants rooms/i), { target: { value: "npfl" } });

    expect(screen.queryByText("Chelsea vs Arsenal — Matchday Chat")).toBeNull();
    expect(screen.getByText("NPFL Weekly Roundup")).not.toBeNull();
    expect(screen.getByText(/result showing for/i)).not.toBeNull();
  });

  it("shows a disclosure note when 'My Bants' is selected, since room membership isn't tracked", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValueOnce(profile());

    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("tab", { name: "My Bants" }));

    expect(screen.getByText(/room membership isn.t tracked yet/i)).not.toBeNull();
    // Same illustrative list is still shown, not filtered to nothing.
    expect(screen.getByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
  });
});
