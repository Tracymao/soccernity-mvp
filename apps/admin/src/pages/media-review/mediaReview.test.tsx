// FC10 (B-240, Decision Log #419 item 4): the admin media review queue and item screens, against the real
// page components with the admin API module mocked at its edge.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/mediaReview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mediaReview")>();
  return {
    ...actual,
    listMediaReview: vi.fn(),
    getMediaReviewStats: vi.fn(),
    getMediaReviewItem: vi.fn(),
    approveMedia: vi.fn(),
    rejectMedia: vi.fn(),
  };
});
import {
  approveMedia,
  getMediaReviewItem,
  getMediaReviewStats,
  listMediaReview,
  rejectMedia,
  type MediaReviewItem,
} from "../../api/mediaReview";
import MediaReviewQueuePage from "./MediaReviewQueuePage";
import MediaReviewItemPage from "./MediaReviewItemPage";

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [listMediaReview, getMediaReviewStats, getMediaReviewItem, approveMedia, rejectMedia]) vi.mocked(fn).mockReset();
  vi.mocked(getMediaReviewStats).mockResolvedValue({
    windowDays: 7,
    from: "2026-10-21T00:00:00.000Z",
    to: "2026-10-28T00:00:00.000Z",
    autoApproved: 41,
    autoRejected: 3,
    sentToReview: 5,
    reported: 2,
    decidedByModerator: 4,
  });
});

function item(over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return {
    id: "media-1",
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: 1234,
    durationSeconds: null,
    status: "pending",
    awaitingDecision: true,
    sources: ["auto_check"],
    reportCount: 0,
    hiddenPendingReview: false,
    checkLabels: ["Suggestive"],
    uploader: { id: "u1", publicName: "ada_player" },
    postId: "post-12345678",
    uploadedAt: "2026-10-28T09:00:00.000Z",
    ageSeconds: 3 * 3600,
    enteredQueueAt: "2026-10-28T09:01:00.000Z",
    decidedAt: null,
    decisionSource: null,
    rejectionReason: null,
    viewUrl: "https://storage.test/signed/media-1?sig=1",
    viewUrlExpiresAt: "2026-10-28T09:06:00.000Z",
    ...over,
  };
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/moderation/media"]}>
      <MediaReviewQueuePage />
    </MemoryRouter>,
  );
}

function renderItem(initial: MediaReviewItem | undefined) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/moderation/media/media-1", state: initial ? { item: initial } : undefined }]}>
      <Routes>
        <Route path="/moderation/media/:id" element={<MediaReviewItemPage />} />
        <Route path="/moderation/media" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Media review queue", () => {
  it("lists source, uploader public name, type and age, with the statistics card and a pending count", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({
      items: [
        item(),
        item({ id: "media-2", kind: "video", sources: ["user_report"], reportCount: 2, uploader: { id: "u2", publicName: "Soccernity member" }, ageSeconds: 600 }),
      ],
      nextCursor: null,
    });
    renderQueue();
    await screen.findByText("ada_player");
    const table = within(screen.getByRole("table", { name: "Media review queue" }));
    expect(table.getByText("Automatic check")).not.toBeNull();
    expect(table.getByText("User report")).not.toBeNull();
    expect(table.getByText("Picture")).not.toBeNull();
    expect(table.getByText("Video")).not.toBeNull();
    expect(table.getByText("3 h")).not.toBeNull();
    expect(table.getByText("10 min")).not.toBeNull();
    expect(screen.getByTestId("pending-count").textContent).toBe("2 pending");
    await waitFor(() => expect(screen.getByTestId("stat-auto-approved").textContent).toBe("41"));
    expect(screen.getByTestId("stat-auto-rejected").textContent).toBe("3");
    expect(screen.getByTestId("stat-sent-to-review").textContent).toBe("5");
    expect(screen.getByTestId("stat-reported").textContent).toBe("2");
    expect(getMediaReviewStats).toHaveBeenCalledWith(7);
    expect(screen.getAllByRole("link", { name: "Review" })).toHaveLength(2);
  });

  it("shows the empty state, with the statistics card kept", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({ items: [], nextCursor: null });
    renderQueue();
    await screen.findByText("Nothing to review");
    await waitFor(() => expect(screen.getByTestId("stat-auto-approved")).not.toBeNull());
  });

  it("shows the load error with Try again, and says nothing was approved or rejected", async () => {
    vi.mocked(listMediaReview).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderQueue();
    await screen.findByText("Couldn’t load the review queue");
    expect(screen.getByText(/Nothing has been approved or rejected/)).not.toBeNull();
    vi.mocked(listMediaReview).mockResolvedValue({ items: [item()], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("ada_player");
  });

  it("pages with Load more, and re-queries with the source filter", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({ items: [item()], nextCursor: "c1" });
    renderQueue();
    await screen.findByText("ada_player");
    expect(screen.getByTestId("pending-count").textContent).toBe("1+ pending");
    vi.mocked(listMediaReview).mockResolvedValueOnce({
      items: [item({ id: "media-9", uploader: { id: "u9", publicName: "second" } })],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("second");
    expect(listMediaReview).toHaveBeenLastCalledWith({ status: "pending", source: undefined, limit: 20, cursor: "c1" });

    vi.mocked(listMediaReview).mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "user_report" } });
    await waitFor(() => expect(listMediaReview).toHaveBeenLastCalledWith({ status: "pending", source: "user_report", limit: 20 }));
  });
});

