// The Bants filter flow end to end on the real BanterPage (Decision Log
// #358): the desktop modal, the active-filter chips, the invalid-range
// guard, and the mobile filter panel. Mocks the same API modules
// BanterPage.test.tsx does.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BanterPage from "./BanterPage";
import type { BanterRoom, BanterRoomPage } from "../api/banter";
import type { UserProfile } from "../api/users";

vi.mock("../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../api/banter")>("../api/banter");
  return {
    ...actual,
    listRooms: vi.fn(),
    listTopics: vi.fn(),
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

import { listRooms, listTopics, getMyRooms } from "../api/banter";
import { getUser } from "../api/users";
import { listJoinedClubs } from "../api/clubs";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function profile(): UserProfile {
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
  } as UserProfile;
}

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "room-1",
    name: "Chelsea vs Arsenal — Matchday Chat",
    scopeType: "club",
    createdBy: "someone-else",
    status: "active",
    createdAt: "2026-10-01T12:00:00.000Z",
    memberCount: 10,
    joined: false,
    ...overrides,
  };
}

function page(items: BanterRoom[]): BanterRoomPage {
  return { items, nextCursor: null };
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset().mockResolvedValue(profile());
  vi.mocked(listRooms).mockReset().mockResolvedValue(page([room()]));
  vi.mocked(getMyRooms).mockReset();
  vi.mocked(listTopics).mockReset().mockResolvedValue({
    items: [{ id: "t-1", name: "Transfers" }],
    nextCursor: null,
  });
  vi.mocked(listJoinedClubs).mockReset().mockResolvedValue([]);
  window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/banter"]}>
      <BanterPage />
    </MemoryRouter>,
  );
}

describe("BanterPage filters — desktop modal", () => {
  it("applies Categories, Date, Tag and Search together as one listRooms call", async () => {
    setViewport(1280);
    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Club" }));
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2026-10-04" } });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Tag" })).not.toBeNull());
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Tag" }), { target: { value: "t-1" } });
    fireEvent.change(within(dialog).getByLabelText("Search rooms"), { target: { value: " derby " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(listRooms).toHaveBeenLastCalledWith(expect.any(String), {
        scopeType: "club",
        topicId: "t-1",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-04",
        q: "derby",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove filter Club" })).not.toBeNull();
  });

  it("removing a chip re-runs the list without that filter only", async () => {
    setViewport(1280);
    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Club" }));
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    await waitFor(() => expect(listRooms).toHaveBeenLastCalledWith(expect.any(String), {
      scopeType: "club",
      dateFrom: "2026-10-01",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Club" }));
    await waitFor(() => expect(listRooms).toHaveBeenLastCalledWith(expect.any(String), {
      dateFrom: "2026-10-01",
    }));
  });

  it("blocks Search and shows an error when From is after To, without calling the API", async () => {
    setViewport(1280);
    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");
    const callsBefore = vi.mocked(listRooms).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-10-05" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2026-10-01" } });

    expect(within(dialog).getByRole("alert").textContent).toMatch(/on or before/);
    expect((within(dialog).getByRole("button", { name: "Search" }) as HTMLButtonElement).disabled).toBe(true);
    expect(vi.mocked(listRooms).mock.calls.length).toBe(callsBefore);
  });

  it("closes on Escape without applying anything", async () => {
    setViewport(1280);
    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove filter/ })).toBeNull();
  });
});

describe("BanterPage filters — mobile two-screen flow", () => {
  it("opens the full-screen filter panel instead of the modal, and applying returns to results with chips", async () => {
    setViewport(390);
    renderPage();
    await screen.findByText("Chelsea vs Arsenal — Matchday Chat");

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Filter" })).not.toBeNull();
    expect(screen.queryByText("Chelsea vs Arsenal — Matchday Chat")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Country" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(listRooms).toHaveBeenLastCalledWith(expect.any(String), { scopeType: "country" }));
    expect(screen.getByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove filter Country" })).not.toBeNull();
  });
});

