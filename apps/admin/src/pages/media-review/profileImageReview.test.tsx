// B-037 (Decision Log #468): profile pictures and cover photos in the admin media review queue. Every state of
// the Figma frames 6972:46142 (queue), 6972:46346 / 6972:46516 (items), 6972:46686 (already decided) and
// 6972:46863 / 6972:47057 / 6972:47248 (reject dialogs), against the real page components with the admin API
// module mocked at its edge.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
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
    autoApproved: 412,
    autoRejected: 18,
    sentToReview: 27,
    reported: 9,
    decidedByModerator: 4,
  });
});

const AVATAR_ID = "avatar:6f1c2b8e-0d5a-4b8a-9f43-1c2d3e4f5a6b:77aa11.jpg";
const COVER_ID = "cover:6f1c2b8e-0d5a-4b8a-9f43-1c2d3e4f5a6b:88bb22.jpg";

function avatar(over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return {
    id: AVATAR_ID,
    type: "profile_avatar",
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: null,
    durationSeconds: null,
    status: "pending",
    awaitingDecision: true,
    sources: ["auto_check"],
    reportCount: 0,
    hiddenPendingReview: false,
    checkLabels: [],
    uploader: { id: "u1", publicName: "christine001" },
    postId: null,
    uploadedAt: "2026-11-05T09:00:00.000Z",
    ageSeconds: 38 * 60,
    enteredQueueAt: null,
    decidedAt: null,
    decisionSource: null,
    rejectionReason: null,
    viewUrl: "https://storage.test/signed/avatar?sig=1",
    viewUrlExpiresAt: "2026-11-05T09:05:00.000Z",
    ...over,
  };
}
function cover(over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return avatar({
    id: COVER_ID,
    type: "profile_cover",
    uploader: { id: "u2", publicName: "nelson_iheagwam" },
    ageSeconds: 2 * 3600,
    viewUrl: "https://storage.test/signed/cover?sig=1",
    ...over,
  });
}
function postMedia(over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return avatar({
    id: "0b9a6e1c-1111-4222-8333-444455556666",
    type: "post_media",
    sources: ["user_report"],
    reportCount: 2,
    postId: "post-1234567",
    ...over,
  });
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/moderation/media"]}>
      <MediaReviewQueuePage />
    </MemoryRouter>,
  );
}

