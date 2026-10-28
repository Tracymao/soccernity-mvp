// FC10 (B-240, Decision Log #419): the composer's attach controls and every upload state Figma pass Q draws.
// The API module is mocked at its network edge (createUpload / putFile / confirmUpload / getUpload /
// deleteUpload); the hook, tray and composer are the real ones.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PostComposer from "./PostComposer";
import { POLL_INTERVAL_MS } from "./useMediaUploads";

vi.mock("../../api/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/feed")>();
  return { ...actual, createPost: vi.fn() };
});
vi.mock("../../api/postMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/postMedia")>();
  return { ...actual, createUpload: vi.fn(), putFile: vi.fn(), confirmUpload: vi.fn(), getUpload: vi.fn(), deleteUpload: vi.fn() };
});
import { createPost } from "../../api/feed";
import {
  PostMediaApiError,
  confirmUpload,
  createUpload,
  deleteUpload,
  getUpload,
  putFile,
  type PostMediaView,
} from "../../api/postMedia";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  for (const fn of [createPost, createUpload, putFile, confirmUpload, getUpload, deleteUpload]) vi.mocked(fn).mockReset();
  vi.mocked(createUpload).mockResolvedValue({
    id: "m1",
    uploadUrl: "https://storage.test/put",
    uploadMethod: "PUT",
    uploadHeaders: { "Content-Type": "image/png" },
    expiresAt: "2026-10-28T10:15:00.000Z",
    maxBytes: 10 * 1024 * 1024,
  });
  vi.mocked(putFile).mockResolvedValue(undefined);
  vi.mocked(deleteUpload).mockResolvedValue(undefined);
  vi.mocked(createPost).mockResolvedValue({
    id: "p1",
    authorId: "u1",
    author: { id: "u1", publicName: "Ada" },
    contentText: "x",
    mediaUrls: [],
    clubPageId: null,
    banterRoomId: null,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    createdAt: "2026-10-28T10:00:00.000Z",
  });
});

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
    createdAt: "2026-10-28T10:00:00.000Z",
    ...over,
  };
}

function renderComposer(onCreated = vi.fn()) {
  render(
    <MemoryRouter>
      <PostComposer accessToken="tok" authorName="Ada Player" contest={null} onCreated={onCreated} />
    </MemoryRouter>,
  );
  return onCreated;
}

function choosePicture(name = "goal.png", type = "image/png") {
  const file = new File(["12345"], name, { type });
  fireEvent.change(screen.getByTestId("picture-input"), { target: { files: [file] } });
}

function write(text = "What a goal") {
  fireEvent.change(screen.getByLabelText("What's happening?"), { target: { value: text } });
}

