// R101: a 403 on a post or comment used to read as "restricted pending guardian consent" for EVERYONE,
// including an unverified adult. The notice now follows the server's own code.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";
import { classifyWriteRefusal } from "./writeRefusal";
import { FeedApiError, type FeedPost } from "../../api/feed";
import { ContestApiError } from "../../api/contest";

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return { ...actual, createPost: vi.fn(), addComment: vi.fn(), getComments: vi.fn(), recordViewHeartbeat: vi.fn() };
});
import { addComment, createPost, getComments } from "../../api/feed";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createPost).mockReset();
  vi.mocked(addComment).mockReset();
  vi.mocked(getComments).mockReset();
  vi.mocked(getComments).mockResolvedValue({ items: [], nextCursor: null });
});

const GUARDIAN = /restricted pending guardian consent/i;

function refusal(code: string | undefined, message = "Forbidden") {
  return new FeedApiError(message, { status: 403, code });
}

describe("classifyWriteRefusal", () => {
  it("maps the two guard codes and calls every other 403 'other'", () => {
    expect(classifyWriteRefusal(refusal("guardian_consent_pending"))).toBe("guardian-consent");
    expect(classifyWriteRefusal(refusal("email_verification_required"))).toBe("verify-email");
    expect(classifyWriteRefusal(refusal(undefined))).toBe("other");
    expect(classifyWriteRefusal(refusal("profile_incomplete"))).toBe("other");
    expect(classifyWriteRefusal(new ContestApiError("x", { status: 403, code: "email_verification_required" }))).toBe("verify-email");
  });

  it("ignores everything that is not a 403 from the feed or contest clients", () => {
    expect(classifyWriteRefusal(new FeedApiError("boom", { status: 500 }))).toBeNull();
    expect(classifyWriteRefusal(new Error("nope"))).toBeNull();
    expect(classifyWriteRefusal(null)).toBeNull();
  });

  it("does not read the message text: a guardian-sounding message with no code is still 'other'", () => {
    expect(classifyWriteRefusal(refusal(undefined, "This account is awaiting guardian consent"))).toBe("other");
  });
});

function renderComposer() {
  render(
    <MemoryRouter>
      <PostComposer accessToken="tok" authorName="Ada" contest={null} onCreated={vi.fn()} />
    </MemoryRouter>,
  );
}

async function submitPost() {
  fireEvent.change(screen.getByLabelText("What's happening?"), { target: { value: "Hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
}

describe("PostComposer — a 403 on posting", () => {
  it("guardian code: the guardian message and the consent-status link", async () => {
    vi.mocked(createPost).mockRejectedValue(refusal("guardian_consent_pending"));
    renderComposer();
    await submitPost();
    expect(await screen.findByText(GUARDIAN)).not.toBeNull();
    expect(screen.getByRole("link", { name: /check your consent status/i }).getAttribute("href")).toBe("/guardian-consent");
  });

  it("email code: 'Verify your email to post.' linking to the verify prompt, no guardian wording", async () => {
    vi.mocked(createPost).mockRejectedValue(refusal("email_verification_required"));
    renderComposer();
    await submitPost();
    const link = await screen.findByRole("link", { name: /verify your email/i });
    expect(link.getAttribute("href")).toBe("/verify-email/prompt");
    expect(link.closest("[role=alert]")?.textContent).toBe("Verify your email to post.");
    expect(screen.queryByText(GUARDIAN)).toBeNull();
    expect(screen.queryByRole("link", { name: /consent status/i })).toBeNull();
  });

  it.each([
    ["no code", undefined],
    ["an unknown code", "profile_incomplete"],
  ])("any other 403 (%s): a neutral message, no guardian wording and no link", async (_label, code) => {
    vi.mocked(createPost).mockRejectedValue(refusal(code as string | undefined));
    renderComposer();
    await submitPost();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("You can’t do that right now.");
    expect(screen.queryByText(GUARDIAN)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a 500 is still the ordinary error line", async () => {
    vi.mocked(createPost).mockRejectedValue(new FeedApiError("Server broke", { status: 500 }));
    renderComposer();
    await submitPost();
    expect(await screen.findByText("Server broke")).not.toBeNull();
    expect(screen.queryByText(GUARDIAN)).toBeNull();
  });
});

function postFixture(): FeedPost {
  return {
    id: "post-1",
    authorId: "user-2",
    author: { id: "user-2", publicName: "Emeka", isFollowing: false },
    contentText: "First goal",
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
  } as FeedPost;
}

async function submitComment() {
  render(
    <MemoryRouter>
      <PostCard post={postFixture()} accessToken="tok" currentUserId="user-1" />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /comment/i }));
  const input = await screen.findByLabelText("Write a comment");
  fireEvent.change(input, { target: { value: "Nice" } });
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
}

describe("PostCard — a 403 on commenting", () => {
  it("guardian code: the guardian message and the consent-status link", async () => {
    vi.mocked(addComment).mockRejectedValue(refusal("guardian_consent_pending"));
    await submitComment();
    expect(await screen.findByText(GUARDIAN)).not.toBeNull();
    expect(screen.getByRole("link", { name: /check your consent status/i }).getAttribute("href")).toBe("/guardian-consent");
  });

  it("email code: 'Verify your email to comment.' linking to the verify prompt", async () => {
    vi.mocked(addComment).mockRejectedValue(refusal("email_verification_required"));
    await submitComment();
    const link = await screen.findByRole("link", { name: /verify your email/i });
    expect(link.getAttribute("href")).toBe("/verify-email/prompt");
    expect(link.closest("[role=alert]")?.textContent).toBe("Verify your email to comment.");
    expect(screen.queryByText(GUARDIAN)).toBeNull();
  });

  it("any other 403: a neutral message, even when the server's text mentions guardian consent", async () => {
    vi.mocked(addComment).mockRejectedValue(refusal(undefined, "This account is awaiting guardian consent"));
    await submitComment();
    await waitFor(() => expect(screen.getByText("You can’t do that right now.")).not.toBeNull());
    expect(screen.queryByText(GUARDIAN)).toBeNull();
    expect(screen.queryByRole("link", { name: /consent|verify/i })).toBeNull();
  });
});
