import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import FinalWeekPanel from "./FinalWeekPanel";
import { ContestApiError } from "../../api/contest";
import { openContest } from "../contest/contestFixtures";

vi.mock("../../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../../api/contest")>("../../api/contest");
  return { ...actual, submitFinalEntry: vi.fn() };
});
vi.mock("../../api/postMedia", async () => {
  const actual = await vi.importActual<typeof import("../../api/postMedia")>("../../api/postMedia");
  return { ...actual, createUpload: vi.fn(), putFile: vi.fn(), confirmUpload: vi.fn(), getUpload: vi.fn(), deleteUpload: vi.fn() };
});
import { submitFinalEntry } from "../../api/contest";
import { confirmUpload, createUpload, deleteUpload, getUpload, putFile, type PostMediaView } from "../../api/postMedia";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(submitFinalEntry).mockReset();
  vi.mocked(createUpload).mockReset();
  vi.mocked(putFile).mockReset();
  vi.mocked(confirmUpload).mockReset();
  vi.mocked(getUpload).mockReset();
  vi.mocked(deleteUpload).mockReset();
  vi.mocked(createUpload).mockResolvedValue({
    id: "m1",
    uploadUrl: "https://storage.test/put",
    uploadMethod: "PUT",
    uploadHeaders: { "Content-Type": "video/mp4" },
    expiresAt: "2026-09-23T10:15:00.000Z",
    maxBytes: 100 * 1024 * 1024,
  });
  vi.mocked(putFile).mockResolvedValue(undefined);
  vi.mocked(deleteUpload).mockResolvedValue(undefined);
});

function view(over: Partial<PostMediaView> = {}): PostMediaView {
  return {
    id: "m1",
    kind: "video",
    uploadState: "ready",
    status: "pending",
    rejectionReason: null,
    url: "https://cdn.test/post-media/u/m1.mp4",
    contentType: "video/mp4",
    byteSize: 1234,
    durationSeconds: 30,
    postId: null,
    createdAt: "2026-09-23T10:00:00.000Z",
    ...over,
  };
}

function chooseVideo() {
  const file = new File(["video"], "final.mp4", { type: "video/mp4" });
  fireEvent.change(document.getElementById("final-entry-video") as HTMLInputElement, { target: { files: [file] } });
}

const UPLOAD = { kind: "final_upload", opensAt: "2026-09-22T07:00:00.000Z", revealsAt: "2026-09-24T23:00:00.000Z" } as const;

function renderPanel(over: Parameters<typeof openContest>[0] = {}, onSubmitted = vi.fn()) {
  render(
    <MemoryRouter>
      <FinalWeekPanel
        accessToken="t"
        authorName="Ada Player"
        contest={openContest({ calendarState: UPLOAD, callerIsFinalist: true, ...over })}
        onSubmitted={onSubmitted}
      />
    </MemoryRouter>,
  );
  return onSubmitted;
}

describe("FinalWeekPanel", () => {
  it("a non-finalist sees 'finalists only' and nothing to upload (the tab is not hidden)", () => {
    renderPanel({ callerIsFinalist: false });
    expect(screen.getByText(/FINALISTS ONLY/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /submit entry/i })).toBeNull();
    expect(screen.queryByLabelText(/caption/i)).toBeNull();
  });

  it("a finalist who has already uploaded sees a confirmation, not the form", () => {
    renderPanel({ callerFinalEntry: { entryId: "f1", postId: "p1", submittedAt: "2026-09-23T10:00:00.000Z" } });
    expect(screen.getByText(/your final entry is in/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /submit entry/i })).toBeNull();
  });

  it("has no free link field: the only way to attach a video is to choose a file", () => {
    renderPanel();
    expect(screen.queryByLabelText("Video link")).toBeNull();
    expect(screen.getByRole("button", { name: /choose a video/i })).not.toBeNull();
    expect(screen.getByText(/stays hidden from everyone but you until the reveal\. \[COPY PENDING LEGAL REVIEW\]/)).not.toBeNull();
  });

  it("Submit stays disabled until there is a caption AND an uploaded video", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(view());
    renderPanel();
    const submit = screen.getByRole("button", { name: /submit entry/i }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "my final" } });
    expect(submit.disabled).toBe(true); // a caption alone is not enough
    chooseVideo();
    await screen.findByText("Checking");
    expect(submit.disabled).toBe(false);
    expect(createUpload).toHaveBeenCalledWith("t", { contentType: "video/mp4", size: 5 });
    expect(putFile).toHaveBeenCalled();
    // The entry can be changed only until you submit (Decision Log #430 item 5), not "until the window closes".
    expect(screen.getByText("You can change your video until you submit.")).not.toBeNull();
    expect(screen.queryByText(/until the upload window closes/i)).toBeNull();
  });

  it("submits the caption and the uploaded video's id, then shows the confirmation", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(view());
    vi.mocked(submitFinalEntry).mockResolvedValue({
      id: "f1",
      cycleId: "c",
      roundId: "r4",
      weekNumber: 4,
      postId: "p1",
      submittedAt: "2026-09-23T10:00:00.000Z",
    });
    const onSubmitted = renderPanel();
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "my final" } });
    chooseVideo();
    await screen.findByText("Checking");
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));
    await waitFor(() => expect(submitFinalEntry).toHaveBeenCalledWith("t", { contentText: "my final", mediaId: "m1" }));
    await screen.findByText(/your final entry is in/i);
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("shows a rejected video with its reason and blocks the submit until it is removed", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(view({ status: "rejected", rejectionReason: "It showed something unsafe." }));
    renderPanel();
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "my final" } });
    chooseVideo();
    await screen.findByText("This video wasn’t approved");
    expect(screen.getByText("It showed something unsafe.")).not.toBeNull();
    expect(screen.getByText("Remove it and upload another before you submit.")).not.toBeNull();
    expect((screen.getByRole("button", { name: /submit entry/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deleteUpload).toHaveBeenCalledWith("t", "m1"));
    await screen.findByRole("button", { name: /choose a video/i });
  });

  it("shows the server's message when the upload window has closed", async () => {
    vi.mocked(confirmUpload).mockResolvedValue(view());
    vi.mocked(submitFinalEntry).mockRejectedValue(
      new ContestApiError("The upload window is closed.", { status: 403, code: "contest_final_closed" }),
    );
    renderPanel();
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "late" } });
    chooseVideo();
    await screen.findByText("Checking");
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("The upload window is closed.");
  });
});