describe("Media review item", () => {
  it("shows a picture with its check labels, details and Approve / Reject", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(item());
    renderItem(item());
    expect(await screen.findByAltText("The picture under review")).not.toBeNull();
    expect(screen.getByText("Suggestive")).not.toBeNull();
    expect(screen.getByText("ada_player")).not.toBeNull();
    expect(screen.getByText("Labels come from the automatic check. They are a guide — the decision is yours.")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("plays a video inline and says it is a user report, with the report count (no reporter, no reason)", async () => {
    const reported = item({ kind: "video", sources: ["user_report"], reportCount: 2, status: "approved", checkLabels: [] });
    vi.mocked(getMediaReviewItem).mockResolvedValue(reported);
    renderItem(reported);
    await screen.findByLabelText("The video under review");
    expect(screen.getByText(/Reported by 2 people\./)).not.toBeNull();
    expect(screen.getByText(/uploader is not told/)).not.toBeNull();
  });

  it("re-reads the item on open (the signed link in a handed-over item may have expired)", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(item({ viewUrl: "https://storage.test/signed/fresh" }));
    renderItem(item({ viewUrl: "https://storage.test/signed/stale" }));
    await waitFor(() =>
      expect(screen.getByAltText("The picture under review").getAttribute("src")).toBe("https://storage.test/signed/fresh"),
    );
  });

  it("Approve calls the endpoint and then shows the item as already decided", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValueOnce(item());
    renderItem(item());
    await screen.findByAltText("The picture under review");
    vi.mocked(approveMedia).mockResolvedValue({ id: "media-1", outcome: "approved" });
    vi.mocked(getMediaReviewItem).mockResolvedValue(item({ status: "approved", awaitingDecision: false, decidedAt: "2026-10-28T10:00:00.000Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("Already decided.");
    expect(approveMedia).toHaveBeenCalledWith("media-1");
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Reject needs a reason: shows the error, sends the trimmed reason, then shows the decided state", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValueOnce(item());
    renderItem(item());
    await screen.findByAltText("The picture under review");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(
      screen.getByText("Say why this picture is being rejected. The uploader sees this reason. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    const submit = screen.getByRole("button", { name: "Reject picture" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const reason = screen.getByLabelText("Reason (required)");
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.blur(reason);
    expect(screen.getByText("Enter a reason to continue.")).not.toBeNull();
    expect(submit.disabled).toBe(true);

    fireEvent.change(reason, { target: { value: "  Not related to football.  " } });
    vi.mocked(rejectMedia).mockResolvedValue({ id: "media-1", outcome: "rejected" });
    vi.mocked(getMediaReviewItem).mockResolvedValue(
      item({ status: "rejected", awaitingDecision: false, rejectionReason: "Not related to football.", decidedAt: "2026-10-28T10:00:00.000Z" }),
    );
    fireEvent.click(submit);
    await screen.findByText("Already decided.");
    expect(rejectMedia).toHaveBeenCalledWith("media-1", "Not related to football.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Not related to football\./)).not.toBeNull();
  });

  it("when another moderator decided first (409 already_decided) the item flips to its decided state", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValueOnce(item());
    renderItem(item());
    await screen.findByAltText("The picture under review");
    vi.mocked(approveMedia).mockRejectedValue(new AdminApiError(409, "Already decided", { code: "already_decided" }));
    vi.mocked(getMediaReviewItem).mockResolvedValue(item({ status: "approved", awaitingDecision: false, decidedAt: "2026-10-28T10:00:00.000Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("Already decided.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an honest 'not found' for an item that is not in the queue", async () => {
    vi.mocked(getMediaReviewItem).mockRejectedValue(new AdminApiError(404, "Media not found"));
    renderItem(undefined);
    await screen.findByText("Item not found");
  });
});
