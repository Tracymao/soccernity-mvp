// B-206: the "Suspected illegal imagery" action on the media-review item page (visibility rule and dialog), the
// list, and the record detail with its two forms. The admin API module is mocked at its edge; the page components
// are real. Refusals are asserted by the server's `code`, never by its wording.
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
  return {
    ...actual,
    setAsideSuspectedIllegal: vi.fn(),
    listSuspectedIllegal: vi.fn(),
    getSuspectedIllegal: vi.fn(),
    recordFiled: vi.fn(),
    recordNotFiled: vi.fn(),
  };
});

import { getMediaReviewItem, type MediaReviewItem } from "../../api/mediaReview";
import {
  getSuspectedIllegal,
  listSuspectedIllegal,
  recordFiled,
  recordNotFiled,
  setAsideSuspectedIllegal,
  type SuspectedIllegalDetail,
} from "../../api/suspectedIllegal";
import MediaReviewItemPage from "../media-review/MediaReviewItemPage";
import MediaReviewQueuePage from "../media-review/MediaReviewQueuePage";
import SuspectedIllegalListPage from "./SuspectedIllegalListPage";
import SuspectedIllegalDetailPage from "./SuspectedIllegalDetailPage";

const VETTING_BODY = { code: "child_safety_vetting_required" };
const REASON = "Looks like a child, reported by two people.";
const RECORD_ID = "5a1b2c3d-0000-4000-8000-0000000000aa";

afterEach(cleanup);
beforeEach(() => {
  authState.value = null;
  for (const fn of [getMediaReviewItem, setAsideSuspectedIllegal, listSuspectedIllegal, getSuspectedIllegal, recordFiled, recordNotFiled]) {
    vi.mocked(fn).mockReset();
  }
});

function mediaItem(over: Partial<MediaReviewItem> = {}): MediaReviewItem {
  return {
    id: "media-1",
    type: "post_media",
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: 1234,
    durationSeconds: null,
    status: "pending",
    awaitingDecision: true,
    sources: ["auto_check"],
    reportCount: 0,
    hiddenPendingReview: false,
    checkLabels: [],
    uploader: { id: "u1", publicName: "ada_player" },
    postId: "post-1",
    uploadedAt: "2026-11-10T10:00:00.000Z",
    ageSeconds: 3600,
    viewUrl: "https://storage.test/signed/x",
    ...over,
  } as MediaReviewItem;
}

function record(over: Partial<SuspectedIllegalDetail> = {}): SuspectedIllegalDetail {
  return {
    id: RECORD_ID,
    mediaId: "media-1",
    uploaderId: "u1",
    postId: "post-1",
    reportId: null,
    kind: "image",
    reason: REASON,
    uploaderCountry: "GB",
    uploaderIsMinor: true,
    status: "set_aside",
    setAsideByAdminId: "a1",
    setAsideAt: "2026-11-10T11:00:00.000Z",
    preserveUntil: "2027-11-10T11:00:00.000Z",
    decidedByAdminId: null,
    decidedAt: null,
    bodyKey: null,
    bodyOther: null,
    reference: null,
    filedAt: null,
    note: null,
    notFiledReason: null,
    suggestedBodies: [
      { key: "iwf", label: "Internet Watch Foundation (IWF)", pendingCounsel: true },
      { key: "nca", label: "National Crime Agency (NCA)", pendingCounsel: true },
    ],
    viewUrl: null,
    viewUrlExpiresAt: null,
    ...over,
  };
}

