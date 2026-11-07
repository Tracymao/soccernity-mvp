// B-061 (Decision Log #472 default (d)): the blurred media state on post cards, built in the shared PostCard so
// every surface that uses it inherits it. Figma "Post Card — Sensitive Media" G1 to G10. Network edge mocked;
// PostCard and PostMedia are the real components.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostCard from "./PostCard";
import type { FeedPost } from "../../api/feed";

vi.mock("../../api/postMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/postMedia")>();
  return { ...actual, getUpload: vi.fn(), deleteUpload: vi.fn(), reportMedia: vi.fn() };
});
import { getUpload, type PostMediaView } from "../../api/postMedia";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUpload).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

const IMAGE = "https://cdn.test/post-media/photo.jpg";
const VIDEO = "https://cdn.test/post-media/clip.mp4";

function post(over: Partial<FeedPost> = {}): FeedPost {
  return {
    id: "post-1",
    authorId: "user-2",
    author: { id: "user-2", publicName: "Adeniyi Christiana", isFollowing: false },
    contentText: "Photos from Saturday’s match at Rowe Park.",
    mediaUrls: [IMAGE],
    media: [{ id: "m1", kind: "image" }],
    mediaSensitive: true,
    clubPageId: null,
    banterRoomId: null,
    likeCount: 12,
    commentCount: 3,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    isLiked: false,
    isSaved: false,
    ...over,
  };
}

function videoPost(over: Partial<FeedPost> = {}): FeedPost {
  return post({ mediaUrls: [VIDEO], media: [{ id: "m2", kind: "video" }], ...over });
}

function renderCard(p: FeedPost, currentUserId = "user-1") {
  return render(
    <MemoryRouter>
      <PostCard post={p} accessToken="tok" currentUserId={currentUserId} />
    </MemoryRouter>,
  );
}

const cover = () => screen.queryByRole("button", { name: /Sensitive (picture|video) hidden\. Tap to view\./ });

/** The picture or video has loaded (jsdom never loads media by itself). */
function loaded(container: HTMLElement) {
  const el = container.querySelector("img.post__media-img, video.post__media-video");
  if (!el) throw new Error("no media element");
  if (el.tagName === "VIDEO") fireEvent.loadedData(el);
  else fireEvent.load(el);
  return el;
}

