// FC10 (B-240, Decision Log #419; follow-ups B-260): the pictures and videos of a post card -- the author's own
// status view and the Report control everyone else gets. Network edge mocked; the components are the real ones.
// Ids and kinds come from the post payload's `media`, never from the URL.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PostMedia from "./PostMedia";
import { createReport } from "../../api/moderation";
import type { FeedPostMedia } from "../../api/feed";

vi.mock("../../api/postMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/postMedia")>();
  return { ...actual, getUpload: vi.fn(), deleteUpload: vi.fn(), reportMedia: vi.fn() };
});
vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, createReport: vi.fn() };
});
import { PostMediaApiError, deleteUpload, getUpload, reportMedia, type PostMediaView } from "../../api/postMedia";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUpload).mockReset();
  vi.mocked(deleteUpload).mockReset();
  vi.mocked(reportMedia).mockReset();
  vi.mocked(createReport).mockReset();
});

// Deliberately NOT shaped like the stored-file layout: the id must come from `media`, not from the URL.
const ID = "media-id-1";
const IMAGE = "https://cdn.test/anything/photo.jpg";
const VIDEO = "https://cdn.test/anything/clip.mp4";
const SIGNED = "https://private.test/signed/photo.jpg?sig=abc";
const SIGNED_REFRESHED = "https://private.test/signed/photo.jpg?sig=def";

const IMAGE_MEDIA: FeedPostMedia[] = [{ id: ID, kind: "image" }];
const VIDEO_MEDIA: FeedPostMedia[] = [{ id: ID, kind: "video" }];

function view(over: Partial<PostMediaView> = {}): PostMediaView {
  return {
    id: ID,
    kind: "image",
    uploadState: "ready",
    status: "pending",
    rejectionReason: null,
    url: IMAGE,
    viewUrl: SIGNED,
    contentType: "image/jpeg",
    byteSize: 10,
    durationSeconds: null,
    postId: "p1",
    createdAt: "2026-10-28T10:00:00.000Z",
    ...over,
  };
}

