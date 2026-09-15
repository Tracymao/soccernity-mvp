// ReportAction.tsx has no Figma frame to convert (see that file's own
// header comment) -- these tests cover the component in isolation, the
// same way apps/admin's AdminProfilePage's plain-built Change Password
// panel is tested directly rather than only through a page-level test.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReportAction from "./ReportAction";
import { createReport, ModerationApiError } from "../../api/moderation";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, createReport: vi.fn() };
});

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createReport).mockReset();
});

describe("ReportAction", () => {
  it("a single target opens the reason form directly", () => {
    render(
      <ReportAction
        accessToken="tok"
        targets={[{ label: "Report comment", targetType: "comment", targetId: "c1" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Report comment")).not.toBeNull();
    expect(screen.getByLabelText("Reason for report")).not.toBeNull();
  });

  it("more than one target opens a menu first", () => {
    render(
      <ReportAction
        accessToken="tok"
        targets={[
          { label: "Report post", targetType: "post", targetId: "p1" },
          { label: "Report user", targetType: "user", targetId: "u1" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("button", { name: "Report post" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Report user" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Report user" }));
    expect(screen.getByLabelText("Reason for report")).not.toBeNull();
  });

  it("submits POST /reports with the picked target and reason, then shows a confirmation", async () => {
    vi.mocked(createReport).mockResolvedValueOnce({
      id: "report-1",
      targetType: "post",
      targetId: "p1",
      reason: "Spam",
      status: "open",
      createdAt: new Date().toISOString(),
    });

    render(<ReportAction accessToken="tok" targets={[{ label: "Report post", targetType: "post", targetId: "p1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(createReport).toHaveBeenCalledWith("tok", { targetType: "post", targetId: "p1", reason: "Spam" }),
    );
    expect(await screen.findByText(/thanks, our team will review it/i)).not.toBeNull();
  });

  it("the submit button stays disabled until a reason is entered", () => {
    render(<ReportAction accessToken="tok" targets={[{ label: "Report post", targetType: "post", targetId: "p1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("button", { name: "Submit report" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Submit report" }).hasAttribute("disabled")).toBe(false);
  });

  it("surfaces a real backend error and lets the user retry", async () => {
    vi.mocked(createReport).mockRejectedValueOnce(new ModerationApiError("Post not found", { status: 404 }));

    render(<ReportAction accessToken="tok" targets={[{ label: "Report post", targetType: "post", targetId: "p1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Post not found")).not.toBeNull();
    // Still on the reason form, not silently reset.
    expect(screen.getByLabelText("Reason for report")).not.toBeNull();
  });

  it("Cancel returns to the collapsed trigger without submitting anything", () => {
    render(<ReportAction accessToken="tok" targets={[{ label: "Report post", targetType: "post", targetId: "p1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.change(screen.getByLabelText("Reason for report"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Report" })).not.toBeNull();
    expect(createReport).not.toHaveBeenCalled();
  });
});