describe("PostCard — sensitive media (blurred)", () => {
  it("shows Loading while the picture loads, then the blur with the cover (G4 then G1)", () => {
    const { container } = renderCard(post());
    expect(screen.getByText("Loading…")).not.toBeNull();
    expect(cover()).toBeNull();
    loaded(container);
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(cover()).not.toBeNull();
    expect(screen.getByText("Sensitive content")).not.toBeNull();
    expect(screen.getByText("Tap to view")).not.toBeNull();
    expect(container.querySelector(".sensitive")?.getAttribute("data-sensitive-state")).toBe("blurred");
  });

  it("blurs the picture and hides it from assistive technology and the keyboard while blurred", () => {
    const { container } = renderCard(post());
    loaded(container);
    const media = container.querySelector(".sensitive__media") as HTMLElement;
    expect(media.classList.contains("sensitive__media--blurred")).toBe(true);
    expect(media.getAttribute("aria-hidden")).toBe("true");
    expect(media.hasAttribute("inert")).toBe(true);
    // Not reachable by name either: the blurred picture is not exposed.
    expect(screen.queryByRole("img", { name: "Picture attached to this post" })).toBeNull();
  });

  it("tapping the cover reveals the picture and shows the Hide chip (G3)", () => {
    const { container } = renderCard(post());
    loaded(container);
    fireEvent.click(cover()!);
    expect(cover()).toBeNull();
    const media = container.querySelector(".sensitive__media") as HTMLElement;
    expect(media.classList.contains("sensitive__media--blurred")).toBe(false);
    expect(media.hasAttribute("inert")).toBe(false);
    expect(media.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByRole("img", { name: "Picture attached to this post" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hide" })).not.toBeNull();
    expect(container.querySelector(".sensitive")?.getAttribute("data-sensitive-state")).toBe("revealed");
  });

  it("Hide blurs it again", () => {
    const { container } = renderCard(post());
    loaded(container);
    fireEvent.click(cover()!);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
    expect(cover()).not.toBeNull();
    expect((container.querySelector(".sensitive__media") as HTMLElement).classList.contains("sensitive__media--blurred")).toBe(true);
  });

  it("the cover and the Hide chip are real buttons: keyboard operable, and focus follows the press", () => {
    const { container } = renderCard(post());
    loaded(container);
    const button = cover()!;
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("tabindex")).toBeNull();
    // The cover is outside the inert media, so it is focusable.
    button.focus();
    expect(document.activeElement).toBe(button);
    // Enter and Space on a native button fire a click; focus then moves to the Hide chip, and back on Hide.
    fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(document.activeElement).toBe(cover());
  });

  it("an accessible name says the media is hidden, and names a video as a video", () => {
    const { container } = renderCard(videoPost());
    loaded(container);
    expect(screen.getByRole("button", { name: "Sensitive video hidden. Tap to view." })).not.toBeNull();
  });

  it("a blurred video keeps its length chip (G2) and is not playable until revealed", () => {
    const { container } = renderCard(videoPost());
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 32, configurable: true });
    fireEvent.loadedMetadata(video);
    fireEvent.loadedData(video);
    expect(screen.getByText("0:32")).not.toBeNull();
    expect((container.querySelector(".sensitive__media") as HTMLElement).hasAttribute("inert")).toBe(true);
    fireEvent.click(cover()!);
    expect(screen.queryByText("0:32")).toBeNull();
    expect(screen.getByLabelText("Video attached to this post")).not.toBeNull();
  });

  it("formats a longer video length as minutes and seconds", () => {
    const { container } = renderCard(videoPost());
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 125, configurable: true });
    fireEvent.loadedMetadata(video);
    fireEvent.loadedData(video);
    expect(screen.getByText("2:05")).not.toBeNull();
  });

  it("shows the failed state when the picture cannot load, and Tap to try again starts a fresh load (G5, G4)", () => {
    const { container } = renderCard(post());
    fireEvent.error(container.querySelector("img.post__media-img")!);
    expect(screen.getByText("Couldn’t load this picture")).not.toBeNull();
    expect(cover()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Couldn’t load this picture/ }));
    expect(screen.getByText("Loading…")).not.toBeNull();
    loaded(container);
    expect(cover()).not.toBeNull();
  });

  it("names a failed video as a video", () => {
    const { container } = renderCard(videoPost());
    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByText("Couldn’t load this video")).not.toBeNull();
  });

  it("the revealed state lasts for the page view only: nothing is stored, a new card starts blurred", () => {
    const first = renderCard(post());
    loaded(first.container);
    fireEvent.click(cover()!);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    first.unmount();
    const second = renderCard(post());
    loaded(second.container);
    expect(cover()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
  });

  it("each card is revealed on its own", () => {
    const { container } = render(
      <MemoryRouter>
        <PostCard post={post({ id: "a" })} accessToken="tok" currentUserId="user-1" />
        <PostCard post={post({ id: "b", media: [{ id: "m9", kind: "image" }] })} accessToken="tok" currentUserId="user-1" />
      </MemoryRouter>,
    );
    const imgs = Array.from(container.querySelectorAll("img.post__media-img"));
    imgs.forEach((img) => fireEvent.load(img));
    expect(screen.getAllByRole("button", { name: "Sensitive picture hidden. Tap to view." })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Sensitive picture hidden. Tap to view." })[0]);
    expect(screen.getAllByRole("button", { name: "Hide" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sensitive picture hidden. Tap to view." })).toHaveLength(1);
  });
});

describe("PostCard — media that is not sensitive", () => {
  it("is not blurred when mediaSensitive is false", () => {
    const { container } = renderCard(post({ mediaSensitive: false }));
    expect(container.querySelector(".sensitive")).toBeNull();
    expect(cover()).toBeNull();
    expect(screen.getByRole("img", { name: "Picture attached to this post" })).not.toBeNull();
    expect(screen.queryByText("Sensitive content")).toBeNull();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("is not blurred when the field is missing (older payloads)", () => {
    const { container } = renderCard(post({ mediaSensitive: undefined }));
    expect(container.querySelector(".sensitive")).toBeNull();
    expect(screen.getByRole("img", { name: "Picture attached to this post" })).not.toBeNull();
  });

  it("a post with no media has nothing to blur even when the flag is true", () => {
    const { container } = renderCard(post({ media: [], mediaUrls: [] }));
    expect(container.querySelector(".sensitive")).toBeNull();
    expect(cover()).toBeNull();
  });
});

describe("PostCard — the author sees the same blur on their own post", () => {
  function view(over: Partial<PostMediaView> = {}): PostMediaView {
    return {
      id: "m1",
      kind: "image",
      uploadState: "ready",
      status: "approved",
      rejectionReason: null,
      url: IMAGE,
      viewUrl: null,
      contentType: "image/jpeg",
      byteSize: 10,
      durationSeconds: null,
      postId: "post-1",
      createdAt: "2026-10-28T10:00:00.000Z",
      ...over,
    } as PostMediaView;
  }

  it("blurs an approved picture for its author and lets them reveal it", async () => {
    vi.mocked(getUpload).mockResolvedValue(view());
    const { container } = renderCard(post({ authorId: "user-1" }), "user-1");
    // The author's own status read settles first.
    await screen.findByText("Loading…");
    loaded(container);
    expect(cover()).not.toBeNull();
    fireEvent.click(cover()!);
    expect(screen.getByRole("button", { name: "Hide" })).not.toBeNull();
  });

  it("keeps the author's pending file blurred as well (drawn only through the signed link)", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "pending", viewUrl: "https://private.test/signed/photo.jpg?sig=1" }));
    const { container } = renderCard(post({ authorId: "user-1", media: [{ id: "m1", kind: "image", viewUrl: "https://private.test/signed/photo.jpg?sig=1" }] }), "user-1");
    await screen.findByText("Under review");
    const img = container.querySelector("img.post__media-img") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("private.test/signed");
    fireEvent.load(img);
    expect(cover()).not.toBeNull();
  });
});
