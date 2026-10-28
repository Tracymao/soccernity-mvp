import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PinnedEntry from "./PinnedEntry";
import { ContestApiError } from "../../api/contest";
import type { FeedPost } from "../../api/feed";
import { FeedApiError } from "../../api/feed";
import { noContest, cycleSummary } from "../contest/contestFixtures";

vi.mock("../../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../../api/contest")>("../../api/contest");
  return { ...actual, getPinnedEntry: vi.fn(), getCurrentContest: vi.fn() };
});
vi.mock("../../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../../api/feed")>("../../api/feed");
  return { ...actual, getPostById: vi.fn(), getComments: vi.fn() };
});
import { getCurrentContest, getPinnedEntry } from "../../api/contest";
import { getPostById } from "../../api/feed";

function finalPost(over: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-9",
    authorId: "me",
    author: { id: "me", publicName: "Adeniyi Christiana", isFollowing: false },
    contentText: "My final-week entry: the one-touch dribble drill.",
    mediaUrls: ["https://cdn.example.com/final.mp4"],
    media: [{ id: "media-1", kind: "video" }],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 8,
    commentCount: 31,
    viewCount: 0,
    createdAt: "2026-09-24T10:00:00.000Z",
    isLiked: false,
    isSaved: false,
    contest: { entryId: "entry-9", kind: "final", weekNumber: 4, pinned: true, label: "Contest post" },
    ...over,
  };
}

const PINNED = {
  entry: { entryId: "entry-9", kind: "final" as const, weekNumber: 4, pinnedUntil: "2026-10-01T00:00:00.000Z", postId: "post-9" },
};

function contestAt(kind: "final_upload" | "final_live") {
  return {
    ...noContest(),
    cycle: cycleSummary(),
    calendarState:
      kind === "final_upload"
        ? ({ kind: "final_upload", opensAt: "2026-09-22T07:00:00.000Z", revealsAt: "2026-09-24T23:00:00.000Z" } as const)
        : ({ kind: "final_live", revealedAt: "2026-09-24T23:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" } as const),
  };
}

function renderEntry(userId = "me", viewer = "me") {
  return render(
    <MemoryRouter>
      <PinnedEntry accessToken="tok" userId={userId} currentUserId={viewer} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getPinnedEntry).mockReset();
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(getPostById).mockReset();
});

describe("PinnedEntry", () => {
  it("before the reveal: the pinned final entry shows with locked engagement and no counts", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue(PINNED);
    vi.mocked(getPostById).mockResolvedValue(finalPost());
    vi.mocked(getCurrentContest).mockResolvedValue(contestAt("final_upload"));
    renderEntry();

    expect(await screen.findByTestId("pinned-entry")).not.toBeNull();
    expect(screen.getByText("Pinned")).not.toBeNull();
    expect(screen.getByText("Contest post")).not.toBeNull();
    expect(screen.getByText("My final-week entry: the one-touch dribble drill.")).not.toBeNull();
    expect(screen.getByTestId("engagement-locked").textContent).toMatch(
      /Engagement is locked until the reveal\. Only you can see this entry until then\./,
    );
    expect((screen.getByRole("button", { name: /Like \(locked/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/\b31\b/)).toBeNull();
    expect(screen.queryByText(/\b8 likes\b/)).toBeNull();
    expect(getPinnedEntry).toHaveBeenCalledWith("tok", "me");
    expect(getPostById).toHaveBeenCalledWith("tok", "post-9");
  });

  it("after the reveal: the same entry is an ordinary, unlocked card with its counts", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue(PINNED);
    vi.mocked(getPostById).mockResolvedValue(finalPost());
    vi.mocked(getCurrentContest).mockResolvedValue(contestAt("final_live"));
    renderEntry();

    await screen.findByTestId("pinned-entry");
    expect(screen.queryByTestId("engagement-locked")).toBeNull();
    expect(screen.getByRole("button", { name: /8 likes/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /31 comments/ })).not.toBeNull();
  });

  it("if the contest cannot be read, the author's own entry is drawn locked (the safe default)", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue(PINNED);
    vi.mocked(getPostById).mockResolvedValue(finalPost());
    vi.mocked(getCurrentContest).mockRejectedValue(new ContestApiError("down", { status: 500 }));
    renderEntry("me", "me");
    await screen.findByTestId("engagement-locked");
  });

  it("a weekly entry that is still pinned is never locked and never reads the contest", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue({
      entry: { ...PINNED.entry, kind: "weekly", weekNumber: 2 },
    });
    vi.mocked(getPostById).mockResolvedValue(
      finalPost({ contest: { entryId: "entry-9", kind: "weekly", weekNumber: 2, pinned: true, label: "Contest post" } }),
    );
    renderEntry();
    await screen.findByTestId("pinned-entry");
    expect(screen.queryByTestId("engagement-locked")).toBeNull();
    expect(getCurrentContest).not.toHaveBeenCalled();
  });

  it("renders nothing when nothing is pinned (the pin was removed, or the viewer may not see it)", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue({ entry: null });
    renderEntry("someone-else", "me");
    await waitFor(() => expect(getPinnedEntry).toHaveBeenCalledWith("tok", "someone-else"));
    expect(screen.queryByTestId("pinned-entry")).toBeNull();
    expect(getPostById).not.toHaveBeenCalled();
  });

  it("renders nothing, never an error, when the pinned post cannot be loaded", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue(PINNED);
    vi.mocked(getPostById).mockRejectedValue(new FeedApiError("Post not found", { status: 404 }));
    renderEntry();
    await waitFor(() => expect(getPostById).toHaveBeenCalled());
    expect(screen.queryByTestId("pinned-entry")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
