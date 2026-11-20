// ReportAction — the in-app report dialog (B-284, Decision Log #465). The component is tested in isolation, the
// way apps/admin's plain-built panels are; PostCard.test.tsx and PostMedia.test.tsx cover it in place.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReportAction from "./ReportAction";
import { createReport, ModerationApiError, REPORT_REASON_CATEGORIES } from "../../api/moderation";
import { REPORT_REASON_LABELS, REPORT_REASON_OPTIONS } from "../../lib/reportReasons";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, createReport: vi.fn() };
});

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createReport).mockReset();
});

const POST = { label: "Report post", targetType: "post", targetId: "p1" } as const;

function openDialog(target: Parameters<typeof ReportAction>[0]["targets"][number] = POST) {
  render(<ReportAction accessToken="tok" targets={[target]} />);
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
}

function choose(label: string) {
  fireEvent.click(screen.getByRole("radio", { name: label }));
}

function submitButton() {
  return screen.getByRole("button", { name: /Submit report|Submitting/ }) as HTMLButtonElement;
}

const CREATED = { id: "r1", targetType: "post", targetId: "p1", reason: "", status: "open", createdAt: "" };

describe("ReportAction — opening", () => {
  it("a single target opens the report dialog directly, named for what is reported", () => {
    openDialog({ label: "Report comment", targetType: "comment", targetId: "c1" });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Report this comment" })).not.toBeNull();
    expect(screen.getByText("Tell us what’s wrong. Our team will review it.")).not.toBeNull();
  });

  it.each([
    ["post", "Report this post"],
    ["comment", "Report this comment"],
    ["user", "Report this user"],
    ["banter_room", "Report this room"],
  ] as const)("a %s report is titled %s", (targetType, title) => {
    openDialog({ label: "Report", targetType, targetId: "t1" });
    expect(screen.getByRole("heading", { name: title })).not.toBeNull();
  });

  it("more than one target opens a menu first, then the dialog for the picked target", () => {
    render(
      <ReportAction
        accessToken="tok"
        targets={[POST, { label: "Report user", targetType: "user", targetId: "u1" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("button", { name: "Report post" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Report user" }));
    expect(screen.getByRole("heading", { name: "Report this user" })).not.toBeNull();
  });

  it("opens straight away with startOpen, with focus on the first category", () => {
    render(<ReportAction accessToken="tok" targets={[POST]} startOpen onCancel={() => {}} />);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Harassment or bullying" }));
  });

  it("puts focus on the first category when opened from the trigger", () => {
    openDialog();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Harassment or bullying" }));
  });
});

describe("ReportAction — the category step", () => {
  it("offers the nine fixed categories in order, from the one shared label map, none chosen", () => {
    openDialog();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual([...REPORT_REASON_CATEGORIES]);
    expect(radios.map((r) => r.parentElement?.textContent)).toEqual(
      REPORT_REASON_CATEGORIES.map((c) => REPORT_REASON_LABELS[c]),
    );
    expect(REPORT_REASON_OPTIONS).toHaveLength(9);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(screen.getByRole("group", { name: "What’s the problem? (choose one)" })).not.toBeNull();
  });

  it("keeps Submit disabled until a category is chosen", () => {
    openDialog();
    expect(submitButton().disabled).toBe(true);
    choose("Spam or scam");
    expect(submitButton().disabled).toBe(false);
  });

  it("is one choice at a time", () => {
    openDialog();
    choose("Spam or scam");
    choose("Threats or violence");
    const checked = (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => r.checked);
    expect(checked.map((r) => r.value)).toEqual(["threats_or_violence"]);
  });

  it.each(REPORT_REASON_CATEGORIES.filter((c) => c !== "other"))(
    "%s: sends the category and omits the description when none is written",
    async (category) => {
      vi.mocked(createReport).mockResolvedValueOnce(CREATED);
      openDialog();
      choose(REPORT_REASON_LABELS[category]);
      fireEvent.click(submitButton());
      await screen.findByText("Reported — thanks");
      const payload = vi.mocked(createReport).mock.calls[0][1];
      expect(payload).toEqual({ targetType: "post", targetId: "p1", reasonCategory: category, reason: undefined });
      // Nothing is sent for the description: JSON drops an undefined key, and the server rejects an explicit "".
      expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("reason");
    },
  );
});

describe("ReportAction — the description", () => {
  it("is optional for every category but Other, with a counter", () => {
    openDialog();
    choose("Spam or scam");
    expect(screen.getByLabelText("Details (optional)")).not.toBeNull();
    expect(screen.queryByText("Details are required when you choose Other.")).toBeNull();
    expect(screen.getByText("0 / 500")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "abc" } });
    expect(screen.getByText("3 / 500")).not.toBeNull();
  });

  it("is limited to 500 characters", () => {
    openDialog();
    expect(screen.getByLabelText("Details (optional)").getAttribute("maxlength")).toBe("500");
  });

  it("sends a written description, trimmed", async () => {
    vi.mocked(createReport).mockResolvedValueOnce(CREATED);
    openDialog();
    choose("Harassment or bullying");
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "  keeps messaging me  " } });
    fireEvent.click(submitButton());
    await screen.findByText("Reported — thanks");
    expect(createReport).toHaveBeenCalledWith("tok", {
      targetType: "post",
      targetId: "p1",
      reasonCategory: "harassment_or_bullying",
      reason: "keeps messaging me",
    });
  });

  it("a description of only spaces is sent as no description", async () => {
    vi.mocked(createReport).mockResolvedValueOnce(CREATED);
    openDialog();
    choose("Spam or scam");
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "    " } });
    fireEvent.click(submitButton());
    await screen.findByText("Reported — thanks");
    expect(vi.mocked(createReport).mock.calls[0][1].reason).toBeUndefined();
  });

  it("Other: the description becomes required, with the hint, and Submit waits for it", () => {
    openDialog();
    choose("Other");
    expect(screen.getByLabelText("Details (required)")).not.toBeNull();
    expect(screen.getByText("Details are required when you choose Other.")).not.toBeNull();
    expect(screen.getByPlaceholderText("Tell us what the problem is.")).not.toBeNull();
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "   " } });
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "Something else" } });
    expect(submitButton().disabled).toBe(false);
  });

  it("Other with a description sends both", async () => {
    vi.mocked(createReport).mockResolvedValueOnce(CREATED);
    openDialog();
    choose("Other");
    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "Something else" } });
    fireEvent.click(submitButton());
    await screen.findByText("Reported — thanks");
    expect(createReport).toHaveBeenCalledWith("tok", {
      targetType: "post",
      targetId: "p1",
      reasonCategory: "other",
      reason: "Something else",
    });
  });

  it("switching away from Other makes the description optional again, keeping what was typed", () => {
    openDialog();
    choose("Other");
    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "Note" } });
    choose("Spam or scam");
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).value).toBe("Note");
    expect(submitButton().disabled).toBe(false);
  });
});

