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
import { submitFinalEntry } from "../../api/contest";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(submitFinalEntry).mockReset();
});

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

  it("Submit stays disabled until there is a caption and a valid https link (no upload endpoint exists)", () => {
    renderPanel();
    const submit = screen.getByRole("button", { name: /submit entry/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "my final" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Video link"), { target: { value: "not a link" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Video link"), { target: { value: "https://cdn.example.com/final.mp4" } });
    expect(submit.disabled).toBe(false);
  });

  it("submits the caption and link, then shows the confirmation", async () => {
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
    fireEvent.change(screen.getByLabelText("Video link"), { target: { value: "https://cdn.example.com/final.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));
    await waitFor(() =>
      expect(submitFinalEntry).toHaveBeenCalledWith("t", {
        contentText: "my final",
        mediaUrls: ["https://cdn.example.com/final.mp4"],
      }),
    );
    await screen.findByText(/your final entry is in/i);
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("shows the server's message when the upload window has closed", async () => {
    vi.mocked(submitFinalEntry).mockRejectedValue(
      new ContestApiError("The upload window is closed.", { status: 403, code: "contest_final_closed" }),
    );
    renderPanel();
    fireEvent.change(screen.getByLabelText(/caption for your final entry/i), { target: { value: "late" } });
    fireEvent.change(screen.getByLabelText("Video link"), { target: { value: "https://cdn.example.com/x.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /submit entry/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("The upload window is closed.");
  });
});
