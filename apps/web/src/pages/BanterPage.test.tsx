// Follows ClubsPage.test.tsx's pattern -- plain DOM assertions, mocks
// src/api/banter.ts + src/api/users.ts, session seeded directly into
// sessionStorage. GET /banter-rooms, GET /banter-rooms/mine, POST
// /banter-rooms and POST/DELETE /banter-rooms/:id/join are all real
// merged endpoints (sprint-3/banter-rooms-backend) -- exercising them
// live is services/api's e2e layer's job. TRENDS/FIXTURES/SUGGESTED
// remain local dummy data (banterData.ts) -- no endpoint exists for any
// of that.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BanterPage from "./BanterPage";
import type { UserProfile } from "../api/users";
import type { BanterRoom, BanterRoomPage } from "../api/banter";

vi.mock("../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../api/banter")>("../api/banter");
  return {
    ...actual,
    listRooms: vi.fn(),
    getMyRooms: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
  };
});

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return { ...actual, listJoinedClubs: vi.fn() };
});

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});

import { BanterApiError } from "../api/banter";
import { listRooms, getMyRooms, createRoom, joinRoom, leaveRoom } from "../api/banter";
import { getUser } from "../api/users";
import { listJoinedClubs } from "../api/clubs";
import type { ClubSummary } from "../api/clubs";

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
    isTeamOrganiser: false,
    ...overrides,
  };
}

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "room-1",
    name: "Chelsea vs Arsenal — Matchday Chat",
    scopeType: "club",
    createdBy: "someone-else",
    memberCount: 5230,
    joined: false,
    ...overrides,
  };
}

function club(overrides: Partial<ClubSummary> = {}): ClubSummary {
  return {
    id: "club-1",
    name: "Chelsea FC",
    league: "Premier League",
    country: "England",
    logoUrl: null,
    memberCount: 100,
    joined: true,
    ...overrides,
  };
}

function page(items: BanterRoom[], nextCursor: string | null = null): BanterRoomPage {
  return { items, nextCursor };
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
  vi.mocked(listRooms).mockReset();
  vi.mocked(getMyRooms).mockReset();
  vi.mocked(createRoom).mockReset();
  vi.mocked(joinRoom).mockReset();
  vi.mocked(leaveRoom).mockReset();
  vi.mocked(listJoinedClubs).mockReset();
  vi.mocked(listJoinedClubs).mockResolvedValue([]);
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/banter"]}>
      <BanterPage />
    </MemoryRouter>,
  );
}