describe("ReportAction — sending", () => {
  it("shows Submitting… and locks the form while the request is in flight, then the confirmation", async () => {
    let resolve!: (v: typeof CREATED) => void;
    vi.mocked(createReport).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    openDialog();
    choose("Spam or scam");
    fireEvent.click(submitButton());

    expect(screen.getByRole("button", { name: "Submitting…" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    // The radios sit in a disabled <fieldset>, so they match :disabled without carrying the attribute.
    expect(screen.getByRole("radio", { name: "Spam or scam" }).matches(":disabled")).toBe(true);

    await act(async () => resolve(CREATED));
    expect(await screen.findByText("Reported — thanks")).not.toBeNull();
    expect(screen.getByText("Our team will review it.")).not.toBeNull();
  });

  it("a second click while sending does not send twice", () => {
    vi.mocked(createReport).mockReturnValueOnce(new Promise(() => {}));
    openDialog();
    choose("Spam or scam");
    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Submitting…" }));
    expect(createReport).toHaveBeenCalledTimes(1);
  });

  it("Close on the confirmation leaves a plain 'Reported' note in place of the trigger", async () => {
    vi.mocked(createReport).mockResolvedValueOnce(CREATED);
    openDialog();
    choose("Spam or scam");
    fireEvent.click(submitButton());
    await screen.findByText("Reported — thanks");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Reported")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });
});

describe("ReportAction — errors the server can return", () => {
  async function failWith(error: unknown, category = "Spam or scam", details?: string) {
    vi.mocked(createReport).mockRejectedValueOnce(error);
    openDialog();
    choose(category);
    if (details !== undefined) {
      fireEvent.change(screen.getByLabelText(/Details/), { target: { value: details } });
    }
    fireEvent.click(submitButton());
    return screen.findByRole("alert");
  }

  it("400 report_reason_required: shows the server's sentence, stays on the form", async () => {
    const alert = await failWith(
      new ModerationApiError("Please describe the problem in a few words.", {
        status: 400,
        code: "report_reason_required",
      }),
      "Other",
      "x",
    );
    expect(alert.textContent).toBe("Please describe the problem in a few words.");
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("400 without a known code (a validation message): a plain sentence, not the server's technical text", async () => {
    const alert = await failWith(
      new ModerationApiError("reasonCategory must be one of the following values: harassment_or_bullying", {
        status: 400,
      }),
    );
    expect(alert.textContent).toBe("Couldn't submit that report. Check your choices and try again.");
  });

  it("404: the server's own message (the target is gone)", async () => {
    const alert = await failWith(new ModerationApiError("Post not found", { status: 404 }));
    expect(alert.textContent).toBe("Post not found");
  });

  it("429: a plain sentence, not the rate limiter's exception text", async () => {
    const alert = await failWith(
      new ModerationApiError("ThrottlerException: Too Many Requests", { status: 429 }),
    );
    expect(alert.textContent).toBe("You're sending reports too quickly. Please wait a moment and try again.");
  });

  it("401: asks the person to log in again", async () => {
    const alert = await failWith(new ModerationApiError("Unauthorized", { status: 401 }));
    expect(alert.textContent).toBe("Please log in again to send a report.");
  });

  it("network failure: the unreachable-server message", async () => {
    const alert = await failWith(new ModerationApiError("Couldn't reach the Soccernity server."));
    expect(alert.textContent).toBe("Couldn't reach the Soccernity server.");
  });

  it("an unexpected error: a generic sentence", async () => {
    const alert = await failWith(new Error("boom"));
    expect(alert.textContent).toBe("Couldn't submit that report. Please try again.");
  });

  it("keeps the chosen category and the typed description after an error, and can be retried", async () => {
    vi.mocked(createReport)
      .mockRejectedValueOnce(new ModerationApiError("Couldn't submit that report (500).", { status: 500 }))
      .mockResolvedValueOnce(CREATED);
    openDialog();
    choose("Harassment or bullying");
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "details" } });
    fireEvent.click(submitButton());
    await screen.findByRole("alert");

    expect((screen.getByRole("radio", { name: "Harassment or bullying" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).value).toBe("details");
    expect(submitButton().disabled).toBe(false);

    fireEvent.click(submitButton());
    expect(await screen.findByText("Reported — thanks")).not.toBeNull();
    expect(createReport).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ReportAction — closing and keyboard", () => {
  it("Cancel closes the dialog without sending anything and returns focus to the trigger", async () => {
    openDialog();
    choose("Spam or scam");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Report" })));
    expect(createReport).not.toHaveBeenCalled();
  });

  it("starts empty again after being cancelled and reopened", () => {
    openDialog();
    choose("Spam or scam");
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect((screen.getAllByRole("radio") as HTMLInputElement[]).some((r) => r.checked)).toBe(false);
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).value).toBe("");
  });

  it("Escape closes the dialog", () => {
    openDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createReport).not.toHaveBeenCalled();
  });

  it("Escape does nothing while a report is being sent", () => {
    vi.mocked(createReport).mockReturnValueOnce(new Promise(() => {}));
    openDialog();
    choose("Spam or scam");
    fireEvent.click(submitButton());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("a click on the backdrop closes the dialog, a click inside does not", () => {
    openDialog();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByTestId("report-dialog-overlay"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Tab inside the dialog: from the last control to the first, and back", () => {
    openDialog();
    choose("Spam or scam");
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getAllByRole("radio")[0]);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("with startOpen, Cancel hands control back to the caller and shows no trigger of its own", () => {
    const onCancel = vi.fn();
    render(<ReportAction accessToken="tok" targets={[POST]} startOpen onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });
});