describe("PostMedia — as the author", () => {
  it("shows a picture under review with who can see it (tagged), read from the media id in the payload", async () => {
    vi.mocked(getUpload).mockResolvedValue(view());
    render(<PostMedia media={[{ id: ID, kind: "image", viewUrl: SIGNED }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await screen.findByText("Under review");
    expect(getUpload).toHaveBeenCalledWith("tok", ID);
    expect(
      screen.getByText("Only you can see this post until its pictures have been checked. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    expect(screen.getByAltText("Picture attached to this post")).not.toBeNull();
  });

  it("draws a file that is not approved ONLY through the signed link, never the public address", async () => {
    vi.mocked(getUpload).mockResolvedValue(view());
    render(<PostMedia media={[{ id: ID, kind: "image", viewUrl: SIGNED }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    // Before the status read arrives: the payload's signed link, not the public address.
    expect(screen.getByAltText("Picture attached to this post").getAttribute("src")).toBe(SIGNED);
    await screen.findByText("Under review");
    expect(screen.getByAltText("Picture attached to this post").getAttribute("src")).toBe(SIGNED);
    expect(document.querySelector(`[src="${IMAGE}"]`)).toBeNull();
  });

  it("draws nothing for a not-approved file when no signed link is available (never falls back to the public address)", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ viewUrl: null }));
    render(<PostMedia media={[{ id: ID, kind: "image" }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await screen.findByText("Under review");
    expect(screen.queryByAltText("Picture attached to this post")).toBeNull();
    expect(document.querySelector(`[src="${IMAGE}"]`)).toBeNull();
  });

  it("asks for a fresh signed link when the browser cannot load the old one", async () => {
    vi.mocked(getUpload)
      .mockResolvedValueOnce(view())
      .mockResolvedValue(view({ viewUrl: SIGNED_REFRESHED }));
    render(<PostMedia media={[{ id: ID, kind: "image", viewUrl: SIGNED }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await screen.findByText("Under review");
    fireEvent.error(screen.getByAltText("Picture attached to this post"));
    await waitFor(() =>
      expect(screen.getByAltText("Picture attached to this post").getAttribute("src")).toBe(SIGNED_REFRESHED),
    );
    expect(getUpload).toHaveBeenCalledTimes(2);
  });

  it("draws an approved file through its public address", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "approved", viewUrl: undefined }));
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await waitFor(() => expect(getUpload).toHaveBeenCalled());
    expect(screen.getByAltText("Picture attached to this post").getAttribute("src")).toBe(IMAGE);
  });

  it("uses video wording and a video player for a video (kind comes from the payload, not the file name)", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ kind: "video", url: VIDEO, viewUrl: "https://private.test/signed/blob" }));
    const { container } = render(
      <PostMedia media={[{ id: ID, kind: "video", viewUrl: "https://private.test/signed/blob" }]} urls={[VIDEO]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />,
    );
    await screen.findByText(/its video has been checked/);
    expect(container.querySelector("video")?.getAttribute("src")).toBe("https://private.test/signed/blob");
  });

  it("shows a rejected picture with its reason, and Remove picture deletes it and takes it off the card", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "rejected", rejectionReason: "Not related to football." }));
    vi.mocked(deleteUpload).mockResolvedValue(undefined);
    render(<PostMedia media={[{ id: ID, kind: "image", viewUrl: SIGNED }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await screen.findByText("This picture wasn’t approved");
    expect(screen.getByText("Not related to football.")).not.toBeNull();
    expect(
      screen.getByText(
        "Your post stays hidden from other people until every picture has been approved. Remove this picture or choose another. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith("tok", ID));
    await waitFor(() => expect(screen.queryByAltText("Picture attached to this post")).toBeNull());
  });

  it("shows nothing extra for an approved file, and no Report control on your own post", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "approved" }));
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    await waitFor(() => expect(getUpload).toHaveBeenCalled());
    expect(screen.queryByText("Under review")).toBeNull();
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
  });

  it("surfaces a failed removal and keeps the file", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "rejected", rejectionReason: "No." }));
    vi.mocked(deleteUpload).mockRejectedValue(new PostMediaApiError("A contest entry's file can't be removed.", { status: 409 }));
    render(<PostMedia media={[{ id: ID, kind: "image", viewUrl: SIGNED }]} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("can't be removed"))).toBe(true));
    expect(screen.getByAltText("Picture attached to this post")).not.toBeNull();
  });
});

