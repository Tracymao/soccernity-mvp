// Same conventions as ClubFanPage.test.tsx: plain DOM assertions, mocks
// src/api/banter.ts, session seeded into the in-memory session store. GET
// /banter-rooms/:id, GET /banter-rooms/:id/posts and POST
// /banter-rooms/:id/posts are all real merged endpoints
// (sprint-3/banter-rooms-backend) -- exercising them live is services/
// api's e2e layer's job.
//
// B-117 (Decision Log #404 item 10): Bants is an open forum -- the tests
// below that used to pin "join to post" now pin the opposite.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import BanterRoomPage from "./BanterRoomPage";
import { BanterApiError, type BanterRoom } from "../api/banter";
import type { FeedPost } from "../api/feed";
import { PostMediaApiError, type PostMediaView } from "../api/postMedia";
import { POLL_INTERVAL_MS } from "./community/useMediaUploads";

vi.mock("../api/banter", async () => {
  const actual = await vi.importActual<typeof import("../api/banter")>("../api/banter");
  return {
    ...actual,
    getRoomById: vi.fn(),
    getRoomFeed: vi.fn(),
    postToRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
  };
});

vi.mock("../api/postMedia", async () => {
  const actual = await vi.importActual<typeof import("../api/postMedia")>("../api/postMedia");
  return { ...actual, createUpload: vi.fn(), putFile: vi.fn(), confirmUpload: vi.fn(), getUpload: vi.fn(), deleteUpload: vi.fn() };
});

import { getRoomById, getRoomFeed, postToRoom, joinRoom, leaveRoom } from "../api/banter";
import { confirmUpload, createUpload, deleteUpload, getUpload, putFile } from "../api/postMedia";
import { seedSession, clearSession } from "../test/session";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeAccessToken(sub = "user-1"): string {
  return `${base64UrlEncode({ alg: "none" })}.${base64UrlEncode({ sub, role: "fan" })}.sig`;
}

function room(overrides: Partial<BanterRoom> = {}): BanterRoom {
  return {
    id: "room-1",
    name: "Chelsea vs Arsenal — Matchday Chat",
    scopeType: "club",
    createdBy: "someone-else",
    status: "active",
    createdAt: "2026-10-01T12:00:00.000Z",
    memberCount: 5230,
    joined: false,
    ...overrides,
  };
}

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "author-1",
    author: { id: "author-1", publicName: "Marcus Obi", isFollowing: false },
    contentText: "Big win tonight!",
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: "room-1",
    likeCount: 3,
    commentCount: 1,
    viewCount: 0,
    createdAt: "2026-09-13T00:00:00.000Z",
    isLiked: false,
    isSaved: false,
    ...overrides,
  };
}

function createdPost(contentText: string): Awaited<ReturnType<typeof postToRoom>> {
  return {
    id: "new-post",
    authorId: "user-1",
    author: { id: "user-1", publicName: "You" },
    contentText,
    mediaUrls: [],
    media: [],
    clubPageId: null,
    banterRoomId: "room-1",
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    createdAt: "2026-09-13T01:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  for (const fn of [createUpload, putFile, confirmUpload, getUpload, deleteUpload]) vi.mocked(fn).mockReset();
  vi.mocked(createUpload).mockResolvedValue({
    id: "m1",
    uploadUrl: "https://storage.test/put",
    uploadMethod: "PUT",
    uploadHeaders: { "Content-Type": "image/png" },
    expiresAt: "2026-11-14T10:15:00.000Z",
    maxBytes: 10 * 1024 * 1024,
  });
  vi.mocked(putFile).mockResolvedValue(undefined);
  vi.mocked(deleteUpload).mockResolvedValue(undefined);
  clearSession();
  vi.mocked(getRoomById).mockReset();
  vi.mocked(getRoomFeed).mockReset();
  vi.mocked(postToRoom).mockReset();
  vi.mocked(joinRoom).mockReset();
  vi.mocked(leaveRoom).mockReset();
});

