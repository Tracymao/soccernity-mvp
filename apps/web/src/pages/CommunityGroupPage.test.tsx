// CommunityGroupPage (Community Group Page). Same conventions as
// ClubFanPage.test.tsx: plain DOM assertions, mocks
// src/api/community-groups.ts + src/api/users.ts, session seeded into
// sessionStorage. GET /community-groups/:id, GET
// /community-groups/:id/members, POST/DELETE /community-groups/:id/join
// and POST/DELETE /users/:id/follow are all real merged endpoints --
// exercising them live is services/api's e2e layer's job
// (test/community-groups.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import CommunityGroupPage from "./CommunityGroupPage";
import { CommunityGroupsApiError, type CommunityGroup, type CommunityGroupMember } from "../api/community-groups";

vi.mock("../api/community-groups", async () => {
  const actual = await vi.importActual<typeof import("../api/community-groups")>("../api/community-groups");
  return {
    ...actual,
    getCommunityGroupById: vi.fn(),
    getCommunityGroupMembers: vi.fn(),
    joinCommunityGroup: vi.fn(),
    leaveCommunityGroup: vi.fn(),
  };
});

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, followUser: vi.fn(), unfollowUser: vi.fn() };
});

import {
  getCommunityGroupById,
  getCommunityGroupMembers,
  joinCommunityGroup,
  leaveCommunityGroup,
} from "../api/community-groups";
import { followUser, unfollowUser } from "../api/users";

const BALLERS: CommunityGroup = {
  id: "group-1",
  name: "Lagos Mainland Ballers",
  city: "Lagos",
  positionPlayed: null,
  careerTrack: null,
  createdById: "user-1",
  memberCount: 1284,
  createdAt: "2026-09-01T00:00:00.000Z",
  joined: false,
};

const MEMBER: CommunityGroupMember = { id: "member-1", displayName: "Kemi Alabi" };

const EMPTY_MEMBER_PAGE = { items: [], nextCursor: null };

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getCommunityGroupById).mockReset();
  vi.mocked(getCommunityGroupMembers).mockReset().mockResolvedValue(EMPTY_MEMBER_PAGE);
  vi.mocked(joinCommunityGroup).mockReset();
  vi.mocked(leaveCommunityGroup).mockReset();
  vi.mocked(followUser).mockReset();
  vi.mocked(unfollowUser).mockReset();
});

function renderPage(id = "group-1") {
  render(
    <MemoryRouter initialEntries={[`/groups/${id}`]}>
      <Routes>
        <Route path="/groups/:groupId" element={<CommunityGroupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CommunityGroupPage", () => {
  it("shows a log-in prompt and never calls the API with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this group/i)).not.toBeNull();
    expect(getCommunityGroupById).not.toHaveBeenCalled();
    expect(getCommunityGroupMembers).not.toHaveBeenCalled();
  });

  it("renders a group's real header data, its dimension badge, and no feed section", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Lagos Mainland Ballers" })).not.toBeNull();
    expect(screen.getByText("City · Lagos")).not.toBeNull();
    expect(screen.getAllByText("1,284 members").length).toBeGreaterThanOrEqual(1);
    expect(getCommunityGroupById).toHaveBeenCalledWith("test-token", "group-1");
    expect(getCommunityGroupMembers).toHaveBeenCalledWith("test-token", "group-1");
    // No group-feed / composer UI anywhere -- deliberately not built
    // (see this page's own header comment / this PR's Decision Log entry).
    expect(screen.queryByText(/group feed/i)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /post|comment|write/i })).toBeNull();
  });

  it("renders a Join button (not joined) and no Joined pill when the group is not joined", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);

    renderPage();
    await screen.findByRole("heading", { name: "Lagos Mainland Ballers" });

    expect(screen.getByRole("button", { name: "Join group" })).not.toBeNull();
    expect(screen.queryByText(/✓ joined/i)).toBeNull();
  });

  it("joins a group via POST /community-groups/:id/join and flips to Leave + a Joined pill", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);
    vi.mocked(joinCommunityGroup).mockResolvedValueOnce({ groupId: "group-1", joined: true, memberCount: 1285 });

    renderPage();
    await screen.findByRole("heading", { name: "Lagos Mainland Ballers" });

    fireEvent.click(screen.getByRole("button", { name: "Join group" }));

    await waitFor(() => expect(joinCommunityGroup).toHaveBeenCalledWith("test-token", "group-1"));
    expect(await screen.findByRole("button", { name: "Leave group" })).not.toBeNull();
    expect(screen.getByText(/✓ joined/i)).not.toBeNull();
  });

  it("shows a guardian-consent message and a link to /guardian-consent on a 403 from GuardianConsentGuard", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);
    vi.mocked(joinCommunityGroup).mockRejectedValueOnce(
      new CommunityGroupsApiError(
        "This account is awaiting guardian consent and cannot access this feature yet.",
        { status: 403 },
      ),
    );

    renderPage();
    await screen.findByRole("heading", { name: "Lagos Mainland Ballers" });

    fireEvent.click(screen.getByRole("button", { name: "Join group" }));

    expect(await screen.findByText(/awaiting guardian consent/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: /check your consent status/i }).getAttribute("href")).toBe(
      "/guardian-consent",
    );
    // Still shows Join group -- the toggle did NOT succeed.
    expect(screen.getByRole("button", { name: "Join group" })).not.toBeNull();
  });

  it("renders the roster with a Follow button per member (no per-caller isFollowing field)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);
    vi.mocked(getCommunityGroupMembers).mockReset().mockResolvedValueOnce({ items: [MEMBER], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Kemi Alabi")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Follow" })).not.toBeNull();
  });

  it("follows a member via POST /users/:id/follow and flips the button to Following", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);
    vi.mocked(getCommunityGroupMembers).mockReset().mockResolvedValueOnce({ items: [MEMBER], nextCursor: null });
    vi.mocked(followUser).mockResolvedValueOnce({ following: true });

    renderPage();
    await screen.findByText("Kemi Alabi");

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => expect(followUser).toHaveBeenCalledWith("test-token", "member-1"));
    expect(await screen.findByRole("button", { name: "Following" })).not.toBeNull();
  });

  it("fetches more members with the returned cursor when Load more members is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockResolvedValueOnce(BALLERS);
    vi.mocked(getCommunityGroupMembers)
      .mockReset()
      .mockResolvedValueOnce({ items: [MEMBER], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [{ id: "member-2", displayName: "Seyi Bankole" }], nextCursor: null });

    renderPage();
    await screen.findByText("Kemi Alabi");

    fireEvent.click(screen.getByRole("button", { name: /load more members/i }));

    await waitFor(() =>
      expect(getCommunityGroupMembers).toHaveBeenCalledWith("test-token", "group-1", "cursor-1"),
    );
    expect(await screen.findByText("Seyi Bankole")).not.toBeNull();
  });

  it("shows an honest 'Group not found' state on a real 404, with a link back to /groups", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockRejectedValueOnce(
      new CommunityGroupsApiError("Couldn't load that group (404).", { status: 404 }),
    );

    renderPage("does-not-exist");

    expect(await screen.findByText(/group not found/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: /back to all groups/i }).getAttribute("href")).toBe("/groups");
  });

  it("shows a generic load error (not 'not found') on a non-404 failure", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(getCommunityGroupById).mockRejectedValueOnce(
      new CommunityGroupsApiError("Couldn't load that group (500).", { status: 500 }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByText(/group not found/i)).toBeNull();
  });
});
