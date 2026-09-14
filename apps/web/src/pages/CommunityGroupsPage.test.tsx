// CommunityGroupsPage (Community Groups -- Browse). Same conventions as
// ClubsPage.test.tsx / GrassrootsPage.test.tsx: plain DOM assertions,
// mocks src/api/community-groups.ts, session seeded into sessionStorage.
// GET /community-groups is a real merged endpoint -- exercising it live is
// services/api's e2e layer's job (test/community-groups.e2e-spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import CommunityGroupsPage from "./CommunityGroupsPage";
import { CommunityGroupsApiError, type CommunityGroup } from "../api/community-groups";

vi.mock("../api/community-groups", async () => {
  const actual = await vi.importActual<typeof import("../api/community-groups")>("../api/community-groups");
  return { ...actual, listCommunityGroups: vi.fn() };
});

import { listCommunityGroups } from "../api/community-groups";

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

const STRIKERS: CommunityGroup = {
  id: "group-2",
  name: "Strikers' Union",
  city: null,
  positionPlayed: "Striker",
  careerTrack: null,
  createdById: "user-2",
  memberCount: 862,
  createdAt: "2026-09-02T00:00:00.000Z",
  joined: true,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(listCommunityGroups).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/groups"]}>
      <CommunityGroupsPage />
    </MemoryRouter>,
  );
}

describe("CommunityGroupsPage", () => {
  it("shows a log-in prompt and never calls GET /community-groups with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to browse community groups/i)).not.toBeNull();
    expect(listCommunityGroups).not.toHaveBeenCalled();
  });

  it("renders a loaded page of groups with dimension badges, member counts, and a Create a group link -- no Join button on cards", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups).mockResolvedValueOnce({ items: [BALLERS, STRIKERS], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Lagos Mainland Ballers")).not.toBeNull();
    expect(screen.getByText("City · Lagos")).not.toBeNull();
    expect(screen.getByText("Position · Striker")).not.toBeNull();
    expect(screen.getByText("1,284 members")).not.toBeNull();
    expect(screen.getByText("862 members")).not.toBeNull();

    const link = screen.getByRole("link", { name: /Lagos Mainland Ballers/ });
    expect(link.getAttribute("href")).toBe("/groups/group-1");
    expect(screen.queryByRole("button", { name: /join|leave/i })).toBeNull();

    expect(screen.getByRole("link", { name: /create a group/i }).getAttribute("href")).toBe("/groups/new");
    // Initial load is unfiltered.
    expect(listCommunityGroups).toHaveBeenCalledWith("test-token", {});
  });

  it("shows 'No groups yet.' when the unfiltered catalogue is empty", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText("No groups yet.")).not.toBeNull();
  });

  it("re-queries the server (debounced) when exactly one dimension filter is set, showing the single-dimension empty state with a Create the first group CTA", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups)
      .mockResolvedValueOnce({ items: [BALLERS, STRIKERS], nextCursor: null }) // initial
      .mockResolvedValueOnce({ items: [], nextCursor: null }); // after city filter

    renderPage();
    await screen.findByText("Lagos Mainland Ballers");

    fireEvent.change(screen.getByLabelText(/1 · city/i), { target: { value: "Ibadan" } });

    await waitFor(() =>
      expect(listCommunityGroups).toHaveBeenCalledWith("test-token", { city: "Ibadan" }),
    );
    expect(await screen.findByText("No groups in Ibadan yet")).not.toBeNull();
    expect(screen.getByRole("link", { name: /create the first group/i }).getAttribute("href")).toBe("/groups/new");
  });

  it("shows the multi-filter empty state and a Reset filters button when two dimensions are active and nothing matches", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups)
      .mockResolvedValueOnce({ items: [BALLERS], nextCursor: null }) // initial
      .mockResolvedValueOnce({ items: [], nextCursor: null }) // after city
      .mockResolvedValueOnce({ items: [], nextCursor: null }) // after city+position
      .mockResolvedValueOnce({ items: [BALLERS, STRIKERS], nextCursor: null }); // after reset

    renderPage();
    await screen.findByText("Lagos Mainland Ballers");

    fireEvent.change(screen.getByLabelText(/1 · city/i), { target: { value: "Lagos" } });
    await waitFor(() =>
      expect(listCommunityGroups).toHaveBeenCalledWith("test-token", { city: "Lagos" }),
    );

    fireEvent.change(screen.getByLabelText(/2 · position played/i), { target: { value: "Goalkeeper" } });
    await waitFor(() =>
      expect(listCommunityGroups).toHaveBeenCalledWith("test-token", {
        city: "Lagos",
        positionPlayed: "Goalkeeper",
      }),
    );

    expect(await screen.findByText("No groups match those filters")).not.toBeNull();
    // Two "Reset filters" buttons render simultaneously here (the filter
    // bar's own summary row, plus the multi-filter empty state's own) --
    // both call the identical resetFilters(); either one is fine to click.
    const [firstReset] = screen.getAllByRole("button", { name: /reset filters/i });
    fireEvent.click(firstReset);

    await waitFor(() => expect(listCommunityGroups).toHaveBeenLastCalledWith("test-token", {}));
    expect(await screen.findByText("Lagos Mainland Ballers")).not.toBeNull();
  });

  it("filters the loaded list client-side by name (no extra server round trip)", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups).mockResolvedValueOnce({ items: [BALLERS, STRIKERS], nextCursor: null });

    renderPage();
    await screen.findByText("Lagos Mainland Ballers");

    fireEvent.change(screen.getByLabelText(/search groups by name/i), { target: { value: "strikers" } });

    expect(screen.queryByText("Lagos Mainland Ballers")).toBeNull();
    expect(screen.getByText("Strikers' Union")).not.toBeNull();
    expect(listCommunityGroups).toHaveBeenCalledTimes(1);
  });

  it("fetches the next page with the returned cursor when Load more is clicked", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups)
      .mockResolvedValueOnce({ items: [BALLERS], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: [STRIKERS], nextCursor: null });

    renderPage();
    await screen.findByText("Lagos Mainland Ballers");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() =>
      expect(listCommunityGroups).toHaveBeenCalledWith("test-token", { cursor: "cursor-1" }),
    );
    expect(await screen.findByText("Strikers' Union")).not.toBeNull();
  });

  it("shows a load error without crashing", async () => {
    window.sessionStorage.setItem("sn_access_token", "test-token");
    vi.mocked(listCommunityGroups).mockRejectedValueOnce(new CommunityGroupsApiError("Couldn't load groups (500)."));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load groups/i);
  });
});
