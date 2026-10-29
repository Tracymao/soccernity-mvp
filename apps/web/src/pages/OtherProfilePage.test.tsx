import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import OtherProfilePage from "./OtherProfilePage";
import NotFoundPage from "./NotFoundPage";
import { UsersApiError, type PublicProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return {
    ...actual,
    getPublicProfile: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
  };
});
vi.mock("../api/messaging", async () => {
  const actual = await vi.importActual<typeof import("../api/messaging")>("../api/messaging");
  return { ...actual, startConversation: vi.fn() };
});
// The pinned contest entry is covered by community/PinnedEntry.test.tsx; here only the wiring.
vi.mock("./community/PinnedEntry", () => ({
  default: (props: { userId: string; currentUserId: string }) => (
    <div data-testid="pinned-entry-stub">{`${props.userId}|${props.currentUserId}`}</div>
  ),
}));
import { getPublicProfile, followUser, unfollowUser, blockUser, unblockUser } from "../api/users";
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function profile(over: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: "u2",
    publicName: "tobi_9",
    guardianContact: null,
    bio: "Winger from Lagos",
    country: null,
    avatarUrl: null,
    coverUrl: null,
    isFollowing: false,
    viewerHasBlocked: false,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession(TOKEN);
  vi.mocked(getPublicProfile).mockReset();
  vi.mocked(followUser).mockReset();
  vi.mocked(unfollowUser).mockReset();
  vi.mocked(blockUser).mockReset();
  vi.mocked(unblockUser).mockReset();
});

function renderAt(path = "/users/u2") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users/:userId" element={<OtherProfilePage />} />
        <Route path="/profile" element={<p>own profile page</p>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OtherProfilePage", () => {
  it("shows the public name, bio, and the country only when filled in", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile({ country: "NG" }));
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    expect(screen.getByText("Winger from Lagos")).not.toBeNull();
    expect(screen.getByText("Nigeria")).not.toBeNull();
  });

  it("shows the person's pinned contest entry (the server decides whether this viewer may see it)", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    renderAt();
    expect((await screen.findByTestId("pinned-entry-stub")).textContent).toBe("u2|me");
  });

  it("draws no country line when none is set", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    expect(screen.queryByText("Nigeria")).toBeNull();
  });

  it("a person who has blocked the viewer sees the SAME generic not-found page as a missing profile", async () => {
    vi.mocked(getPublicProfile).mockRejectedValue(new UsersApiError("User not found", { status: 404 }));
    renderAt("/users/blocker");
    await screen.findByRole("heading", { name: "Page not found" });
    const blockedView = document.body.innerHTML;
    cleanup();

    vi.mocked(getPublicProfile).mockRejectedValue(new UsersApiError("User not found", { status: 404 }));
    renderAt("/users/no-such-user");
    await screen.findByRole("heading", { name: "Page not found" });
    expect(document.body.innerHTML).toBe(blockedView);
    expect(document.body.textContent).not.toMatch(/block/i);
  });

  it("redirects your own id to /profile", async () => {
    renderAt("/users/me");
    expect(await screen.findByText("own profile page")).not.toBeNull();
    expect(getPublicProfile).not.toHaveBeenCalled();
  });

  it("follow toggles", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    vi.mocked(followUser).mockResolvedValue({ following: true } as Awaited<ReturnType<typeof followUser>>);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
    await screen.findByRole("button", { name: "Following" });
    expect(followUser).toHaveBeenCalledWith(expect.any(String), "u2");
  });

  it("shows the server's own message for a follow refusal", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    vi.mocked(followUser).mockRejectedValue(
      new UsersApiError("You blocked this user.", { status: 403, code: "you_blocked_this_user" }),
    );
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You blocked this user.");
  });

  it("block: the menu opens a confirmation; only the Block button calls the API; the private note is sent", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    vi.mocked(blockUser).mockResolvedValue(undefined);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block tobi_9" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(blockUser).not.toHaveBeenCalled();
    expect(screen.getByText(/They are not told/)).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith(expect.any(String), "u2", "spam"));
    expect(await screen.findByText("You blocked tobi_9")).not.toBeNull();
    // Follow and Message are no longer offered.
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
  });

  it("Block labels match the Figma frames word for word (pass N, B-218): menu item, dialog, blocked notice", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    vi.mocked(blockUser).mockResolvedValue(undefined);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block tobi_9" }));
    // Dialog 6655:29600 / 6655:27355.
    expect(screen.getByRole("heading", { name: "Block tobi_9?" })).not.toBeNull();
    expect(screen.getByText("Blocking tobi_9:")).not.toBeNull();
    expect(screen.getByText("hides their posts, comments, likes and search results from you, and yours from them")).not.toBeNull();
    expect(screen.getByText("stops messages in both directions")).not.toBeNull();
    expect(screen.getByText("removes follows in both directions")).not.toBeNull();
    expect(screen.getByText(/You can undo it at any time in Settings; unblocking does not restore follows\. They are not told\./)).not.toBeNull();
    expect(screen.getByLabelText("Reason (optional)").getAttribute("placeholder")).toBe("Add a note for yourself");
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    // Blocked notice 6706:26750 / 6707:26595.
    expect(await screen.findByText("You blocked tobi_9")).not.toBeNull();
    expect(
      screen.getByText("You can’t follow or message them, and you won’t see their posts. Unblocking does not restore follows."),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unblock tobi_9" }).textContent).toBe("Unblock tobi_9");
  });

  it("Cancel closes the block dialog without calling the API", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block tobi_9" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(blockUser).not.toHaveBeenCalled();
  });

  it("when the viewer has blocked them, shows Unblock and no Follow/Message", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile({ viewerHasBlocked: true }));
    vi.mocked(unblockUser).mockResolvedValue(undefined);
    renderAt();
    expect(await screen.findByText("You blocked tobi_9")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unblock tobi_9" }));
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith(expect.any(String), "u2"));
    await screen.findByRole("button", { name: "Follow" });
  });

  it("shows a minor's guardian contact when the server returns it", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(
      profile({ guardianContact: { label: "Guardian contact", email: "parent@example.com" } }),
    );
    renderAt();
    expect(await screen.findByRole("link", { name: "parent@example.com" })).not.toBeNull();
  });
});
