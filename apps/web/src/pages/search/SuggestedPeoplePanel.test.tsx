// SuggestedPeoplePanel -- desktop "Suggested" card wired to GET
// /users/suggested, Follow via the existing POST/DELETE /users/:id/follow.
// Same conventions as TrendsForYou.test.tsx: mock the api client.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SuggestedPeoplePanel from "./SuggestedPeoplePanel";
import { UsersApiError } from "../../api/users";

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return { ...actual, getSuggestedUsers: vi.fn(), followUser: vi.fn(), unfollowUser: vi.fn() };
});

import { followUser, getSuggestedUsers, unfollowUser } from "../../api/users";

function users(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, displayName: `Person ${i + 1}` }));
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getSuggestedUsers).mockReset();
  vi.mocked(followUser).mockReset();
  vi.mocked(unfollowUser).mockReset();
});

describe("SuggestedPeoplePanel", () => {
  it("requests the top 3 with the caller's token and renders each person with initials and a Follow button", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: [{ id: "u1", displayName: "Emeka John" }] });
    render(<SuggestedPeoplePanel accessToken="tok" currentUserId="me" />);

    expect(await screen.findByText("Emeka John")).not.toBeNull();
    expect(screen.getByText("EJ")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Follow Emeka John" })).not.toBeNull();
    expect(getSuggestedUsers).toHaveBeenCalledWith("tok", 3);
  });

  it("Follow calls the existing followUser and flips to Following; clicking again unfollows", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: users(1) });
    vi.mocked(followUser).mockResolvedValue({ following: true });
    vi.mocked(unfollowUser).mockResolvedValue({ following: false });
    render(<SuggestedPeoplePanel accessToken="tok" />);

    fireEvent.click(await screen.findByRole("button", { name: "Follow Person 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unfollow Person 1" })).not.toBeNull());
    expect(followUser).toHaveBeenCalledWith("tok", "u1");
    expect(screen.getByText("Following")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unfollow Person 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Follow Person 1" })).not.toBeNull());
    expect(unfollowUser).toHaveBeenCalledWith("tok", "u1");
  });

  it("shows an inline error and stays on Follow when the follow call fails", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: users(1) });
    vi.mocked(followUser).mockRejectedValue(new UsersApiError("Couldn't follow that user (404).", { status: 404 }));
    render(<SuggestedPeoplePanel accessToken="tok" />);

    fireEvent.click(await screen.findByRole("button", { name: "Follow Person 1" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByText("Couldn't follow that user (404).")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Follow Person 1" })).not.toBeNull();
  });

  it("never shows the caller's own account, defensively", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: users(2) });
    render(<SuggestedPeoplePanel accessToken="tok" currentUserId="u1" />);

    expect(await screen.findByText("Person 2")).not.toBeNull();
    expect(screen.queryByText("Person 1")).toBeNull();
  });

  it("'See more' re-requests a larger top-N and only appears when a full first page came back", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValueOnce({ items: users(3) });
    vi.mocked(getSuggestedUsers).mockResolvedValueOnce({ items: users(8) });
    render(<SuggestedPeoplePanel accessToken="tok" />);

    fireEvent.click(await screen.findByRole("button", { name: "See more" }));
    await waitFor(() => expect(getSuggestedUsers).toHaveBeenCalledWith("tok", 10));
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(8));
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  });

  it("hides 'See more' when fewer than a full page came back", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: users(2) });
    render(<SuggestedPeoplePanel accessToken="tok" />);

    await screen.findByText("Person 1");
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  });

  it("refresh re-fetches at the current limit", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValue({ items: users(2) });
    render(<SuggestedPeoplePanel accessToken="tok" />);

    await screen.findByText("Person 1");
    fireEvent.click(screen.getByRole("button", { name: "Refresh suggestions" }));
    await waitFor(() => expect(getSuggestedUsers).toHaveBeenCalledTimes(2));
    expect(getSuggestedUsers).toHaveBeenLastCalledWith("tok", 3);
  });

  it("renders empty and error states", async () => {
    vi.mocked(getSuggestedUsers).mockResolvedValueOnce({ items: [] });
    const { unmount } = render(<SuggestedPeoplePanel accessToken="tok" />);
    expect(await screen.findByText("No suggestions right now.")).not.toBeNull();
    unmount();

    vi.mocked(getSuggestedUsers).mockRejectedValueOnce(new UsersApiError("Couldn't load suggestions (500).", { status: 500 }));
    render(<SuggestedPeoplePanel accessToken="tok" />);
    expect(await screen.findByText("Couldn't load suggestions (500).")).not.toBeNull();
  });
});