function renderItem(initial: MediaReviewItem) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/moderation/media/media-1", state: { item: initial } }]}>
      <Routes>
        <Route path="/moderation/media/:id" element={<MediaReviewItemPage />} />
        <Route path="/moderation/suspected-illegal/:id" element={<p>record page</p>} />
        <Route path="/moderation/media" element={<p>queue</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/moderation/suspected-illegal"]}>
      <Routes>
        <Route path="/moderation/suspected-illegal" element={<SuspectedIllegalListPage />} />
        <Route path="/moderation/suspected-illegal/:id" element={<p>record page</p>} />
        <Route path="/moderation/media" element={<p>media review</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail(handed?: SuspectedIllegalDetail) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/moderation/suspected-illegal/${RECORD_ID}`, state: handed ? { record: handed } : undefined }]}>
      <Routes>
        <Route path="/moderation/suspected-illegal/:id" element={<SuspectedIllegalDetailPage />} />
        <Route path="/moderation/suspected-illegal" element={<p>the list</p>} />
        <Route path="/moderation/media/:id" element={<p>review item</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("item page: the Suspected illegal imagery action is shown only when the page may offer it", () => {
  it("is shown for a vetted admin, beside Approve and Reject", async () => {
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile: vi.fn() };
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    expect(screen.getByRole("button", { name: "Suspected illegal imagery" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reject" })).not.toBeNull();
  });

  it("is hidden for an admin the profile says is not vetted", async () => {
    authState.value = { admin: { childSafetyVetted: false }, refreshProfile: vi.fn() };
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
  });

  it("is hidden for an admin whose profile carries no vetting field (fails closed)", async () => {
    authState.value = { admin: {}, refreshProfile: vi.fn() };
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
  });

  it("is hidden once a record exists, and the page shows the record's status with a link to it", async () => {
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile: vi.fn() };
    const withRecord = mediaItem({ status: "rejected", awaitingDecision: false, suspectedIllegalRecord: { id: RECORD_ID, status: "set_aside" } });
    vi.mocked(getMediaReviewItem).mockResolvedValue(withRecord);
    renderItem(withRecord);
    const callout = await screen.findByTestId("suspected-illegal-record");
    expect(callout.textContent).toContain("Not filed");
    expect(within(callout).getByRole("link", { name: "Open the record" }).getAttribute("href")).toBe(`/moderation/suspected-illegal/${RECORD_ID}`);
    expect(screen.queryByRole("button", { name: "Suspected illegal imagery" })).toBeNull();
  });

  it("is shown when no auth provider is mounted (the server's coded 403 is then the rule)", async () => {
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    expect(screen.getByRole("button", { name: "Suspected illegal imagery" })).not.toBeNull();
  });
});

describe("set-aside dialog", () => {
  async function openDialog() {
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile: vi.fn() };
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    fireEvent.click(screen.getByRole("button", { name: "Suspected illegal imagery" }));
    return screen.getByRole("dialog");
  }

  it("says what will happen, in the picture's own words", async () => {
    const dialog = await openDialog();
    const d = within(dialog);
    expect(d.getByText("Set this picture aside as suspected illegal imagery?")).not.toBeNull();
    expect(d.getByText(/withdrawn from public view and rejected/)).not.toBeNull();
    expect(d.getByText(/The uploader sees the standard rejection message/)).not.toBeNull();
    expect(d.getByText(/kept for the set-aside period and is not deleted with the uploader’s account/)).not.toBeNull();
    expect(d.getByText(/Nothing is reported to anyone/)).not.toBeNull();
  });

  it("needs a reason of 10 to 500 characters and sends the trimmed text only when it is valid", async () => {
    const dialog = await openDialog();
    const d = within(dialog);
    const reason = d.getByLabelText("Reason (required)");
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    expect(d.getByText("Enter a reason to continue.")).not.toBeNull();
    expect(setAsideSuspectedIllegal).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: "too short" } });
    expect(d.getByText("Enter at least 10 characters.")).not.toBeNull();
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    expect(setAsideSuspectedIllegal).not.toHaveBeenCalled();

    vi.mocked(setAsideSuspectedIllegal).mockResolvedValue(record() as never);
    vi.mocked(getMediaReviewItem).mockResolvedValue(
      mediaItem({ status: "rejected", awaitingDecision: false, suspectedIllegalRecord: { id: RECORD_ID, status: "set_aside" } }),
    );
    fireEvent.change(reason, { target: { value: `  ${REASON}  ` } });
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await screen.findByTestId("suspected-illegal-record");
    expect(setAsideSuspectedIllegal).toHaveBeenCalledWith("media-1", REASON);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel closes it without sending anything", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(setAsideSuspectedIllegal).not.toHaveBeenCalled();
  });

  it("the vetting 403 closes the dialog, shows the existing restricted notice and re-reads the profile", async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile };
    vi.mocked(getMediaReviewItem).mockResolvedValue(mediaItem());
    renderItem(mediaItem());
    await screen.findByAltText("The picture under review");
    fireEvent.click(screen.getByRole("button", { name: "Suspected illegal imagery" }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.change(d.getByLabelText("Reason (required)"), { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(new AdminApiError(403, "restricted", VETTING_BODY));
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/child-safety-vetted admin/i)).not.toBeNull();
    expect(refreshProfile).toHaveBeenCalled();
  });

  it("a 409 'already set aside' stays in the dialog with a fixed line and keeps the typed reason", async () => {
    const dialog = await openDialog();
    const d = within(dialog);
    const reason = d.getByLabelText("Reason (required)") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: REASON } });
    vi.mocked(setAsideSuspectedIllegal).mockRejectedValue(
      new AdminApiError(409, "English text we do not rely on", { code: "suspected_illegal_already_recorded" }),
    );
    fireEvent.click(d.getByRole("button", { name: "Confirm" }));
    await screen.findByText("This file has already been set aside.");
    expect(reason.value).toBe(REASON);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });
});

describe("Media review queue: the link to the list", () => {
  function renderQueue() {
    return render(
      <MemoryRouter initialEntries={["/moderation/media"]}>
        <MediaReviewQueuePage />
      </MemoryRouter>,
    );
  }
  it("is shown to a vetted admin and hidden from one who is not", async () => {
    authState.value = { admin: { childSafetyVetted: true }, refreshProfile: vi.fn() };
    const { unmount } = renderQueue();
    expect(screen.getByRole("link", { name: "Suspected illegal imagery" }).getAttribute("href")).toBe("/moderation/suspected-illegal");
    unmount();
    authState.value = { admin: { childSafetyVetted: false }, refreshProfile: vi.fn() };
    renderQueue();
    expect(screen.queryByRole("link", { name: "Suspected illegal imagery" })).toBeNull();
  });
});

describe("list page", () => {
  const page = (items: SuspectedIllegalDetail[], nextCursor: string | null = null) => ({ items, nextCursor });

  it("shows status, flagged date, kept-until date and kind, with the unfiled record marked", async () => {
    vi.mocked(listSuspectedIllegal).mockResolvedValue(
      page([record(), record({ id: "b2", status: "filed", kind: "video", bodyKey: "iwf", reference: "R1" })]),
    );
    renderList();
    const table = within(await screen.findByRole("table", { name: "Suspected illegal imagery records" }));
    expect(table.getByText("Not filed")).not.toBeNull();
    expect(table.getByText("Filed")).not.toBeNull();
    expect(table.getByText("Picture")).not.toBeNull();
    expect(table.getByText("Video")).not.toBeNull();
    const rows = table.getAllByRole("row").slice(1);
    expect(rows[0].className).toContain("si-table__row--open");
    expect(rows[1].className).not.toContain("si-table__row--open");
    expect(table.getAllByRole("link", { name: /Open the/ })).toHaveLength(2);
  });

  it("re-queries by status when the filter is applied", async () => {
    vi.mocked(listSuspectedIllegal).mockResolvedValue(page([record()]));
    renderList();
    await screen.findByRole("table", { name: "Suspected illegal imagery records" });
    expect(listSuspectedIllegal).toHaveBeenLastCalledWith({ status: undefined, cursor: undefined, limit: 50 });
    vi.mocked(listSuspectedIllegal).mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "set_aside" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await screen.findByText("No records are waiting for a filing decision.");
    expect(listSuspectedIllegal).toHaveBeenLastCalledWith({ status: "set_aside", cursor: undefined, limit: 50 });
  });

  it("pages with Load more", async () => {
    vi.mocked(listSuspectedIllegal).mockResolvedValueOnce(page([record()], "c1"));
    renderList();
    await screen.findByRole("table", { name: "Suspected illegal imagery records" });
    vi.mocked(listSuspectedIllegal).mockResolvedValueOnce(page([record({ id: "b2", kind: "video" })]));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Video");
    expect(listSuspectedIllegal).toHaveBeenLastCalledWith({ status: undefined, cursor: "c1", limit: 50 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows the empty state, the load error with Retry, the vetting notice and the role refusal", async () => {
    vi.mocked(listSuspectedIllegal).mockResolvedValueOnce(page([]));
    const first = renderList();
    await screen.findByText("No records.");
    first.unmount();

    vi.mocked(listSuspectedIllegal).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    const second = renderList();
    await screen.findByText("Couldn’t load the records");
    vi.mocked(listSuspectedIllegal).mockResolvedValueOnce(page([record()]));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("table", { name: "Suspected illegal imagery records" });
    second.unmount();

    vi.mocked(listSuspectedIllegal).mockRejectedValueOnce(new AdminApiError(403, "no", VETTING_BODY));
    const third = renderList();
    await screen.findByText(/child-safety-vetted admin/i);
    expect(screen.queryByRole("table")).toBeNull();
    third.unmount();

    vi.mocked(listSuspectedIllegal).mockRejectedValueOnce(new AdminApiError(403, "no", { code: "forbidden" }));
    renderList();
    await screen.findByText("You don’t have access to these records");
  });
});

describe("record detail", () => {
  it("shows the facts, the suggested bodies as pending counsel, and the outside-Soccernity statement; no file content", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    renderDetail(record());
    await screen.findByText("The file");
    expect(screen.getByText("Picture")).not.toBeNull();
    expect(screen.getByText("GB")).not.toBeNull();
    expect(screen.getByText(REASON)).not.toBeNull();
    const suggested = within(screen.getByLabelText("Suggested receiving bodies"));
    expect(suggested.getByText(/Internet Watch Foundation \(IWF\)/)).not.toBeNull();
    expect(suggested.getAllByText("Pending counsel")).toHaveLength(2);
    expect(screen.getByText(/must be made with that body, outside Soccernity/)).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: /View the file/ })).toBeNull();
  });

  it("offers a signed view link only when the server gives one", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record({ viewUrl: "https://storage.test/signed/y" }));
    renderDetail(record());
    const link = await screen.findByRole("link", { name: /View the file/ });
    expect(link.getAttribute("href")).toBe("https://storage.test/signed/y");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("says plainly when no body is suggested for the country", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record({ uploaderCountry: "NG", suggestedBodies: [] }));
    renderDetail();
    await screen.findByText("No body is suggested for this uploader’s country.");
  });

  it("records a filing: Other needs a name, the reference is required, and the request is the trimmed body", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    renderDetail(record());
    const form = within(await screen.findByRole("form", { name: "Record that this was filed" }));
    fireEvent.click(form.getByRole("button", { name: "Record that this was filed" }));
    expect(form.getByText("Choose a receiving body.")).not.toBeNull();
    expect(form.getByText("Enter the reference you were given.")).not.toBeNull();
    expect(recordFiled).not.toHaveBeenCalled();

    fireEvent.change(form.getByLabelText(/^Receiving body/), { target: { value: "other" } });
    fireEvent.click(form.getByRole("button", { name: "Record that this was filed" }));
    expect(form.getByText("Name the body.")).not.toBeNull();
    fireEvent.change(form.getByLabelText(/^Name of the body/), { target: { value: " Local police " } });
    fireEvent.change(form.getByLabelText(/^Reference you were given/), { target: { value: " REF-9 " } });
    fireEvent.change(form.getByLabelText(/Date and time it was filed/), { target: { value: "2026-11-15T09:30" } });

    vi.mocked(recordFiled).mockResolvedValue(
      record({ status: "filed", bodyKey: "other", bodyOther: "Local police", reference: "REF-9", decidedAt: "2026-11-16T10:00:00.000Z", filedAt: "2026-11-15T09:30:00.000Z" }) as never,
    );
    fireEvent.click(form.getByRole("button", { name: "Record that this was filed" }));
    await screen.findByText("This record now shows as filed.");
    expect(recordFiled).toHaveBeenCalledWith(RECORD_ID, {
      bodyKey: "other",
      bodyOther: "Local police",
      reference: "REF-9",
      filedAt: new Date("2026-11-15T09:30").toISOString(),
    });
    const decision = within(screen.getByLabelText("Decision"));
    expect(decision.getByText("Other: Local police")).not.toBeNull();
    expect(decision.getByText("REF-9")).not.toBeNull();
    expect(screen.queryByRole("form", { name: "Record that this was filed" })).toBeNull();
  });

  it("records a decision not to file: a reason of at least 10 characters is required", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    renderDetail(record());
    const form = within(await screen.findByRole("form", { name: "Record a decision not to file" }));
    fireEvent.click(form.getByRole("button", { name: "Record a decision not to file" }));
    expect(form.getByText("Enter a reason to continue.")).not.toBeNull();
    fireEvent.change(form.getByLabelText(/^Reason/), { target: { value: "short" } });
    expect(form.getByText("Enter at least 10 characters.")).not.toBeNull();
    expect(recordNotFiled).not.toHaveBeenCalled();

    fireEvent.change(form.getByLabelText(/^Reason/), { target: { value: "  Not the kind of content counsel described.  " } });
    vi.mocked(recordNotFiled).mockResolvedValue(
      record({ status: "not_filed", notFiledReason: "Not the kind of content counsel described.", decidedAt: "2026-11-16T10:00:00.000Z" }) as never,
    );
    fireEvent.click(form.getByRole("button", { name: "Record a decision not to file" }));
    await screen.findByText("This record now shows a decision not to file.");
    expect(recordNotFiled).toHaveBeenCalledWith(RECORD_ID, "Not the kind of content counsel described.");
    expect(within(screen.getByLabelText("Decision")).getByText("Not the kind of content counsel described.")).not.toBeNull();
  });

  it("a decided record shows its decision and neither form", async () => {
    const filed = record({ status: "filed", bodyKey: "iwf", reference: "IWF-1", decidedAt: "2026-11-16T10:00:00.000Z", filedAt: "2026-11-16T09:00:00.000Z", note: "Called first" });
    vi.mocked(getSuspectedIllegal).mockResolvedValue(filed);
    renderDetail(filed);
    const decision = within(await screen.findByLabelText("Decision"));
    expect(decision.getByText("Internet Watch Foundation (IWF)")).not.toBeNull();
    expect(decision.getByText("Called first")).not.toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("409 already decided re-reads the record and shows the decision, with no error text", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValueOnce(record());
    renderDetail(record());
    const form = within(await screen.findByRole("form", { name: "Record a decision not to file" }));
    fireEvent.change(form.getByLabelText(/^Reason/), { target: { value: "Another moderator got there first." } });
    vi.mocked(recordNotFiled).mockRejectedValue(new AdminApiError(409, "English we do not rely on", { code: "suspected_illegal_already_decided" }));
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record({ status: "filed", bodyKey: "nca", reference: "N1", decidedAt: "2026-11-16T10:00:00.000Z" }));
    fireEvent.click(form.getByRole("button", { name: "Record a decision not to file" }));
    const decision = within(await screen.findByLabelText("Decision"));
    expect(decision.getByText("National Crime Agency (NCA)")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the vetting 403 on a save shows the restricted notice; any other 403 shows a role line; 400 'other' goes on the field", async () => {
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    renderDetail(record());
    const notFiled = within(await screen.findByRole("form", { name: "Record a decision not to file" }));
    fireEvent.change(notFiled.getByLabelText(/^Reason/), { target: { value: "A reason that is long enough." } });
    vi.mocked(recordNotFiled).mockRejectedValueOnce(new AdminApiError(403, "no", VETTING_BODY));
    fireEvent.click(notFiled.getByRole("button", { name: "Record a decision not to file" }));
    await screen.findByText(/child-safety-vetted admin/i);

    vi.mocked(recordNotFiled).mockRejectedValueOnce(new AdminApiError(403, "no", { code: "forbidden" }));
    fireEvent.click(notFiled.getByRole("button", { name: "Record a decision not to file" }));
    await screen.findByText("You don’t have access to record this. Only moderators and super admins can.");

    const filed = within(screen.getByRole("form", { name: "Record that this was filed" }));
    fireEvent.change(filed.getByLabelText(/^Receiving body/), { target: { value: "iwf" } });
    fireEvent.change(filed.getByLabelText(/^Reference you were given/), { target: { value: "R1" } });
    vi.mocked(recordFiled).mockRejectedValueOnce(new AdminApiError(400, "x", { code: "suspected_illegal_body_other_required" }));
    fireEvent.click(filed.getByRole("button", { name: "Record that this was filed" }));
    await screen.findByText("Name the body when you choose “Other”.");
  });

  it("a record that does not exist, or cannot be opened, shows the not-found card with a way back", async () => {
    vi.mocked(getSuspectedIllegal).mockRejectedValue(new AdminApiError(404, "nope", { code: "suspected_illegal_not_found" }));
    renderDetail();
    await screen.findByText("Record not found");
    expect(screen.getByRole("link", { name: "Back to the list" })).not.toBeNull();
  });

  it("the vetting 403 on load shows the restricted notice; a failed load offers Try again", async () => {
    vi.mocked(getSuspectedIllegal).mockRejectedValueOnce(new AdminApiError(403, "no", VETTING_BODY));
    const first = renderDetail();
    await screen.findByText(/child-safety-vetted admin/i);
    first.unmount();

    vi.mocked(getSuspectedIllegal).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderDetail();
    await screen.findByText("Couldn’t load the record");
    vi.mocked(getSuspectedIllegal).mockResolvedValue(record());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("The file");
  });
});