describe("composer — attach controls", () => {
  it("offers a picture and a video control, enabled, and the tagged 'checked' line", () => {
    renderComposer();
    expect((screen.getByRole("button", { name: /picture/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /video/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      screen.getByText("Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    // The poll affordance is gone and so is the old "arrive with a later media release" note.
    expect(screen.queryByText(/later media release/i)).toBeNull();
  });

  it("uploads a picture with progress, shows it as 'Checking', and publishes the post with its mediaId", async () => {
    vi.mocked(putFile).mockImplementation(async (_link, _file, onProgress) => {
      onProgress(0.62);
    });
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    const onCreated = renderComposer();
    write();
    choosePicture();

    await screen.findByText("Checking");
    expect(createUpload).toHaveBeenCalledWith("tok", { contentType: "image/png", size: 5 });
    expect(confirmUpload).toHaveBeenCalledWith("tok", "m1");
    expect(
      screen.getByText("Checking… only you can see this until it has been checked. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(createPost).toHaveBeenCalledWith("tok", { contentText: "What a goal", mediaIds: ["m1"] }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // The tray is empty again after publishing.
    expect(screen.queryByText("Checking")).toBeNull();
  });

  it("shows progress while uploading and Cancel aborts it and removes the file", async () => {
    let release: () => void = () => undefined;
    let seenSignal: AbortSignal | undefined;
    vi.mocked(putFile).mockImplementation(
      (_link, _file, onProgress, signal) =>
        new Promise<void>((resolve, reject) => {
          seenSignal = signal;
          onProgress(0.62);
          release = resolve;
          signal?.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
        }),
    );
    renderComposer();
    choosePicture();

    await screen.findByText("Uploading… 62%");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByText("Keep this window open until it finishes.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(seenSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText("Uploading… 62%")).toBeNull());
    expect(screen.queryByText("goal.png")).toBeNull();
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith("tok", "m1"));
    release();
  });

  it("keeps Post disabled while a file is still uploading", async () => {
    vi.mocked(putFile).mockImplementation(() => new Promise<void>(() => undefined));
    renderComposer();
    write();
    choosePicture();
    await screen.findByText(/Uploading/);
    expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("turns 'Checking' into 'Approved' when the file is approved (polling)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    vi.mocked(getUpload).mockResolvedValue(mediaView({ status: "approved" }));
    renderComposer();
    choosePicture();
    await screen.findByText("Checking");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 50);
    });
    await screen.findByText("Approved");
    expect(screen.getByText("Your pictures can be seen with your post. [COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    expect(getUpload).toHaveBeenCalledWith("tok", "m1");
  });

  it("shows a rejected file with its reason, blocks Post, and Remove clears the block", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(mediaView({ status: "rejected", rejectionReason: "This file didn't meet our rules" }));
    renderComposer();
    write();
    choosePicture();

    await screen.findByText("This picture wasn’t approved");
    expect(screen.getByText("This file didn't meet our rules")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith("tok", "m1"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows 'Upload failed' with Try again, and Try again restarts the upload", async () => {
    vi.mocked(putFile).mockRejectedValueOnce(new PostMediaApiError("Check your connection and try again."));
    vi.mocked(confirmUpload).mockResolvedValue(mediaView());
    renderComposer();
    choosePicture();

    await screen.findByText("Check your connection and try again.");
    expect(screen.getAllByText("Upload failed").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Checking");
    expect(createUpload).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["file_too_large", "That file is too large", "That file is too large. Pictures can be up to 10 MB."],
    ["unsupported_file", "That file type isn’t supported", "Please choose a JPEG, PNG or WebP picture, or an MP4, WebM or MOV video."],
    ["video_too_long", "That video is too long", "Videos can be up to 120 seconds long."],
  ])("shows the %s state with the server's wording and 'Choose another file'", async (code, heading, message) => {
    vi.mocked(createUpload).mockRejectedValueOnce(new PostMediaApiError(message, { status: 400, code }));
    renderComposer();
    choosePicture();
    await screen.findByText(heading);
    expect(screen.getByText(message)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Choose another file" })).not.toBeNull();
  });

  it("shows 'Uploads aren't available right now' on a 503, disables the attach controls, and text posts still work", async () => {
    vi.mocked(createUpload).mockRejectedValueOnce(
      new PostMediaApiError("Uploads aren't available right now. Please try again later.", { status: 503, code: "uploads_unavailable" }),
    );
    const onCreated = renderComposer();
    choosePicture();

    await screen.findByText(/Uploads aren’t available right now\./);
    expect(screen.getByText(/You can still post text/)).not.toBeNull();
    expect((screen.getByRole("button", { name: /picture/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /video/i }) as HTMLButtonElement).disabled).toBe(true);

    write("Just words");
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(createPost).toHaveBeenCalledWith("tok", { contentText: "Just words" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("allows only one video per post", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(mediaView({ kind: "video", contentType: "video/mp4" }));
    renderComposer();
    const video = (name: string) =>
      fireEvent.change(screen.getByTestId("video-input"), { target: { files: [new File(["v"], name, { type: "video/mp4" })] } });
    video("a.mp4");
    await screen.findByText("Checking");
    video("b.mp4");
    expect(screen.getByText("You can add one video to a post.")).not.toBeNull();
    expect(createUpload).toHaveBeenCalledTimes(1);
  });

  it("never sends a media URL: the post body has mediaIds or nothing", async () => {
    renderComposer();
    write("No media");
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(createPost).toHaveBeenCalled());
    const body = vi.mocked(createPost).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["contentText"]);
    expect("mediaUrls" in body).toBe(false);
  });
});
