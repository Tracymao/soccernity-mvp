// Post-author controls: delete (confirm first), comment settings, hide/unhide.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostCard from "./PostCard";
import type { FeedComment, FeedPost } from "../../api/feed";
import { deletePost, getComments, setCommentHidden, updateCommentSettings } from "../../api/feed";

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return {
    ...actual,
    getComments: vi.fn(),
    deletePost: vi.fn(),
    updateCommentSettings: vi.fn(),
    setCommentHidden: vi.fn(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getComments).mockReset();
  vi.mocked(deletePost).mockReset();
  vi.mocked(updateCommentSettings).mockReset();
  vi.mocked(setCommentHidden).mockReset();
});

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "user-1",
    author: { id: "user-1", publicName: "Me", isFollowing: false },
    contentText: "My post",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 2,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

function comment(overrides: Partial<FeedComment> = {}): FeedComment {
  return {
    id: "c1",
    postId: "post-1",
    authorId: "user-2",
    author: { id: "user-2", publicName: "Other", isFollowing: false },
    contentText: "a comment",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPost(p: FeedPost, currentUserId: string, onDeleted?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <PostCard post={p} accessToken="tok" currentUserId={currentUserId} onDeleted={onDeleted} />
    </MemoryRouter>,
  );
}

describe("PostCard — author controls", () => {
  it("shows Post options only on your own post", () => {
    renderPost(post(), "user-1");
    expect(screen.getByRole("button", { name: "Post options" })).not.toBeNull();
    cleanup();
    renderPost(post(), "user-9");
    expect(screen.queryByRole("button", { name: "Post options" })).toBeNull();
  });

  it("asks for confirmation before deleting, then removes the card", async () => {
    vi.mocked(deletePost).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    renderPost(post(), "user-1", onDeleted);
    fireEvent.click(screen.getByRole("button", { name: "Post options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete post" }));
    expect(deletePost).not.toHaveBeenCalled();
    expect(screen.getByText(/permanently removes it and every comment/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete post" }));
    await waitFor(() => expect(deletePost).toHaveBeenCalledWith("tok", "post-1"));
    await waitFor(() => expect(screen.queryByText("My post")).toBeNull());
    expect(onDeleted).toHaveBeenCalledWith("post-1");
  });

  it("cancelling the confirm does not delete", () => {
    renderPost(post(), "user-1");
    fireEvent.click(screen.getByRole("button", { name: "Post options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete post" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deletePost).not.toHaveBeenCalled();
    expect(screen.getByText("My post")).not.toBeNull();
  });

  it("turns commenting off via comment settings", async () => {
    vi.mocked(updateCommentSettings).mockResolvedValue({ id: "post-1", commentPermission: "off" });
    renderPost(post(), "user-1");
    fireEvent.click(screen.getByRole("button", { name: "Post options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage comment settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow comments" }));
    await waitFor(() => expect(updateCommentSettings).toHaveBeenCalledWith("tok", "post-1", "off"));
    await waitFor(() => expect((screen.getByRole("checkbox", { name: "Allow comments" }) as HTMLInputElement).checked).toBe(false));
  });

  it("post author can hide a comment: it dims and the count drops; unhide restores", async () => {
    vi.mocked(getComments).mockResolvedValue({ items: [comment()], nextCursor: null });
    vi.mocked(setCommentHidden).mockResolvedValue({ id: "c1", hidden: true });
    renderPost(post(), "user-1");
    fireEvent.click(screen.getByRole("button", { name: /2 comments/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    await waitFor(() => expect(setCommentHidden).toHaveBeenCalledWith("tok", "post-1", "c1", true));
    expect(await screen.findByRole("button", { name: "Unhide" })).not.toBeNull();
    expect(screen.getByText(/Hidden — only you and the commenter/)).not.toBeNull();
    expect(screen.getByRole("button", { name: /1 comment$/ })).not.toBeNull();
  });

  it("a non-author never sees Hide/Unhide, but sees the hidden-by-author note on their own hidden comment", async () => {
    vi.mocked(getComments).mockResolvedValue({
      items: [comment({ authorId: "user-9", hidden: true })],
      nextCursor: null,
    });
    renderPost(post(), "user-9");
    fireEvent.click(screen.getByRole("button", { name: /2 comments/ }));
    expect(await screen.findByText(/Hidden by the post author/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unhide" })).toBeNull();
  });
});