describe("BanterPage", () => {
  it("shows a log-in prompt and never calls GET /users/:id or GET /banter-rooms with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to join the conversation on bants/i)).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(listRooms).not.toHaveBeenCalled();
  });

  it("renders the caller's real display name in the profile card, and real rooms from GET /banter-rooms", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValueOnce(profile());
    vi.mocked(listRooms).mockResolvedValueOnce(page([room()]));

    renderPage();

    expect(await screen.findByText("Temi Titiloye")).not.toBeNull();
    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(getUser).toHaveBeenCalledWith(expect.any(String), "user-1");
    expect(listRooms).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it("falls back to a generic label if the profile fetch fails, but the real room list still renders", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockRejectedValueOnce(new Error("network down"));
    vi.mocked(listRooms).mockResolvedValueOnce(page([room()]));

    renderPage();

    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByText("You", { selector: ".banter-profile__name" })).not.toBeNull();
  });

  it("re-queries GET /banter-rooms?q= server-side (debounced) when searching 'All'", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValue(profile());
    vi.mocked(listRooms)
      .mockResolvedValueOnce(page([room()]))
      .mockResolvedValueOnce(page([room({ id: "room-2", name: "NPFL Weekly Roundup" })]));

    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.change(screen.getByLabelText(/search rooms by name/i), { target: { value: "npfl" } });

    // The debounce (300ms) fires a real server round trip, not a local
    // filter -- GET /banter-rooms?q=npfl.
    await waitFor(() => expect(listRooms).toHaveBeenCalledWith(expect.any(String), { q: "npfl" }));
    expect(await screen.findByText("NPFL Weekly Roundup")).not.toBeNull();
  });

  it("'My Bants' calls GET /banter-rooms/mine and filters the result client-side", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValue(profile());
    vi.mocked(listRooms).mockResolvedValueOnce(page([room()]));
    vi.mocked(getMyRooms).mockResolvedValueOnce(
      page([
        room({ id: "mine-1", name: "Lagos Derby Day", joined: true }),
        room({ id: "mine-2", name: "Transfer Window Watch", joined: true }),
      ]),
    );

    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("tab", { name: "My Bants" }));

    expect(await screen.findByText("Lagos Derby Day")).not.toBeNull();
    expect(getMyRooms).toHaveBeenCalledWith(expect.any(String));
    // GET /banter-rooms/mine has no q param -- filtering is client-side.
    fireEvent.change(screen.getByLabelText(/filter your rooms by name/i), { target: { value: "transfer" } });
    expect(screen.queryByText("Lagos Derby Day")).toBeNull();
    expect(screen.getByText("Transfer Window Watch")).not.toBeNull();
  });

  it("joins a room via the real POST /banter-rooms/:id/join and updates member count", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValue(profile());
    vi.mocked(listRooms).mockResolvedValueOnce(page([room({ memberCount: 10, joined: false })]));
    vi.mocked(joinRoom).mockResolvedValueOnce({ roomId: "room-1", joined: true, memberCount: 11 });

    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByRole("button", { name: "Leave" })).not.toBeNull();
    expect(screen.getByText(/11 members/)).not.toBeNull();
  });

  it("creates a real room via POST /banter-rooms and navigates to it", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValue(profile());
    vi.mocked(listRooms).mockResolvedValueOnce(page([]));
    vi.mocked(createRoom).mockResolvedValueOnce(room({ id: "new-room", name: "Sunday League Talk", joined: true }));

    renderPage();
    await screen.findByText(/no rooms match that search/i);

    fireEvent.click(screen.getByRole("button", { name: "Create a room" }));
    fireEvent.change(screen.getByLabelText(/room name/i), { target: { value: "Sunday League Talk" } });
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith(expect.any(String), { name: "Sunday League Talk", scopeType: "topic" }),
    );
  });

  it("shows the real GET /banter-rooms error state on a load failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValue(profile());
    vi.mocked(listRooms).mockRejectedValueOnce(new Error("boom"));

    renderPage();

    expect(await screen.findByText(/couldn.t load rooms/i)).not.toBeNull();
  });

  it("shows a plain, threshold-free message when the account is under-16 restricted", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getUser).mockResolvedValueOnce(profile());
    vi.mocked(listRooms).mockRejectedValueOnce(
      new BanterApiError("This isn't available for your account yet.", { status: 403, code: "under_16_restricted" }),
    );
    renderPage();
    expect(await screen.findByText("This isn't available for your account yet.")).not.toBeNull();
    expect(screen.queryByText(/couldn.t load rooms/i)).toBeNull();
  });
  describe("club-scoped room creation", () => {
    function openCreateForm() {
      fireEvent.click(screen.getByRole("button", { name: "Create a room" }));
    }

    function scopeSelect(): HTMLSelectElement {
      return screen.getByLabelText("Scope") as HTMLSelectElement;
    }

    function clubOption(): HTMLOptionElement {
      return screen.getByRole("option", { name: "Club" }) as HTMLOptionElement;
    }

    beforeEach(() => {
      window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
      vi.mocked(getUser).mockResolvedValue(profile());
      vi.mocked(listRooms).mockResolvedValue(page([]));
    });

    it("creates a club room with scopeRef when the caller has a real club membership", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club({ id: "club-1", name: "Chelsea FC" })]);
      vi.mocked(createRoom).mockResolvedValueOnce(room({ id: "new-room", scopeType: "club" }));

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();

      await waitFor(() => expect(clubOption().disabled).toBe(false));
      fireEvent.change(scopeSelect(), { target: { value: "club" } });
      fireEvent.change(screen.getByLabelText(/room name/i), { target: { value: "Stamford Bridge Talk" } });
      expect((screen.getByLabelText("Club") as HTMLSelectElement).value).toBe("club-1");
      fireEvent.click(screen.getByRole("button", { name: "Create room" }));

      await waitFor(() =>
        expect(createRoom).toHaveBeenCalledWith(expect.any(String), {
          name: "Stamford Bridge Talk",
          scopeType: "club",
          scopeRef: "club-1",
        }),
      );
    });

    it("disables the Club option and explains why when the caller has no club memberships", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([]);

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();

      expect(await screen.findByText(/join a club to create one/i)).not.toBeNull();
      expect(clubOption().disabled).toBe(true);
      expect(screen.queryByLabelText("Club")).toBeNull();
    });

    it("keeps the Club option disabled while memberships are still loading", async () => {
      vi.mocked(listJoinedClubs).mockReturnValueOnce(new Promise<ClubSummary[]>(() => {}));

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();

      expect(await screen.findByText(/checking your club memberships/i)).not.toBeNull();
      expect(clubOption().disabled).toBe(true);
    });

    it("disables the Club option and offers a retry when the membership lookup fails", async () => {
      vi.mocked(listJoinedClubs).mockRejectedValueOnce(new Error("network down"));

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();

      expect(await screen.findByText(/couldn.t check your club memberships/i)).not.toBeNull();
      expect(clubOption().disabled).toBe(true);

      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(clubOption().disabled).toBe(false));
    });

    it("never sends scopeRef for a non-club scope", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);
      vi.mocked(createRoom).mockResolvedValueOnce(room({ id: "new-room", scopeType: "league" }));

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();
      await waitFor(() => expect(clubOption().disabled).toBe(false));

      fireEvent.change(scopeSelect(), { target: { value: "league" } });
      fireEvent.change(screen.getByLabelText(/room name/i), { target: { value: "NPFL Talk" } });
      fireEvent.click(screen.getByRole("button", { name: "Create room" }));

      await waitFor(() =>
        expect(createRoom).toHaveBeenCalledWith(expect.any(String), { name: "NPFL Talk", scopeType: "league" }),
      );
    });

    it("shows the server's own message legibly when a club room is rejected, and re-reads memberships", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);
      vi.mocked(createRoom).mockRejectedValueOnce(
        new BanterApiError("You can only create a club-scoped Banter Room for a club you are a member of", {
          status: 403,
        }),
      );

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();
      await waitFor(() => expect(clubOption().disabled).toBe(false));

      fireEvent.change(scopeSelect(), { target: { value: "club" } });
      fireEvent.change(screen.getByLabelText(/room name/i), { target: { value: "Ghost Club Room" } });
      fireEvent.click(screen.getByRole("button", { name: "Create room" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("You can only create a club-scoped Banter Room");
      await waitFor(() => expect(listJoinedClubs).toHaveBeenCalledTimes(2));
    });

    it("blocks submit with an explanation instead of sending a club room without a club", async () => {
      vi.mocked(listJoinedClubs).mockResolvedValueOnce([club()]);

      renderPage();
      await screen.findByText(/no rooms match that search/i);
      openCreateForm();
      await waitFor(() => expect(clubOption().disabled).toBe(false));

      fireEvent.change(scopeSelect(), { target: { value: "club" } });
      fireEvent.change(screen.getByLabelText("Club"), { target: { value: "" } });
      fireEvent.change(screen.getByLabelText(/room name/i), { target: { value: "No Club Room" } });
      expect((screen.getByRole("button", { name: "Create room" }) as HTMLButtonElement).disabled).toBe(true);
      expect(createRoom).not.toHaveBeenCalled();
    });
  });
});
