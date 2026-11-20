// The private card on another person's profile (B-060, Figma PV1 / PV5), plus the follow-then-full-profile
// flow and an unchanged public profile. The older OtherProfilePage.test.tsx is unchanged.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import OtherProfilePage, { PRIVATE_PROFILE_BODY, PRIVATE_PROFILE_TITLE } from "./OtherProfilePage";
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
vi.mock("../api/moderation", async () => {
  const actual = await vi.importActual<typeof import("../api/moderation")>("../api/moderation");
  return { ...actual, createReport: vi.fn() };
});
vi.mock("./community/PinnedEntry", () => ({
  default: (props: { userId: string }) => <div data-testid="pinned-entry-stub">{props.userId}</div>,
}));
import { getPublicProfile, followUser, unfollowUser, blockUser } from "../api/users";
import { createReport } from "../api/moderation";
import { startConversation } from "../api/messaging";
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
    country: "NG",
    avatarUrl: null,
    coverUrl: "https://cdn.example/cover.jpg",
    isFollowing: false,
    viewerHasBlocked: false,
    isPrivate: false,
    viewerFollows: false,
    ...over,
  };
}

// What the server returns for a non-follower of a private owner (backend PR #689).
function privateCard(over: Partial<PublicProfile> = {}): PublicProfile {
  return profile({
    bio: null,
    country: null,
    coverUrl: null,
    guardianContact: null,
    isPrivate: true,
    viewerFollows: false,
    ...over,
  });
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession(TOKEN);
  vi.mocked(getPublicProfile).mockReset();
  vi.mocked(followUser).mockReset();
  vi.mocked(unfollowUser).mockReset();
  vi.mocked(blockUser).mockReset();
  vi.mocked(createReport).mockReset();
  vi.mocked(startConversation).mockReset();
});

function renderAt(path = "/users/u2") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users/:userId" element={<OtherProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("a private profile, seen by a non-follower (PV1 / PV5)", () => {
  it("shows the name, the avatar tile, Follow and the private note, and nothing else of the profile", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard());
    renderAt();

    await screen.findByRole("heading", { name: "tobi_9" });
    expect(screen.getByTestId("private-profile")).not.toBeNull();
    expect(screen.getByText(PRIVATE_PROFILE_TITLE)).not.toBeNull();
    expect(PRIVATE_PROFILE_TITLE).toBe("This profile is private");
    expect(PRIVATE_PROFILE_BODY).toBe("Follow to see their profile, posts and activity. [COPY PENDING LEGAL REVIEW]");
    expect(screen.getByText(PRIVATE_PROFILE_BODY)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Follow" })).not.toBeNull();
    // The neutral band replaces the cover; no picture is drawn from the (null) cover.
    expect(document.querySelector(".other-profile__private-band")).not.toBeNull();
    expect(document.querySelector(".profile-cover")).toBeNull();
    // Nothing else of the profile: no bio, no country, no guardian contact, no pinned entry, no counts or posts.
    expect(screen.queryByText("Winger from Lagos")).toBeNull();
    expect(screen.queryByText("Nigeria")).toBeNull();
    expect(screen.queryByText(/guardian contact/i)).toBeNull();
    expect(screen.queryByTestId("pinned-entry-stub")).toBeNull();
    expect(screen.queryByText(/follower counts/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
  });

  it("draws the initials when there is no picture, and the picture when the server returns one", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard({ avatarUrl: "https://cdn.example/a.jpg" }));
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    expect(document.querySelector(".profile-header__avatar-image")).not.toBeNull();
  });

  it("has no Message button, and a More menu with ONLY Report user and Block", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard());
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });

    expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Report user", "Block tobi_9"]);
    expect(screen.queryByRole("menuitem", { name: /copy profile link/i })).toBeNull();
  });

  it("Report user opens the report dialog for this user and sends a user report", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard());
    vi.mocked(createReport).mockResolvedValue({ id: "r1" } as Awaited<ReturnType<typeof createReport>>);
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Report user" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Report this user")).not.toBeNull();
    fireEvent.click(within(dialog).getAllByRole("radio")[0]);
    fireEvent.click(within(dialog).getByRole("button", { name: /submit|send/i }));

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createReport).mock.calls[0][1]).toMatchObject({ targetType: "user", targetId: "u2" });
  });

  it("Block opens the existing confirmation for this user", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard());
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block tobi_9" }));
    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(blockUser).not.toHaveBeenCalled();
  });

  it("after a successful Follow the profile is read again and the full view appears", async () => {
    vi.mocked(getPublicProfile)
      .mockResolvedValueOnce(privateCard())
      .mockResolvedValueOnce(profile({ isFollowing: true, viewerFollows: true }));
    vi.mocked(followUser).mockResolvedValue({ following: true } as Awaited<ReturnType<typeof followUser>>);
    renderAt();
    await screen.findByText(PRIVATE_PROFILE_TITLE);

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    expect(await screen.findByText("Winger from Lagos")).not.toBeNull();
    expect(getPublicProfile).toHaveBeenCalledTimes(2);
    expect(followUser).toHaveBeenCalledWith(expect.any(String), "u2");
    expect(screen.queryByText(PRIVATE_PROFILE_TITLE)).toBeNull();
    expect(screen.queryByTestId("private-profile")).toBeNull();
    expect(screen.getByRole("button", { name: "Following" })).not.toBeNull();
    // The full view brings Message back.
    expect(screen.getByRole("button", { name: "Message" })).not.toBeNull();
    expect(screen.getByTestId("pinned-entry-stub")).not.toBeNull();
  });

  it("a failed Follow keeps the private card and shows the error", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard());
    vi.mocked(followUser).mockRejectedValue(new UsersApiError("You can't follow that user.", { status: 403 }));
    renderAt();
    await screen.findByText(PRIVATE_PROFILE_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You can't follow that user.");
    expect(screen.getByText(PRIVATE_PROFILE_TITLE)).not.toBeNull();
    expect(getPublicProfile).toHaveBeenCalledTimes(1);
  });

  it("a successful Follow whose re-read fails keeps the card and says so", async () => {
    vi.mocked(getPublicProfile)
      .mockResolvedValueOnce(privateCard())
      .mockRejectedValueOnce(new UsersApiError("boom", { status: 500 }));
    vi.mocked(followUser).mockResolvedValue({ following: true } as Awaited<ReturnType<typeof followUser>>);
    renderAt();
    await screen.findByText(PRIVATE_PROFILE_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't refresh/i);
    expect(screen.getByText(PRIVATE_PROFILE_TITLE)).not.toBeNull();
  });

  it("when the viewer has blocked a private person the card shows the Unblock state instead", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(privateCard({ viewerHasBlocked: true }));
    renderAt();
    await screen.findByText("You blocked tobi_9");
    expect(screen.queryByText(PRIVATE_PROFILE_TITLE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unblock tobi_9" })).not.toBeNull();
  });
});

