// B-289 (Decision Log #483, Figma M4, M5, D3, D4): content a moderator removed, on the web.
//   - a removed COMMENT stays in the thread as { id, createdAt, removedByModeration: true } and is drawn as the
//     placeholder: no author, no text, nothing to hide or report;
//   - a removed POST answers its AUTHOR (and only the author) on a direct visit with { id, removedByModeration:
//     true }, drawn as a notice; everyone else gets the ordinary 404, which stays the one generic "Post not found";
//   - a pinned entry the author sees as that stub shows nothing on the profile.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import PostPage from "./PostPage";
import PostCard from "./community/PostCard";
import PinnedEntry from "./community/PinnedEntry";
import {
  FeedApiError,
  isRemovedComment,
  isRemovedPost,
  type CommentThreadItem,
  type FeedComment,
  type FeedPost,
  type RemovedFeedComment,
  type RemovedPostStub,
} from "../api/feed";
import { REMOVED_COMMENT_TEXT, REMOVED_POST_TEXT } from "../components/removed/removedContent";
import { noContest } from "./contest/contestFixtures";

vi.mock("../api/feed", async () => {
  const actual = await vi.importActual<typeof import("../api/feed")>("../api/feed");
  return { ...actual, getPostById: vi.fn(), getComments: vi.fn(), setCommentHidden: vi.fn() };
});
vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return { ...actual, getPinnedEntry: vi.fn(), getCurrentContest: vi.fn() };
});
vi.mock("../api/moderation", async () => {
  const actual = await vi.importActual<typeof import("../api/moderation")>("../api/moderation");
  return { ...actual, createReport: vi.fn() };
});
import { getComments, getPostById, setCommentHidden } from "../api/feed";
import { getCurrentContest, getPinnedEntry } from "../api/contest";
import { seedSession, clearSession } from "../test/session";

const TAG = "[COPY PENDING LEGAL REVIEW]";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

function post(over: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "sarah",
    author: { id: "sarah", publicName: "Sarah Bello", isFollowing: false },
    contentText: "Match day. Travelling with the team.",
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 3,
    commentCount: 25,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
    ...over,
  };
}

function liveComment(over: Partial<FeedComment> = {}): FeedComment {
  return {
    id: "c-live",
    postId: "post-1",
    authorId: "chidera",
    author: { id: "chidera", publicName: "Chidera O.", isFollowing: false },
    contentText: "Safe travels! Post the result when you can.",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

const REMOVED_COMMENT: RemovedFeedComment = {
  id: "c-removed",
  createdAt: new Date().toISOString(),
  removedByModeration: true,
};

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  seedSession(TOKEN);
  vi.mocked(getPostById).mockReset();
  vi.mocked(getComments).mockReset();
  vi.mocked(getPinnedEntry).mockReset();
  vi.mocked(getCurrentContest).mockReset();
});

describe("type guards", () => {
  it("tell the stubs from the full shapes", () => {
    const stub: RemovedPostStub = { id: "p", removedByModeration: true };
    expect(isRemovedPost(stub)).toBe(true);
    expect(isRemovedPost(post())).toBe(false);
    expect(isRemovedComment(REMOVED_COMMENT)).toBe(true);
    expect(isRemovedComment(liveComment())).toBe(false);
    // A stub that somehow says false is not removed.
    expect(isRemovedComment({ ...liveComment(), hidden: true })).toBe(false);
  });
});

