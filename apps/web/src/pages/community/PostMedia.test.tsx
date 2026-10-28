// FC10 (B-240, Decision Log #419): the pictures and videos of a post card -- the author's own status view
// and the Report control everyone else gets. Network edge mocked; the components are the real ones.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PostMedia from "./PostMedia";

vi.mock("../../api/postMedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/postMedia")>();
  return { ...actual, getUpload: vi.fn(), deleteUpload: vi.fn(), reportMedia: vi.fn() };
});
import { PostMediaApiError, deleteUpload, getUpload, reportMedia, type PostMediaView } from "../../api/postMedia";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getUpload).mockReset();
  vi.mocked(deleteUpload).mockReset();
  vi.mocked(reportMedia).mockReset();
});

const ID = "3f6c1a52-8d3e-4c1f-9a77-0b1c2d3e4f50";
const IMAGE = `https://cdn.test/post-media/u1/${ID}.jpg`;
const VIDEO = `https://cdn.test/post-media/u1/${ID}.mp4`;

function view(over: Partial<PostMediaView> = {}): PostMediaView {
  return {
    id: ID,
    kind: "image",
    uploadState: "ready",
    status: "pending",
    rejectionReason: null,
    url: IMAGE,
    contentType: "image/jpeg",
    byteSize: 10,
    durationSeconds: null,
    postId: "p1",
    createdAt: "2026-10-28T10:00:00.000Z",
    ...over,
  };
}

describe("PostMedia — as the author", () => {
  it("shows a picture under review with who can see it (tagged), read from the upload's own status", async () => {
    vi.mocked(getUpload).mockResolvedValue(view());
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn />);
    await screen.findByText("Under review");
    expect(getUpload).toHaveBeenCalledWith("tok", ID);
    expect(
      screen.getByText("Only you can see this post until its pictures have been checked. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    expect(screen.getByAltText("Picture attached to this post")).not.toBeNull();
  });

  it("uses video wording for a video", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ kind: "video", url: VIDEO }));
    render(<PostMedia urls={[VIDEO]} accessToken="tok" isOwn />);
    await screen.findByText(/its video has been checked/);
  });

  it("shows a rejected picture with its reason, and Remove picture deletes it and takes it off the card", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "rejected", rejectionReason: "Not related to football." }));
    vi.mocked(deleteUpload).mockResolvedValue(undefined);
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn />);
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
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn />);
    await waitFor(() => expect(getUpload).toHaveBeenCalled());
    expect(screen.queryByText("Under review")).toBeNull();
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
  });

  it("surfaces a failed removal and keeps the file", async () => {
    vi.mocked(getUpload).mockResolvedValue(view({ status: "rejected", rejectionReason: "No." }));
    vi.mocked(deleteUpload).mockRejectedValue(new PostMediaApiError("A contest entry's file can't be removed.", { status: 409 }));
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("can't be removed"))).toBe(true));
    expect(screen.getByAltText("Picture attached to this post")).not.toBeNull();
  });
});

describe("PostMedia — as another viewer", () => {
  it("renders the picture, offers Report, and the report goes to the media's id with a confirmation", async () => {
    vi.mocked(reportMedia).mockResolvedValue({ reported: true, alreadyReported: false });
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn={false} />);
    expect(getUpload).not.toHaveBeenCalled(); // only the author reads the upload status
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Reported — thanks, our team will review it.");
    expect(reportMedia).toHaveBeenCalledWith("tok", ID);
  });

  it("names a video, and Cancel closes the panel without sending anything", () => {
    render(<PostMedia urls={[VIDEO]} accessToken="tok" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this video" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(reportMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Report this video" })).not.toBeNull();
  });

  it("says so when the file is no longer available to report (404)", async () => {
    vi.mocked(reportMedia).mockRejectedValue(new PostMediaApiError("Media not found", { status: 404 }));
    render(<PostMedia urls={[IMAGE]} accessToken="tok" isOwn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this picture" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toContain("isn’t available to report");
  });

  it("offers no Report control for a URL that is not an uploaded file", () => {
    render(<PostMedia urls={["https://elsewhere.test/photo.jpg"]} accessToken="tok" isOwn={false} />);
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
    expect(screen.getByAltText("Picture attached to this post")).not.toBeNull();
  });
});