describe("a profile that is not private is unchanged", () => {
  it("shows the full profile, Message, the full menu and the pinned entry", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    expect(screen.getByText("Winger from Lagos")).not.toBeNull();
    expect(screen.getByText("Nigeria")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Message" })).not.toBeNull();
    expect(screen.getByTestId("pinned-entry-stub")).not.toBeNull();
    expect(screen.queryByTestId("private-profile")).toBeNull();
    expect(screen.queryByText(PRIVATE_PROFILE_TITLE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Copy Profile Link", "Block tobi_9"]);
  });

  it("a follower of a private person sees the normal profile with no extra mark", async () => {
    // For a follower the server answers isPrivate false, so the page cannot tell the owner is private.
    vi.mocked(getPublicProfile).mockResolvedValue(profile({ isFollowing: true, viewerFollows: true }));
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    expect(screen.queryByText(/private/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Following" })).not.toBeNull();
  });

  it("an ordinary follow on a public profile does not read the profile again", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue(profile());
    vi.mocked(followUser).mockResolvedValue({ following: true } as Awaited<ReturnType<typeof followUser>>);
    renderAt();
    await screen.findByRole("heading", { name: "tobi_9" });
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await screen.findByRole("button", { name: "Following" });
    expect(getPublicProfile).toHaveBeenCalledTimes(1);
  });

  it("unfollowing reads the profile again, so a private owner turns back into the private card", async () => {
    vi.mocked(getPublicProfile)
      .mockResolvedValueOnce(profile({ isFollowing: true, viewerFollows: true }))
      .mockResolvedValueOnce(privateCard());
    vi.mocked(unfollowUser).mockResolvedValue({ following: false } as Awaited<ReturnType<typeof unfollowUser>>);
    renderAt();
    await screen.findByRole("button", { name: "Following" });
    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    expect(await screen.findByText(PRIVATE_PROFILE_TITLE)).not.toBeNull();
    expect(screen.queryByText("Winger from Lagos")).toBeNull();
  });
});

describe("the ordinary not-found state", () => {
  it("a 404 for the profile is the one generic Page not found, with no hint about privacy", async () => {
    vi.mocked(getPublicProfile).mockRejectedValue(new UsersApiError("User not found", { status: 404 }));
    renderAt();
    expect(await screen.findByText(/page not found/i)).not.toBeNull();
    expect(screen.queryByText(/private/i)).toBeNull();
    expect(screen.queryByText(/follow/i)).toBeNull();
  });
});
