// B-206 (backend PR #806): the "Suspected illegal imagery" action on a PROFILE PICTURE or COVER PHOTO item of the
// media-review item page, and the new kinds on the list and detail pages. The admin API module is mocked at its edge;
// the page components are real. Refusals are asserted by the server code or status, never by its wording.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

const authState: {
  value: null | { admin: { childSafetyVetted?: boolean } | null; refreshProfile: () => Promise<unknown> };
} = { value: null };
vi.mock("../../auth/AdminAuthContext", () => ({
  useOptionalAdminAuth: () => authState.value,
}));

vi.mock("../../api/mediaReview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mediaReview")>();
  return { ...actual, getMediaReviewItem: vi.fn(), approveMedia: vi.fn(), rejectMedia: vi.fn() };
});
vi.mock("../../api/suspectedIllegal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/suspectedIllegal")>();
  return { ...actual, setAsideSuspectedIllegal: vi.fn(), listSuspectedIllegal: vi.fn(), getSuspectedIllegal: vi.fn() };
});

import { getMediaReviewItem, type MediaReviewItem } from "../../api/mediaReview";
import {
  getSuspectedIllegal,
  listSuspectedIllegal,
  setAsideSuspectedIllegal,
  type SuspectedIllegalDetail,
} from "../../api/suspectedIllegal";
import MediaReviewItemPage from "../media-review/MediaReviewItemPage";
import SuspectedIllegalListPage from "./SuspectedIllegalListPage";
import SuspectedIllegalDetailPage from "./SuspectedIllegalDetailPage";

const AVATAR_ID = "avatar:5f1d2c3b-aaaa-4bbb-8ccc-000000000001:9d8c7b6a.jpg";
const COVER_ID = "cover:5f1d2c3b-aaaa-4bbb-8ccc-000000000002:1a2b3c4d.jpg";
const VETTING_BODY = { code: "child_safety_vetting_required" };
const REASON = "Looks like a child, flagged by the check.";
const RECORD_ID = "7c1b2c3d-0000-4000-8000-0000000000bb";

afterEach(cleanup);
beforeEach(() => {
  authState.value = { admin: { childSafetyVetted: true }, refreshProfile: vi.fn() };
  for (const fn of [getMediaReviewItem, setAsideSuspectedIllegal, listSuspectedIllegal, getSuspectedIllegal]) {
    vi.mocked(fn).mockReset();
  }
});

function profileItem(type: "profile_avatar" | "profile_cover", over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return {
    id: type === "profile_avatar" ? AVATAR_ID : COVER_ID,
    type,
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
    uploadedAt: "2026-11-16T09:00:00.000Z",
    ageSeconds: 600,
    enteredQueueAt: null,
    decidedAt: null,
    decisionSource: null,
    rejectionReason: null,
    viewUrl: "https://storage.test/signed/profile?sig=1",
    viewUrlExpiresAt: "2026-11-16T09:05:00.000Z",
    ...over,
  } as MediaReviewItem;
}

function record(over: Partial<SuspectedIllegalDetail> = {}): SuspectedIllegalDetail {
  return {
    id: RECORD_ID,
    mediaId: AVATAR_ID,
    uploaderId: "u1",
    postId: null,
    reportId: null,
    kind: "profile_avatar",
    reason: REASON,
    uploaderCountry: "GB",
    uploaderIsMinor: true,
    status: "set_aside",
    setAsideByAdminId: "a1",
    setAsideAt: "2026-11-16T11:00:00.000Z",
    preserveUntil: "2027-11-16T11:00:00.000Z",
    decidedByAdminId: null,
    decidedAt: null,
    bodyKey: null,
    bodyOther: null,
    reference: null,
    filedAt: null,
    note: null,
    notFiledReason: null,
    suggestedBodies: [],
    viewUrl: null,
    viewUrlExpiresAt: null,
    ...over,
  };
}

