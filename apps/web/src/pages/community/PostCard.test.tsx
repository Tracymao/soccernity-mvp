// PostCard.tsx had no dedicated test file before this -- its like/save/
// comment behavior is exercised indirectly via CommunityPage.test.tsx /
// ClubFanPage.test.tsx / BanterRoomPage.test.tsx. This file covers only
// the new report affordances this PR adds (a real backend gap: nothing
// in apps/web ever called POST /reports before it), following the same
// "test the thing this PR actually built" discipline rather than
// re-testing what's already covered elsewhere.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostCard from "./PostCard";
import type { FeedComment, FeedPost } from "../../api/feed";
import { getComments, recordViewHeartbeat } from "../../api/feed";
import { createReport } from "../../api/moderation";

type ObserverCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return { ...actual, getComments: vi.fn(), recordViewHeartbeat: vi.fn() };
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
    author: { id: "user-2", publicName: "Emeka John", isFollowing: false },
    contentText: "First goal of the season",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 3,
    commentCount: 1,
    viewCount: 0,
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
      { id: "c1", postId: "post-1", authorId: "user-2", author: { id: "user-2", publicName: "Emeka", isFollowing: false }, contentText: "Nice one", createdAt: new Date().toISOString() },
      { id: "c2", postId: "post-1", authorId: "user-1", author: { id: "user-1", publicName: "Me", isFollowing: false }, contentText: "Thanks", createdAt: new Date().toISOString() },
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

describe("PostCard — locked final entry (engagementLocked)", () => {
  const finalEntry = (over: Partial<FeedPost> = {}) =>
    post({
      authorId: "user-1",
      author: { id: "user-1", publicName: "Sarah Bello", isFollowing: false },
      mediaUrls: ["https://cdn.example.com/final.mp4"],
      contest: { entryId: "e1", kind: "final", weekNumber: 4, pinned: true, label: "Contest post" },
      ...over,
    });

  const renderLocked = (p: FeedPost) =>
    render(
      <MemoryRouter>
        <PostCard post={p} accessToken="tok" currentUserId="user-1" engagementLocked />
      </MemoryRouter>,
    );

  it("draws the controls disabled, hides every count and says why", () => {
    renderLocked(finalEntry({ likeCount: 8, commentCount: 31 }));
    expect(screen.getByTestId("engagement-locked").textContent).toMatch(/Engagement is locked until the reveal/);
    expect(screen.getByText("Contest post")).not.toBeNull();
    for (const name of [/Comments \(locked/, /Like \(locked/, /Save \(locked/]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByText(/\b8\b/)).toBeNull();
    expect(screen.queryByText(/\b31\b/)).toBeNull();
    expect(screen.queryByText(/likes?$/)).toBeNull();
  });

  it("does not open or fetch comments when locked, even if asked to", () => {
    render(
      <MemoryRouter>
        <PostCard post={finalEntry()} accessToken="tok" currentUserId="user-1" engagementLocked initialCommentsOpen />
      </MemoryRouter>,
    );
    expect(getComments).not.toHaveBeenCalled();
  });

  it("is an ordinary card when not locked (the default)", () => {
    renderPost(post({ likeCount: 3 }));
    expect(screen.queryByTestId("engagement-locked")).toBeNull();
    expect(screen.getByRole("button", { name: /3 likes/ })).not.toBeNull();
  });
});

describe("PostCard — standalone entry page options", () => {
  it("plays a video inline when asked, and still shows a player (not a bare link) otherwise", () => {
    const p = post({ mediaUrls: ["https://cdn.example.com/a.mp4"] });
    const { container, unmount } = render(
      <MemoryRouter>
        <PostCard post={p} accessToken="tok" currentUserId="user-1" playVideo />
      </MemoryRouter>,
    );
    expect(container.querySelector("video")).not.toBeNull();
    unmount();
    const plain = render(
      <MemoryRouter>
        <PostCard post={p} accessToken="tok" currentUserId="user-1" />
      </MemoryRouter>,
    );
    // A video is always a real player (never a bare link to a URL); only how eagerly it loads differs.
    expect(plain.container.querySelector("video")?.getAttribute("preload")).toBe("none");
    expect(screen.queryByRole("link", { name: "https://cdn.example.com/a.mp4" })).toBeNull();
  });

  it("opens the comment thread straight away with initialCommentsOpen", async () => {
    vi.mocked(getComments).mockResolvedValue({ items: [], nextCursor: null });
    render(
      <MemoryRouter>
        <PostCard post={post()} accessToken="tok" currentUserId="user-1" initialCommentsOpen />
      </MemoryRouter>,
    );
    await screen.findByLabelText("Write a comment");
    expect(getComments).toHaveBeenCalledWith("tok", "post-1");
  });
});

describe("PostCard — view heartbeats (B-093)", () => {
  class FakeObserver {
    static last: FakeObserver | null = null;
    callback: ObserverCallback;
    constructor(cb: ObserverCallback) {
      this.callback = cb;
      FakeObserver.last = this;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    show(ratio: number) {
      this.callback(
        [{ intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
  }

  beforeEach(() => {
    FakeObserver.last = null;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    vi.mocked(recordViewHeartbeat).mockReset();
    vi.mocked(recordViewHeartbeat).mockResolvedValue({ done: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports another person's post that is on screen, and never says whether anything was awarded", () => {
    renderPost(post());
    act(() => FakeObserver.last?.show(1));
    expect(recordViewHeartbeat).toHaveBeenCalledWith("tok", "post-1", expect.objectContaining({ active: true }));
    expect(screen.queryByText(/point/i)).toBeNull();
  });

  it("does not report the viewer's own post", () => {
    renderPost(post({ authorId: "user-1", author: { id: "user-1", publicName: "Me", isFollowing: false } }), "user-1");
    expect(FakeObserver.last).toBeNull();
    expect(recordViewHeartbeat).not.toHaveBeenCalled();
  });

  it("does not report a locked final entry", () => {
    render(
      <MemoryRouter>
        <PostCard post={post()} accessToken="tok" currentUserId="user-9" engagementLocked />
      </MemoryRouter>,
    );
    expect(FakeObserver.last).toBeNull();
  });
});