function renderPage(roomId = "room-1") {
  render(
    <MemoryRouter initialEntries={[`/banter/${roomId}`]}>
      <Routes>
        <Route path="/banter/:roomId" element={<BanterRoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function emptyFeed() {
  vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [], nextCursor: null });
}

describe("BanterRoomPage", () => {
  it("shows a log-in prompt and never calls GET /banter-rooms/:id with no session", () => {
    renderPage();
    expect(screen.getByText(/log in to view this room/i)).not.toBeNull();
    expect(getRoomById).not.toHaveBeenCalled();
  });

  it("renders the real room header and feed", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    vi.mocked(getRoomFeed).mockResolvedValueOnce({ items: [post()], nextCursor: null });

    renderPage();

    expect(await screen.findByText("Chelsea vs Arsenal — Matchday Chat")).not.toBeNull();
    expect(screen.getByText(/5,230 members/)).not.toBeNull();
    expect(await screen.findByText("Big win tonight!")).not.toBeNull();
  });

  it("renders an honest 'Room not found' state on a 404", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockRejectedValueOnce(new BanterApiError("not found", { status: 404 }));

    renderPage();

    expect(await screen.findByText(/room not found/i)).not.toBeNull();
  });

  it("B-117: a non-member sees the open composer and no 'join to post' prompt anywhere", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();

    renderPage();

    expect(await screen.findByPlaceholderText(/say something/i)).not.toBeNull();
    expect(screen.queryByText(/join this room/i)).toBeNull();
    expect(screen.queryByText(/must join/i)).toBeNull();
  });

  it("posts via the real POST /banter-rooms/:id/posts when the caller has bookmarked the room, and prepends it to the feed", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: true }));
    emptyFeed();
    vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Great atmosphere"));

    renderPage();
    await screen.findByPlaceholderText(/say something/i);

    fireEvent.change(screen.getByPlaceholderText(/say something/i), { target: { value: "Great atmosphere" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", { contentText: "Great atmosphere" }),
    );
    expect(await screen.findByText("Great atmosphere")).not.toBeNull();
  });

  it("B-117: a non-member posts through POST /banter-rooms/:id/posts without joining first", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();
    vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Hello from outside the room"));

    renderPage();
    fireEvent.change(await screen.findByPlaceholderText(/say something/i), {
      target: { value: "Hello from outside the room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", {
        contentText: "Hello from outside the room",
      }),
    );
    expect(joinRoom).not.toHaveBeenCalled();
    expect(await screen.findByText("Hello from outside the room")).not.toBeNull();
    // Still a non-member: the bookmark did not flip.
    expect(screen.getByRole("button", { name: "Add to My Bants" })).not.toBeNull();
  });

  it("shows the server's own message when a post is refused (e.g. guardian consent)", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room());
    emptyFeed();
    vi.mocked(postToRoom).mockRejectedValueOnce(new BanterApiError("Guardian consent is pending", { status: 403 }));

    renderPage();
    fireEvent.change(await screen.findByPlaceholderText(/say something/i), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText("Guardian consent is pending")).not.toBeNull();
  });

  it("B-117: 'Add to My Bants' bookmarks the room via the join endpoint and reads 'In My Bants' afterwards", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false, memberCount: 5 }));
    emptyFeed();
    vi.mocked(joinRoom).mockResolvedValueOnce({ roomId: "room-1", joined: true, memberCount: 6 });

    renderPage();
    await screen.findByPlaceholderText(/say something/i);
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add to My Bants" }));

    expect(await screen.findByRole("button", { name: "In My Bants" })).not.toBeNull();
    expect(screen.getByText(/6 members/)).not.toBeNull();
    // The composer was never hidden, before or after.
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  it("B-117: a bookmarked room reads 'In My Bants'; clicking it removes the bookmark and the composer stays open", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: true, memberCount: 6 }));
    emptyFeed();
    vi.mocked(leaveRoom).mockResolvedValueOnce({ roomId: "room-1", joined: false, memberCount: 5 });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "In My Bants" }));

    expect(await screen.findByRole("button", { name: "Add to My Bants" })).not.toBeNull();
    expect(screen.getByText(/5 members/)).not.toBeNull();
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  it("shows a bookmark-worded error when the bookmark call fails", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ joined: false }));
    emptyFeed();
    vi.mocked(joinRoom).mockRejectedValueOnce(new Error("network"));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to My Bants" }));

    expect(await screen.findByText("Couldn't add this room to My Bants.")).not.toBeNull();
  });

  // ---- B-042 (founder decision 2026-11-14): Bants takes photo and video exactly like Create Post ----
  // These replace the old "keeps the photo/video attach button disabled" test, which pinned the behaviour
  // the decision reverses.

  async function openComposer(overrides: Partial<BanterRoom> = {}) {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room(overrides));
    emptyFeed();
    renderPage();
    return await screen.findByPlaceholderText(/say something/i);
  }

  function chooseFile(testId: "picture-input" | "video-input", name: string, type: string) {
    fireEvent.change(screen.getByTestId(testId), { target: { files: [new File(["12345"], name, { type })] } });
  }

  function mediaView(over: Partial<PostMediaView> = {}): PostMediaView {
    return {
      id: "m1",
      kind: "image",
      uploadState: "ready",
      status: "pending",
      rejectionReason: null,
      url: "https://cdn.test/post-media/u1/m1.png",
      contentType: "image/png",
      byteSize: 10,
      durationSeconds: null,
      postId: null,
      createdAt: "2026-11-14T10:00:00.000Z",
      ...over,
    };
  }

  const postButton = () => screen.getByRole("button", { name: "Post" }) as HTMLButtonElement;

  it("offers the same Picture and Video controls as Create Post, enabled, and no disabled 'Attach photo/video' button", async () => {
    await openComposer();
    expect((screen.getByRole("button", { name: /picture/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /video/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /attach photo\/video/i })).toBeNull();
    expect(screen.queryByTitle(/isn't available yet/i)).toBeNull();
    expect(
      screen.getByText("Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
  });

  it("uploads a picture with progress, shows 'Checking', posts with its mediaId and clears the tray", async () => {
    vi.mocked(putFile).mockImplementation(async (_link, _file, onProgress) => {
      onProgress(0.62);
    });
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Look at this"));
    const box = await openComposer();
    fireEvent.change(box, { target: { value: "Look at this" } });
    chooseFile("picture-input", "goal.png", "image/png");

    await screen.findByText("Checking");
    expect(createUpload).toHaveBeenCalledWith(expect.any(String), { contentType: "image/png", size: 5 });
    expect(confirmUpload).toHaveBeenCalledWith(expect.any(String), "m1");

    fireEvent.click(postButton());
    await waitFor(() =>
      expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", {
        contentText: "Look at this",
        mediaIds: ["m1"],
      }),
    );
    expect(await screen.findByText("Look at this")).not.toBeNull();
    // Tray emptied and the text cleared, as in Create Post.
    expect(screen.queryByText("Checking")).toBeNull();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("shows progress while uploading and keeps Post disabled until the file is stored", async () => {
    vi.mocked(putFile).mockImplementation(
      (_link, _file, onProgress) =>
        new Promise<void>(() => {
          onProgress(0.62);
        }),
    );
    const box = await openComposer();
    fireEvent.change(box, { target: { value: "wait for it" } });
    chooseFile("picture-input", "goal.png", "image/png");

    await screen.findByText("Uploading… 62%");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("62");
    expect(postButton().disabled).toBe(true);
    expect(postToRoom).not.toHaveBeenCalled();
  });

  it("still needs text: a picture alone does not enable Post", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    await openComposer();
    chooseFile("picture-input", "goal.png", "image/png");
    await screen.findByText("Checking");
    expect(postButton().disabled).toBe(true);
  });

  it("turns 'Checking' into 'Approved' when the file is approved (polling)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    vi.mocked(getUpload).mockResolvedValue(mediaView({ status: "approved" }));
    await openComposer();
    chooseFile("picture-input", "goal.png", "image/png");
    await screen.findByText("Checking");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 50);
    });
    await screen.findByText("Approved");
  });

  it("shows a rejected file with its reason, blocks Post, and Remove clears the block", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(
      mediaView({ status: "rejected", rejectionReason: "This file didn't meet our rules" }),
    );
    const box = await openComposer();
    fireEvent.change(box, { target: { value: "hello" } });
    chooseFile("picture-input", "goal.png", "image/png");

    await screen.findByText("This picture wasn’t approved");
    expect(screen.getByText("This file didn't meet our rules")).not.toBeNull();
    expect(postButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith(expect.any(String), "m1"));
    await waitFor(() => expect(postButton().disabled).toBe(false));
  });

  it("allows only one video per post, like Create Post", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(mediaView({ kind: "video", contentType: "video/mp4" }));
    await openComposer();
    chooseFile("video-input", "a.mp4", "video/mp4");
    await screen.findByText("Checking");
    chooseFile("video-input", "b.mp4", "video/mp4");
    expect(screen.getByText("You can add one video to a post.")).not.toBeNull();
    expect(createUpload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["503 uploads_unavailable (no object store)", 503, "uploads_unavailable"],
    ["403 media_uploads_disabled (the upload switch is off)", 403, "media_uploads_disabled"],
  ])(
    "%s: shows 'Uploads aren't available right now', disables the attach controls and a text post still goes out",
    async (_label, status, code) => {
      vi.mocked(createUpload).mockRejectedValueOnce(
        new PostMediaApiError("Uploads are not available right now.", { status, code }),
      );
      vi.mocked(postToRoom).mockResolvedValueOnce(createdPost("Just words"));
      const box = await openComposer();
      chooseFile("picture-input", "goal.png", "image/png");

      await screen.findByText(/Uploads aren’t available right now\./);
      expect(screen.getByText(/You can still post text/)).not.toBeNull();
      expect((screen.getByRole("button", { name: /picture/i }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: /video/i }) as HTMLButtonElement).disabled).toBe(true);
      // The generic failure card is NOT shown, and nothing was left behind in the tray.
      expect(screen.queryByText("Upload failed")).toBeNull();

      fireEvent.change(box, { target: { value: "Just words" } });
      fireEvent.click(postButton());
      await waitFor(() =>
        expect(postToRoom).toHaveBeenCalledWith(expect.any(String), "room-1", { contentText: "Just words" }),
      );
      expect(await screen.findByText("Just words")).not.toBeNull();
    },
  );

  it("403 media_uploads_disabled on the confirm step reaches the same state and cleans the issued upload up", async () => {
    vi.mocked(confirmUpload).mockRejectedValueOnce(
      new PostMediaApiError("Uploads are not available right now.", { status: 403, code: "media_uploads_disabled" }),
    );
    await openComposer();
    chooseFile("picture-input", "goal.png", "image/png");

    await screen.findByText(/Uploads aren’t available right now\./);
    expect(screen.queryByText("Upload failed")).toBeNull();
    expect((screen.getByRole("button", { name: /picture/i }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith(expect.any(String), "m1"));
  });

  it("an active room shows the active dot and no 'Inactive' pill", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ status: "active" }));
    emptyFeed();

    renderPage();

    expect(await screen.findByRole("img", { name: "Active room" })).not.toBeNull();
    expect(screen.queryByText("Inactive")).toBeNull();
  });

  it("an inactive room shows the grey dot and the 'Inactive' pill, and can still be posted in", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ status: "inactive" }));
    emptyFeed();

    renderPage();

    expect(await screen.findByRole("img", { name: "Inactive room" })).not.toBeNull();
    expect(screen.getByText("Inactive")).not.toBeNull();
    // Nothing else reads the status server-side (Figma notes, SCOPE OPEN 3).
    expect(screen.getByPlaceholderText(/say something/i)).not.toBeNull();
  });

  // B-071: this test used to seed the room's CREATOR and assert no control existed. The creator now gets
  // controls (BanterRoomCreatorControls.test.tsx), so the read-only guarantee is asserted for a viewer who is
  // NOT the creator: the same assertions, a different person.
  it("renders topic chips read-only: no add, remove or status control, for anyone but the room's creator", async () => {
    seedSession(fakeAccessToken("viewer-1"));
    vi.mocked(getRoomById).mockResolvedValueOnce(
      room({
        createdBy: "creator-1",
        topics: [
          { id: "t1", name: "Premier League" },
          { id: "t2", name: "Arsenal" },
        ],
      }),
    );
    emptyFeed();

    renderPage();

    expect(await screen.findByText("Premier League")).not.toBeNull();
    expect(screen.getByText("Arsenal")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /add topic/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /deactivate|reactivate/i })).toBeNull();
  });

  it("renders no topic list when the room has no topics", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getRoomById).mockResolvedValueOnce(room({ topics: [] }));
    emptyFeed();

    renderPage();
    await screen.findByPlaceholderText(/say something/i);

    expect(screen.queryByRole("list", { name: "Topics" })).toBeNull();
  });
});