function renderItem(initial: MediaReviewItem) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/moderation/media/${encodeURIComponent(initial.id)}`, state: { item: initial } }]}
    >
      <Routes>
        <Route path="/moderation/media/:id" element={<MediaReviewItemPage />} />
        <Route path="/moderation/suspected-illegal/:id" element={<p>record page</p>} />
        <Route path="/moderation/media" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openDialog(item: MediaReviewItem) {
  vi.mocked(getMediaReviewItem).mockResolvedValue(item);
  renderItem(item);
  await screen.findByTestId("media-viewer");
  fireEvent.click(screen.getByRole("button", { name: "Suspected illegal imagery" }));
  return within(screen.getByRole("dialog"));
}

describe.each([
  ["profile_avatar", "profile picture", AVATAR_ID],
  ["profile_cover", "cover photo", COVER_ID],
] as const)("item page, %s", (type, noun, id) => {
  it("shows the action beside Approve and Reject for a vetted admin", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(profileItem(type));
    renderItem(profileItem(type));
    await screen.findByTestId("media-viewer");
    expect(screen.getByRole("button", { name: "Approve" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Suspected illegal imagery" })).not.toBeNull();
  });

  it("hides the action for an admin the profile says is not vetted, or one with no vetting field", async () => {
    for (const admin of [{ childSafetyVetted: false }, {}]) {
      authState.value = { admin, refreshProfile: vi.fn() };
      vi.mocked(getMediaReviewItem).mockResolvedValue(profileItem(type));
      renderItem(profileItem(type));
      await screen.findByTestId("media-viewer");
      expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
      cleanup();
    }
  });

  it("is shown when no auth provider is mounted (the server coded 403 is then the rule)", async () => {
    authState.value = null;
    vi.mocked(getMediaReviewItem).mockResolvedValue(profileItem(type));
    renderItem(profileItem(type));
    await screen.findByTestId("media-viewer");
    expect(screen.getByRole("button", { name: "Suspected illegal imagery" })).not.toBeNull();
  });

  it("hides the action once a record exists and shows its status with a link", async () => {
    const item = profileItem(type, { suspectedIllegalRecord: { id: RECORD_ID, status: "set_aside" } });
    vi.mocked(getMediaReviewItem).mockResolvedValue(item);
    renderItem(item);
    await screen.findByTestId("suspected-illegal-record");
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the record" }).getAttribute("href")).toBe(
      `/moderation/suspected-illegal/${RECORD_ID}`,
    );
  });

  it("a re-opened set-aside item (the server answers rejected, not awaiting) is read-only with the record shown", async () => {
    const item = profileItem(type, {
      status: "rejected",
      awaitingDecision: false,
      decidedAt: "2026-11-16T11:00:00.000Z",
      suspectedIllegalRecord: { id: RECORD_ID, status: "set_aside" },
    });
    vi.mocked(getMediaReviewItem).mockResolvedValue(item);
    renderItem(item);
    await screen.findByTestId("suspected-illegal-record");
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
  });

  it("names the file in the dialog own words", async () => {
    const d = await openDialog(profileItem(type));
    expect(d.getByText(`Set this ${noun} aside as suspected illegal imagery?`)).not.toBeNull();
    expect(d.getByText(new RegExp(`The ${noun} is withdrawn from public view and rejected`))).not.toBeNull();
    expect(d.getByText(new RegExp(`The ${noun} is kept for the set-aside period`))).not.toBeNull();
    expect(d.getByText(/Nothing is reported to anyone/)).not.toBeNull();
  });

  it("needs a reason of 10 to 500 characters, sends the raw id and the trimmed text, then shows the record", async () => {
    const d = await openDialog(profileItem(type));
    const reason = d.getByLabelText("Reason (required)");
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    expect(d.getByText("Enter a reason to continue.")).not.toBeNull();
    fireEvent.change(reason, { target: { value: "too short" } });
    expect(d.getByText("Enter at least 10 characters.")).not.toBeNull();
    expect(setAsideSuspectedIllegal).not.toHaveBeenCalled();

    vi.mocked(setAsideSuspectedIllegal).mockResolvedValue(record({ mediaId: id }) as never);
    fireEvent.change(reason, { target: { value: `  ${REASON}  ` } });
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));

    await screen.findByTestId("suspected-illegal-record");
    expect(setAsideSuspectedIllegal).toHaveBeenCalledWith(id, REASON);
    expect(screen.queryByRole("dialog")).toBeNull();
    // The item left the queue in the same step: the page does not re-read it (that would 404) and shows the outcome.
    expect(getMediaReviewItem).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("profile-decided").textContent).toContain(`set this ${noun} aside as suspected illegal imagery`);
    expect(screen.getByText(/Status: Not filed/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open the record" }).getAttribute("href")).toBe(
      `/moderation/suspected-illegal/${RECORD_ID}`,
    );
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Cancel closes the dialog and sends nothing", async () => {
    const d = await openDialog(profileItem(type));
    fireEvent.click(d.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(setAsideSuspectedIllegal).not.toHaveBeenCalled();
  });

  it("the vetting 403 closes the dialog, shows the existing restricted notice and re-reads the profile", async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile };
    const d = await openDialog(profileItem(type));
    fireEvent.change(d.getByLabelText("Reason (required)"), { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(new AdminApiError(403, "restricted", VETTING_BODY));
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/child-safety-vetted admin/i)).not.toBeNull();
    expect(refreshProfile).toHaveBeenCalled();
  });

  it("a 409 already set aside stays in the dialog with a fixed line and keeps the typed reason", async () => {
    const d = await openDialog(profileItem(type));
    const reason = d.getByLabelText("Reason (required)") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(
      new AdminApiError(409, "English text we do not rely on", { code: "suspected_illegal_already_recorded" }),
    );
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await screen.findByText("This file has already been set aside.");
    expect(reason.value).toBe(REASON);
  });

  it("a 404 (the picture was replaced since it was shown) closes the dialog and shows the stale state, with no record claimed", async () => {
    const d = await openDialog(profileItem(type));
    fireEvent.change(d.getByLabelText("Reason (required)"), { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(new AdminApiError(404, "gone", { code: "x" }));
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await screen.findByText("Item not found");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("suspected-illegal-record")).toBeNull();
  });

  it("a 5xx (the withdraw failed, nothing changed) stays in the dialog with the fixed retry line", async () => {
    const d = await openDialog(profileItem(type));
    fireEvent.change(d.getByLabelText("Reason (required)"), { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(new AdminApiError(503, "boom", null));
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await screen.findByText(/Nothing was changed/);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.queryByTestId("suspected-illegal-record")).toBeNull();
  });
});

describe("list and detail pages show the profile kinds", () => {
  it("labels profile picture and cover photo records beside picture and video", async () => {
    vi.mocked(listSuspectedIllegal).mockResolvedValue({
      items: [
        record(),
        record({ id: "b2", kind: "profile_cover", mediaId: COVER_ID }),
        record({ id: "b3", kind: "image", mediaId: "m3", postId: "p1" }),
      ],
      nextCursor: null,
    });
    render(
      <MemoryRouter initialEntries={["/moderation/suspected-illegal"]}>
        <Routes>
          <Route path="/moderation/suspected-illegal" element={<SuspectedIllegalListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const table = within(await screen.findByRole("table", { name: "Suspected illegal imagery records" }));
    expect(table.getByText("Profile picture")).not.toBeNull();
    expect(table.getByText("Cover photo")).not.toBeNull();
    expect(table.getByText("Picture")).not.toBeNull();
    expect(table.getByRole("link", { name: /Open the cover photo record/ })).not.toBeNull();
  });

  it("the record detail names a profile picture record", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    render(
      <MemoryRouter initialEntries={[{ pathname: `/moderation/suspected-illegal/${RECORD_ID}` }]}>
        <Routes>
          <Route path="/moderation/suspected-illegal/:id" element={<SuspectedIllegalDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Profile picture");
    expect(screen.queryByText("Picture")).toBeNull();
  });
});
