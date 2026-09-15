// PostCard.tsx had no dedicated test file before this -- its like/save/
// comment behavior is exercised indirectly via CommunityPage.test.tsx /
// ClubFanPage.test.tsx / BanterRoomPage.test.tsx. This file covers only
// the new report affordances this PR adds (a real backend gap: nothing
// in apps/web ever called POST /reports before it), following the same
// "test the thing this PR actually built" discipline rather than
// re-testing what's already covered elsewhere.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostCard from "./PostCard";
import type { FeedComment, FeedPost } from "../../api/feed";
import { getComments } from "../../api/feed";
import { createReport } from "../../api/moderation";

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return { ...actual, getComments: vi.fn() };
});
vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, createReport: vi.fn() };
});

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createReport).mockReset();
  vi.mocked(getComments).mockReset();
});

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "user-2",
    author: { id: "user-2", displayName: "Emeka John", isFollowing: false },
    contentText: "First goal of the season",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 3,
    commentCount: 1,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

function renderPost(p: FeedPost, currentUserId = "user-1") {
  return render(
    <MemoryRouter>
      <PostCard post={p} accessToken="tok" currentUserId={currentUserId} />
    </MemoryRouter>,
  );
}

describe("PostCard — report affordances", () => {
  it("shows a Report trigger for another user's post, offering both post and user targets", () => {
    renderPost(post());
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("button", { name: "Report post" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Report user" })).not.toBeNull();
  });

  it("hides the Report trigger on the caller's own post", () => {
    renderPost(post({ authorId: "user-1" }), "user-1");
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("submits a post report with the post's real id", async () => {
    vi.mocked(createReport).mockResolvedValueOnce({
      id: "r1",
      targetType: "post",
      targetId: "post-1",
      reason: "Spam",
      status: "open",
      createdAt: new Date().toISOString(),
    });

    renderPost(post());
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Report post" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/thanks, our team will review it/i)).not.toBeNull();
    expect(createReport).toHaveBeenCalledWith("tok", { targetType: "post", targetId: "post-1", reason: "Spam" });
  });

  it("submits a user report with the post author's real id", async () => {
    vi.mocked(createReport).mockResolvedValueOnce({
      id: "r2",
      targetType: "user",
      targetId: "user-2",
      reason: "Impersonation",
      status: "open",
      createdAt: new Date().toISOString(),
    });

    renderPost(post());
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Report user" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Impersonation" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/thanks, our team will review it/i)).not.toBeNull();
    expect(createReport).toHaveBeenCalledWith("tok", { targetType: "user", targetId: "user-2", reason: "Impersonation" });
  });

  it("offers Report on another user's comment, but not on the caller's own comment", async () => {
    const comments: FeedComment[] = [
      { id: "c1", postId: "post-1", authorId: "user-2", author: { id: "user-2", displayName: "Emeka", isFollowing: false }, contentText: "Nice one", createdAt: new Date().toISOString() },
      { id: "c2", postId: "post-1", authorId: "user-1", author: { id: "user-1", displayName: "Me", isFollowing: false }, contentText: "Thanks", createdAt: new Date().toISOString() },
    ];
    vi.mocked(getComments).mockResolvedValueOnce({ items: comments, nextCursor: null });

    renderPost(post());
    fireEvent.click(screen.getByRole("button", { name: /comment/i }));

    const otherComment = (await screen.findByText("Nice one")).closest(".comment") as HTMLElement;
    const ownComment = screen.getByText("Thanks").closest(".comment") as HTMLElement;
    expect(within(otherComment).getByRole("button", { name: "Report" })).not.toBeNull();
    expect(within(ownComment).queryByRole("button", { name: "Report" })).toBeNull();

    vi.mocked(createReport).mockResolvedValueOnce({
      id: "r3",
      targetType: "comment",
      targetId: "c1",
      reason: "Off-topic",
      status: "open",
      createdAt: new Date().toISOString(),
    });
    fireEvent.click(within(otherComment).getByRole("button", { name: "Report" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Off-topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/thanks, our team will review it/i)).not.toBeNull();
    expect(createReport).toHaveBeenCalledWith("tok", { targetType: "comment", targetId: "c1", reason: "Off-topic" });
  });
});