function renderItem(initial: MediaReviewItem | undefined, id = AVATAR_ID) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/moderation/media/${encodeURIComponent(id)}`, state: initial ? { item: initial } : undefined }]}
    >
      <Routes>
        <Route path="/moderation/media/:id" element={<MediaReviewItemPage />} />
        <Route path="/moderation/media" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Queue - mixed (6972:46142)", () => {
  it("lists profile pictures and cover photos beside post media, with the unknown age shown as a dash", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({
      items: [
        postMedia({ kind: "video", uploader: { id: "u9", publicName: "Soccernity member" }, ageSeconds: 12 * 60 }),
        avatar(),
        cover(),
        postMedia({ id: "0b9a6e1c-2222-4222-8333-444455556666", uploader: { id: "u8", publicName: "amaka_fc" }, ageSeconds: 5 * 3600 }),
        avatar({ id: "avatar:u7:old.jpg", uploader: { id: "u7", publicName: "Soccernity member" }, uploadedAt: null, ageSeconds: null }),
      ],
      nextCursor: "c1",
    });
    renderQueue();
    await screen.findByText("christine001");
    const table = within(screen.getByRole("table", { name: "Media review queue" }));
    expect(table.getAllByText("Profile picture")).toHaveLength(2);
    expect(table.getByText("Cover photo")).not.toBeNull();
    expect(table.getByText("Video")).not.toBeNull();
    expect(table.getByText("Picture")).not.toBeNull();
    expect(table.getAllByText("Automatic check")).toHaveLength(3);
    expect(table.getAllByText("User report")).toHaveLength(2);
    expect(table.getByText("38 min")).not.toBeNull();
    expect(table.getByText("2 h")).not.toBeNull();
    // The picture whose upload time is unknown has an age cell of a dash.
    const rows = table.getAllByRole("row");
    expect(within(rows[5]).getByText("Profile picture")).not.toBeNull();
    expect(within(rows[5]).getByText("—")).not.toBeNull();
    // The pending pill counts every kind in the one list.
    expect(screen.getByTestId("pending-count").textContent).toBe("5+ pending");
    expect(screen.getAllByRole("link", { name: "Review" })).toHaveLength(5);
  });

  it("links a profile picture to its review screen with the id encoded", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({ items: [avatar()], nextCursor: null });
    renderQueue();
    const link = (await screen.findByRole("link", { name: "Review" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`/moderation/media/${encodeURIComponent(AVATAR_ID)}`);
    expect(link.getAttribute("href")).toContain("%3A");
  });

  it("shows exactly what the server returns: nothing is filtered on the client and there is no vetting wording", async () => {
    vi.mocked(listMediaReview).mockResolvedValue({ items: [], nextCursor: null });
    renderQueue();
    await screen.findByText("Nothing to review");
    // The request carries only the view the moderator chose; nothing about vetting or minors.
    expect(listMediaReview).toHaveBeenCalledWith({ status: "pending", source: undefined, limit: 20 });
    expect(document.body.textContent ?? "").not.toMatch(/vetted|vetting|minor|restricted/i);
  });
});

describe("Item - profile picture (6972:46346)", () => {
  it("shows the tag, a square preview, the details with Used in = Profile, and the callout instead of check labels", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    const img = (await screen.findByAltText("The profile picture under review")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://storage.test/signed/avatar?sig=1");
    expect(screen.getByTestId("media-viewer").className).toContain("media-profile-viewer--avatar");
    const details = within(screen.getByRole("region", { name: "Details" }));
    expect(details.getByText("christine001")).not.toBeNull();
    expect(details.getByText("Automatic check")).not.toBeNull();
    expect(details.getByText("Profile picture")).not.toBeNull();
    expect(details.getByText("38 min")).not.toBeNull();
    expect(details.getByText("Used in")).not.toBeNull();
    expect(details.getByText("Profile")).not.toBeNull();
    expect(
      screen.getByText("The automatic check was unsure about this picture, or could not run. Look at the picture and decide."),
    ).not.toBeNull();
    // No percentage rows, no check heading, no labels note, no post link.
    expect(screen.queryByText(/Labels come from the automatic check/)).toBeNull();
    expect(screen.queryByText(/Suggestive|Violence|Nudity/)).toBeNull();
    expect(screen.queryByText("Not attached to a post")).toBeNull();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is titled for the file and reads the item again on open (the link may have expired), with the id decoded", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar({ viewUrl: "https://storage.test/signed/fresh" }));
    renderItem(avatar({ viewUrl: "https://storage.test/signed/stale" }));
    await waitFor(() =>
      expect(screen.getByAltText("The profile picture under review").getAttribute("src")).toBe("https://storage.test/signed/fresh"),
    );
    expect(getMediaReviewItem).toHaveBeenCalledWith(AVATAR_ID);
  });

  it("shows a dash for the age of a picture whose upload time is unknown", async () => {
    const unknown = avatar({ uploadedAt: null, ageSeconds: null });
    vi.mocked(getMediaReviewItem).mockResolvedValue(unknown);
    renderItem(unknown);
    await screen.findByAltText("The profile picture under review");
    const age = screen.getByText("Age").parentElement as HTMLElement;
    expect(within(age).getByText("—")).not.toBeNull();
  });

  it("says so when the preview link is not available", async () => {
    const noLink = avatar({ viewUrl: null, viewUrlExpiresAt: null });
    vi.mocked(getMediaReviewItem).mockResolvedValue(noLink);
    renderItem(noLink);
    await screen.findByText("The preview link isn’t available right now. Reload this page to get a new one.");
  });
});

describe("Item - cover photo (6972:46516)", () => {
  it("has the wide preview, the cover tag and the same callout", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(cover());
    renderItem(cover(), COVER_ID);
    await screen.findByAltText("The cover photo under review");
    expect(screen.getByTestId("media-viewer").className).toContain("media-profile-viewer--cover");
    expect(screen.getAllByText("Cover photo").length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByRole("region", { name: "Details" })).getByText("Profile")).not.toBeNull();
    expect(
      screen.getByText("The automatic check was unsure about this picture, or could not run. Look at the picture and decide."),
    ).not.toBeNull();
  });
});

describe("Approve a profile picture", () => {
  it("approves with the full id, then shows 'Already decided' from the answer it has, without re-reading the item", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    await screen.findByAltText("The profile picture under review");
    expect(getMediaReviewItem).toHaveBeenCalledTimes(1);
    vi.mocked(approveMedia).mockResolvedValue({ id: AVATAR_ID, outcome: "approved" });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("You approved this profile picture just now. There is nothing more to do here.");
    expect(screen.getByText("Already decided")).not.toBeNull();
    expect(approveMedia).toHaveBeenCalledWith(AVATAR_ID);
    // A decided profile item is gone from the queue and answers 404: it is never read again.
    expect(getMediaReviewItem).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("on the retryable 503 keeps the item waiting, shows the server's message and lets the moderator try again", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    await screen.findByAltText("The profile picture under review");
    vi.mocked(approveMedia).mockRejectedValueOnce(
      new AdminApiError(503, "The file couldn't be published right now. It is still waiting for review; please try again.", {
        code: "media_publish_failed",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The file couldn't be published right now. It is still waiting for review; please try again.");
    expect(screen.queryByText("Already decided")).toBeNull();
    const approve = screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);

    vi.mocked(approveMedia).mockResolvedValueOnce({ id: AVATAR_ID, outcome: "approved" });
    fireEvent.click(approve);
    await screen.findByText("You approved this profile picture just now. There is nothing more to do here.");
    expect(approveMedia).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("when someone decided first (409) it shows 'Already decided' without claiming who or how", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    await screen.findByAltText("The profile picture under review");
    vi.mocked(approveMedia).mockRejectedValue(
      new AdminApiError(409, "This item has already been decided or is not waiting for review.", { code: "already_decided" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText(
      "Another moderator already decided this profile picture, or it is no longer waiting for review. There is nothing more to do here.",
    );
    expect(screen.getByText("Already decided")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getMediaReviewItem).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the other 409 (not in the queue) reads the same", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    await screen.findByAltText("The profile picture under review");
    vi.mocked(approveMedia).mockRejectedValue(new AdminApiError(409, "This item is not in the review queue.", { code: "not_in_queue" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText(/Another moderator already decided this profile picture/);
  });

  it("when the picture was replaced since it was shown (404) it becomes the plain 'Item not found' state", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    renderItem(avatar());
    await screen.findByAltText("The profile picture under review");
    vi.mocked(approveMedia).mockRejectedValue(new AdminApiError(404, "Media not found"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("Item not found");
    expect(screen.queryByAltText("The profile picture under review")).toBeNull();
    expect(
      screen.getByText("It is not waiting for review. It may already have been decided, or replaced by a newer upload."),
    ).not.toBeNull();
  });
});

describe("Reject a profile picture (6972:46863 / 6972:47057)", () => {
  async function open(initial = avatar()) {
    vi.mocked(getMediaReviewItem).mockResolvedValue(initial);
    renderItem(initial, initial.id);
    await screen.findByAltText(`The ${initial.type === "profile_cover" ? "cover photo" : "profile picture"} under review`);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  }

  it("asks for a reason, shows the empty error, then sends the trimmed reason and shows the decided state", async () => {
    await open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Reject this profile picture?" })).not.toBeNull();
    expect(
      within(dialog).getByText("Say why this profile picture is being rejected. The uploader sees this reason. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    // Focus goes to the reason field.
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (required)"));
    const submit = within(dialog).getByRole("button", { name: "Reject profile picture" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(within(dialog).getByText("Up to 300 characters.")).not.toBeNull();
    const reason = within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement;
    expect(reason.maxLength).toBe(300);
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.blur(reason);
    expect(within(dialog).getByText("Enter a reason to continue.")).not.toBeNull();
    // The hint stays beside the error, as in the frame.
    expect(within(dialog).getByText("Up to 300 characters.")).not.toBeNull();
    expect(reason.getAttribute("aria-invalid")).toBe("true");
    expect(submit.disabled).toBe(true);

    fireEvent.change(reason, { target: { value: "  Not a photo of you.  " } });
    vi.mocked(rejectMedia).mockResolvedValue({ id: AVATAR_ID, outcome: "rejected" });
    fireEvent.click(submit);
    await screen.findByText("You rejected this profile picture just now. There is nothing more to do here.");
    expect(rejectMedia).toHaveBeenCalledWith(AVATAR_ID, "Not a photo of you.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getMediaReviewItem).toHaveBeenCalledTimes(1);
  });

  it("names a cover photo in the title and the button", async () => {
    await open(cover());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Reject this cover photo?" })).not.toBeNull();
    expect(
      within(dialog).getByText("Say why this cover photo is being rejected. The uploader sees this reason. [COPY PENDING LEGAL REVIEW]"),
    ).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Not appropriate." } });
    vi.mocked(rejectMedia).mockResolvedValue({ id: COVER_ID, outcome: "rejected" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject cover photo" }));
    await screen.findByText("You rejected this cover photo just now. There is nothing more to do here.");
    expect(rejectMedia).toHaveBeenCalledWith(COVER_ID, "Not appropriate.");
  });

  it("closes with the x control, Cancel and Escape, and sends nothing", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rejectMedia).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the server's message when the reason is refused, and keeps the typed text", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Blurry." } });
    vi.mocked(rejectMedia).mockRejectedValue(new AdminApiError(400, "reason must be shorter than or equal to 300 characters"));
    fireEvent.click(screen.getByRole("button", { name: "Reject profile picture" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("reason must be shorter than or equal to 300 characters");
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect((screen.getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe("Blurry.");
  });

  it("when someone decided first (409) the dialog closes and the item shows 'Already decided'", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Blurry." } });
    vi.mocked(rejectMedia).mockRejectedValue(new AdminApiError(409, "already decided", { code: "already_decided" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject profile picture" }));
    await screen.findByText(/Another moderator already decided this profile picture/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables the dialog while the decision is being sent, and ignores a second submit", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Blurry." } });
    let finish: (v: { id: string; outcome: string }) => void = () => undefined;
    vi.mocked(rejectMedia).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject profile picture" }));
    const sending = (await screen.findByRole("button", { name: "Rejecting…" })) as HTMLButtonElement;
    expect(sending.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(sending);
    expect(rejectMedia).toHaveBeenCalledTimes(1);
    finish({ id: AVATAR_ID, outcome: "rejected" });
    await screen.findByText(/You rejected this profile picture just now/);
  });
});

describe("What the server returns is what the moderator sees", () => {
  it("shows the ordinary 'Item not found' for a 404 on open, whatever the reason (no vetting wording)", async () => {
    vi.mocked(getMediaReviewItem).mockRejectedValue(new AdminApiError(404, "Media not found"));
    renderItem(undefined);
    await screen.findByText("Item not found");
    expect(
      screen.getByText("It is not waiting for review. It may already have been decided, or replaced by a newer upload."),
    ).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/vetted|vetting|minor|child|restricted/i);
  });

  it("drops a stale handed-over item whose re-read answers 404, instead of showing it as still waiting", async () => {
    vi.mocked(getMediaReviewItem).mockRejectedValue(new AdminApiError(404, "Media not found"));
    renderItem(avatar());
    await screen.findByText("Item not found");
    expect(screen.queryByAltText("The profile picture under review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows a load error with Try again for anything else, and says nothing was decided", async () => {
    vi.mocked(getMediaReviewItem).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderItem(undefined);
    await screen.findByText("Couldn’t load this item");
    expect(screen.getByText(/Nothing has been approved or rejected/)).not.toBeNull();
    vi.mocked(getMediaReviewItem).mockResolvedValue(avatar());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByAltText("The profile picture under review");
  });
});

describe("Post media is unchanged by B-037", () => {
  it("still shows the single-column body with the automatic-check labels for a post picture", async () => {
    const post = postMedia({ sources: ["auto_check"], reportCount: 0, checkLabels: ["Suggestive"] });
    vi.mocked(getMediaReviewItem).mockResolvedValue(post);
    renderItem(post, post.id);
    await screen.findByAltText("The picture under review");
    expect(screen.getByText("Suggestive")).not.toBeNull();
    expect(screen.getByText("Labels come from the automatic check. They are a guide — the decision is yours.")).not.toBeNull();
    expect(screen.queryByTestId("profile-decided")).toBeNull();
  });
});