describe("PostMedia — as another viewer", () => {
  it("renders the picture, offers Report, and the report goes to the media's id with a confirmation", async () => {
    vi.mocked(reportMedia).mockResolvedValue({ reported: true, alreadyReported: false });
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    expect(getUpload).not.toHaveBeenCalled(); // only the author reads the upload status
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Reported — thanks, our team will review it.");
    // No reason typed: the third argument is the empty string, which the client sends as no body.
    expect(reportMedia).toHaveBeenCalledWith("tok", ID, "");
  });

  it("sends the optional reason, and shows a counter that stops at 500 characters", async () => {
    vi.mocked(reportMedia).mockResolvedValue({ reported: true, alreadyReported: false });
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    expect(screen.getByText("0 / 500")).not.toBeNull();
    expect(
      screen.getByText("Only our moderators see your reason, not the person who posted this. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    const box = screen.getByLabelText(/Why are you reporting it/) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(500);
    fireEvent.change(box, { target: { value: "This is not football" } });
    expect(screen.getByText("20 / 500")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Reported — thanks, our team will review it.");
    expect(reportMedia).toHaveBeenCalledWith("tok", ID, "This is not football");
  });

  it("shows a clear daily-limit state (not a generic error) and no way to send again when the API refuses with media_report_daily_limit", async () => {
    vi.mocked(reportMedia).mockRejectedValue(
      new PostMediaApiError("You've sent a lot of reports today. Please try again tomorrow.", {
        status: 429,
        code: "media_report_daily_limit",
      }),
    );
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("You’ve reached today’s report limit");
    expect(screen.getByText("You've sent a lot of reports today. Please try again tomorrow.")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit report" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Report this picture" })).not.toBeNull();
  });

  async function reachLimit() {
    vi.mocked(reportMedia).mockRejectedValue(
      new PostMediaApiError("You've sent a lot of reports today. Please try again tomorrow.", {
        status: 429,
        code: "media_report_daily_limit",
      }),
    );
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("You’ve reached today’s report limit");
  }

  it("at the daily limit: shows the urgent line and the Report the post or person button, no number, and focuses the button", async () => {
    await reachLimit();
    expect(screen.getByText("If this is urgent or involves a child, report the post or the person instead.")).not.toBeNull();
    const urgent = screen.getByRole("button", { name: "Report the post or person" });
    expect(document.activeElement).toBe(urgent);
    // Close comes first, the new button after it (the Figma order), and neither the sheet nor its message carries a number.
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Close")).toBeLessThan(names.indexOf("Report the post or person"));
    const sheet = screen.getByRole("status", { name: "Report limit reached" });
    expect(sheet.textContent ?? "").not.toMatch(/\d/);
    // The "[COPY PENDING LEGAL REVIEW]" tag is not on the new line (it makes no promise).
    expect(sheet.textContent ?? "").not.toContain("COPY PENDING");
  });

  it("at the daily limit: the button opens the existing general report flow for the post and its author, with no second /media report", async () => {
    vi.mocked(createReport).mockResolvedValue({} as never);
    await reachLimit();
    expect(reportMedia).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Report the post or person" }));
    // The general flow's own choice of target: the post, or the person who posted it.
    const postChoice = screen.getByRole("button", { name: "Report post" });
    expect(screen.getByRole("button", { name: "Report user" })).not.toBeNull();
    expect(document.activeElement).toBe(postChoice);
    fireEvent.click(screen.getByRole("button", { name: "Report user" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Something involving a child" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Reported — thanks, our team will review it.");
    expect(createReport).toHaveBeenCalledTimes(1);
    expect(createReport).toHaveBeenCalledWith("tok", {
      targetType: "user",
      targetId: "author-9",
      reason: "Something involving a child",
    });
    // Nothing went to POST /media/:id/report a second time.
    expect(reportMedia).toHaveBeenCalledTimes(1);
  });

  it("at the daily limit: reporting the post sends the post id, and Cancel returns to the limit sheet", async () => {
    vi.mocked(createReport).mockResolvedValue({} as never);
    await reachLimit();
    fireEvent.click(screen.getByRole("button", { name: "Report the post or person" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Back on the limit sheet (no stray "Report" trigger), with the new button focused again.
    await screen.findByText("You’ve reached today’s report limit");
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Report the post or person" }));
    expect(createReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Report the post or person" }));
    fireEvent.click(screen.getByRole("button", { name: "Report post" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(createReport).toHaveBeenCalledWith("tok", { targetType: "post", targetId: "post-9", reason: "Spam" }));
    expect(reportMedia).toHaveBeenCalledTimes(1);
  });

  it("the ordinary report form does not show the urgent line", () => {
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    expect(screen.queryByText(/report the post or the person instead/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Report the post or person" })).toBeNull();
  });

  it("names a video, and Cancel closes the panel without sending anything", () => {
    render(<PostMedia media={VIDEO_MEDIA} urls={[VIDEO]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this video" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(reportMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Report this video" })).not.toBeNull();
  });

  it("says so when the file is no longer available to report (404)", async () => {
    vi.mocked(reportMedia).mockRejectedValue(new PostMediaApiError("Media not found", { status: 404 }));
    render(<PostMedia media={IMAGE_MEDIA} urls={[IMAGE]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toContain("isn’t available to report");
  });

  it("renders nothing for a post with no media", () => {
    const { container } = render(<PostMedia media={[]} urls={[]} accessToken="tok" postId="post-9" authorId="author-9" isOwn={false} />);
    expect(container.firstChild).toBeNull();
  });
});