describe("a removed comment in the thread (M4, D3)", () => {
  function renderCard(items: CommentThreadItem[], currentUserId = "me", p = post()) {
    vi.mocked(getComments).mockResolvedValue({ items, nextCursor: null });
    render(
      <MemoryRouter>
        <PostCard post={p} accessToken={TOKEN} currentUserId={currentUserId} initialCommentsOpen />
      </MemoryRouter>,
    );
  }

  it("is the placeholder, in place, with the tag, and the live comment after it is untouched", async () => {
    renderCard([REMOVED_COMMENT, liveComment()]);
    await screen.findByText("Safe travels! Post the result when you can.");
    const placeholders = screen.getAllByTestId("removed-placeholder");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].textContent).toContain(REMOVED_COMMENT_TEXT.replace(TAG, "").trim());
    expect(placeholders[0].textContent).toContain(TAG);
    // In order: the placeholder comes first.
    const everything = Array.from(document.querySelectorAll(".removed-placeholder, .comment"));
    expect(everything[0]).toBe(placeholders[0]);
  });

  it("shows no author, no text, no time and no actions on it", async () => {
    renderCard([REMOVED_COMMENT, liveComment()], "me", post({ authorId: "me", author: { id: "me", publicName: "Me", isFollowing: false } }));
    await screen.findByText("Safe travels! Post the result when you can.");
    const placeholder = screen.getByTestId("removed-placeholder");
    expect(within(placeholder).queryByRole("button")).toBeNull();
    expect(placeholder.querySelector(".comment__author")).toBeNull();
    expect(placeholder.querySelector(".comment__body")).toBeNull();
    // The post's author could hide the live comment, but there is one Hide button, not two, and no Report on
    // the removed one: the live comment keeps its own.
    expect(screen.getAllByRole("button", { name: "Hide" })).toHaveLength(1);
  });

  it("the live comment keeps its Report button, the removed one has none", async () => {
    renderCard([REMOVED_COMMENT, liveComment()]);
    await screen.findByText("Safe travels! Post the result when you can.");
    const live = screen.getByText("Safe travels! Post the result when you can.").closest(".comment") as HTMLElement;
    expect(within(live).getAllByRole("button", { name: "Report" })).toHaveLength(1);
    expect(within(screen.getByTestId("removed-placeholder")).queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("a thread of only removed comments does not claim 'No comments yet'", async () => {
    renderCard([REMOVED_COMMENT]);
    await screen.findByTestId("removed-placeholder");
    expect(screen.queryByText(/No comments yet/)).toBeNull();
  });

  it("hiding another comment still works next to a removed one, and the stub passes through untouched", async () => {
    vi.mocked(setCommentHidden).mockResolvedValue(undefined as never);
    renderCard(
      [REMOVED_COMMENT, liveComment()],
      "me",
      post({ authorId: "me", author: { id: "me", publicName: "Me", isFollowing: false } }),
    );
    await screen.findByText("Safe travels! Post the result when you can.");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await screen.findByRole("button", { name: "Unhide" });
    expect(setCommentHidden).toHaveBeenCalledWith(TOKEN, "post-1", "c-live", true);
    // Still exactly one placeholder, still without any control.
    const placeholder = screen.getByTestId("removed-placeholder");
    expect(within(placeholder).queryByRole("button")).toBeNull();
  });
});

describe("the post page for a removed post (M5, D4)", () => {
  function renderAt(path = "/posts/post-1") {
    return render(
      <MemoryRouter initialEntries={["/community", path]} initialIndex={1}>
        <Routes>
          <Route path="/posts/:postId" element={<PostPage />} />
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/community" element={<p>Community feed</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("the author sees the notice, with the tag, and a way back to home", async () => {
    vi.mocked(getPostById).mockResolvedValue({ id: "post-1", removedByModeration: true });
    renderAt();
    const notice = await screen.findByTestId("removed-placeholder");
    expect(notice.textContent).toContain(REMOVED_POST_TEXT.replace(TAG, "").trim());
    expect(notice.textContent).toContain(TAG);
    expect(screen.getByRole("heading", { name: "Post" })).toBeTruthy();
    // No post card, no actions, no comment thread, and the comments are never requested.
    expect(screen.queryByRole("button", { name: /comment/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /like/i })).toBeNull();
    expect(getComments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Back to home" }));
    expect(await screen.findByText("Home page")).toBeTruthy();
  });

  it("anyone else still gets the one generic 'Post not found', never the notice", async () => {
    vi.mocked(getPostById).mockRejectedValue(new FeedApiError("Post not found", { status: 404 }));
    renderAt();
    expect(await screen.findByText(/Post not found/)).toBeTruthy();
    expect(screen.queryByTestId("removed-placeholder")).toBeNull();
    expect(screen.queryByText(/removed/i)).toBeNull();
  });

  it("an ordinary post is unchanged", async () => {
    vi.mocked(getPostById).mockResolvedValue(post());
    vi.mocked(getComments).mockResolvedValue({ items: [], nextCursor: null });
    renderAt();
    expect(await screen.findByText("Match day. Travelling with the team.")).toBeTruthy();
    expect(screen.queryByTestId("removed-placeholder")).toBeNull();
  });

  it("the notice is a status line, not a control", async () => {
    vi.mocked(getPostById).mockResolvedValue({ id: "post-1", removedByModeration: true });
    renderAt();
    const notice = await screen.findByTestId("removed-placeholder");
    expect(within(notice).queryByRole("button")).toBeNull();
    expect(within(notice).queryByRole("link")).toBeNull();
  });
});

describe("a pinned entry Soccernity removed", () => {
  it("shows nothing on the profile (the stub is not a card)", async () => {
    vi.mocked(getPinnedEntry).mockResolvedValue({
      entry: {
        entryId: "entry-9",
        kind: "final",
        weekNumber: 4,
        pinnedUntil: "2026-10-01T00:00:00.000Z",
        postId: "post-9",
      },
    });
    vi.mocked(getPostById).mockResolvedValue({ id: "post-9", removedByModeration: true });
    vi.mocked(getCurrentContest).mockResolvedValue(noContest());
    render(
      <MemoryRouter>
        <PinnedEntry accessToken={TOKEN} userId="me" currentUserId="me" />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(getPostById).toHaveBeenCalled());
    expect(screen.queryByTestId("pinned-entry")).toBeNull();
    expect(screen.queryByTestId("removed-placeholder")).toBeNull();
  });
});
