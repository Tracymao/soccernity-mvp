// ReportPage (the public /report form). Same conventions as GrassrootsRegisterTeamPage.test.tsx: plain DOM
// assertions, mocks src/api/moderation.ts. POST /reports/public is a real merged endpoint — exercising it live
// is services/api's own test suite's job (public-reports.controller.http.spec.ts). B-284 (Decision Log #465)
// added the reason category step; the category labels are shared with the in-app dialog (ReportAction.test.tsx).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ReportPage from "./ReportPage";
import { ModerationApiError, REPORT_REASON_CATEGORIES, type PublicReport } from "../api/moderation";
import { REPORT_REASON_LABELS } from "../lib/reportReasons";

vi.mock("../api/moderation", async () => {
  const actual = await vi.importActual<typeof import("../api/moderation")>("../api/moderation");
  return { ...actual, createPublicReport: vi.fn() };
});

import { createPublicReport } from "../api/moderation";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";

const CREATED: PublicReport = {
  id: "report-new",
  targetType: "post",
  targetId: TARGET_ID,
  reason: "",
  concernsMinor: true,
  status: "open",
  createdAt: "2026-09-27T00:00:00.000Z",
};

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(createPublicReport).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportPage />
    </MemoryRouter>,
  );
}

/** Email and target ID only; the category (and any description) is each test's own. */
function fillBasics() {
  fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "concerned-parent@example.com" } });
  fireEvent.change(screen.getByLabelText("Where can we find it?"), { target: { value: TARGET_ID } });
}

function choose(label: string) {
  fireEvent.click(screen.getByRole("radio", { name: label }));
}

function submitButton() {
  return screen.getByRole("button", { name: /Submit report|Submitting/ }) as HTMLButtonElement;
}

describe("ReportPage", () => {
  it("has no session gate at all -- renders the form with nothing in storage", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Report a concern" })).not.toBeNull();
    expect(createPublicReport).not.toHaveBeenCalled();
  });

  it("links to support@soccernity.com for a reporter with no ID to paste in", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "support@soccernity.com" });
    expect(link.getAttribute("href")).toBe("mailto:support@soccernity.com?subject=Report%20a%20concern");
  });
});

describe("ReportPage — the category step", () => {
  it("shows the nine fixed categories, in order, with the shared labels, none chosen", () => {
    renderPage();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual([...REPORT_REASON_CATEGORIES]);
    expect(radios.map((r) => r.parentElement?.textContent)).toEqual(
      REPORT_REASON_CATEGORIES.map((c) => REPORT_REASON_LABELS[c]),
    );
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(screen.getByRole("group", { name: "What’s the problem? (choose one)" })).not.toBeNull();
  });

  it("sits after 'Where can we find it?' and before the description", () => {
    renderPage();
    const find = screen.getByLabelText("Where can we find it?");
    const group = screen.getByRole("group", { name: "What’s the problem? (choose one)" });
    const details = screen.getByLabelText("Details (optional)");
    expect(find.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Submit disabled until email, target ID and a category are given", () => {
    renderPage();
    expect(submitButton().disabled).toBe(true);
    fillBasics();
    expect(submitButton().disabled).toBe(true);
    choose("Spam or scam");
    expect(submitButton().disabled).toBe(false);
  });

  it("an empty email or an empty target ID keeps Submit disabled even with a category", () => {
    renderPage();
    choose("Spam or scam");
    expect(submitButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "a@b.com" } });
    expect(submitButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Where can we find it?"), { target: { value: TARGET_ID } });
    expect(submitButton().disabled).toBe(false);
  });

  it.each(REPORT_REASON_CATEGORIES.filter((c) => c !== "other"))(
    "%s: submits the category with no description when none is written",
    async (category) => {
      vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
      renderPage();
      fillBasics();
      choose(REPORT_REASON_LABELS[category]);
      fireEvent.click(submitButton());

      await waitFor(() => expect(createPublicReport).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createPublicReport).mock.calls[0][0];
      expect(payload).toEqual({
        reporterContactEmail: "concerned-parent@example.com",
        targetType: "post",
        targetId: TARGET_ID,
        reasonCategory: category,
        reason: undefined,
        concernsMinor: false,
      });
      expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("reason");
    },
  );
});

describe("ReportPage — the description", () => {
  it("is optional, with a counter and a 500-character limit", () => {
    renderPage();
    choose("Spam or scam");
    const field = screen.getByLabelText("Details (optional)");
    expect(field.getAttribute("maxlength")).toBe("500");
    expect(screen.getByText("0 / 500")).not.toBeNull();
    fireEvent.change(field, { target: { value: "abcd" } });
    expect(screen.getByText("4 / 500")).not.toBeNull();
  });

  it("is sent, trimmed, when written", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Privacy or image misuse");
    fireEvent.change(screen.getByLabelText("Details (optional)"), {
      target: { value: "  This photo shows my child without consent.  " },
    });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith({
        reporterContactEmail: "concerned-parent@example.com",
        targetType: "post",
        targetId: TARGET_ID,
        reasonCategory: "privacy_or_image_misuse",
        reason: "This photo shows my child without consent.",
        concernsMinor: false,
      }),
    );
  });

  it("Other: becomes required, with the hint, and Submit waits for a real description", () => {
    renderPage();
    fillBasics();
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
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Other");
    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "Something else" } });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCategory: "other", reason: "Something else" }),
      ),
    );
  });

  it("choosing another category after Other makes it optional again, keeping the text", () => {
    renderPage();
    fillBasics();
    choose("Other");
    fireEvent.change(screen.getByLabelText("Details (required)"), { target: { value: "Note" } });
    choose("Spam or scam");
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).value).toBe("Note");
    expect(submitButton().disabled).toBe(false);
  });
});

describe("ReportPage — the rest of the form", () => {
  it("submits the chosen target type and a checked 'this involves a child' box", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Child safety concern");
    fireEvent.change(screen.getByLabelText("What are you reporting?"), { target: { value: "user" } });
    fireEvent.click(screen.getByLabelText("This involves a child"));
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: "user", reasonCategory: "child_safety_concern", concernsMinor: true }),
      ),
    );
  });

  it("choosing the child safety category does not tick 'this involves a child' on its own", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Child safety concern");
    expect((screen.getByLabelText("This involves a child") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith(expect.objectContaining({ concernsMinor: false })),
    );
  });
});

describe("ReportPage — sending", () => {
  it("shows Submitting… and locks the category and description while sending", () => {
    vi.mocked(createPublicReport).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    fillBasics();
    choose("Spam or scam");
    fireEvent.click(submitButton());

    expect(screen.getByRole("button", { name: "Submitting…" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Spam or scam" }).matches(":disabled")).toBe(true);
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("shows a real confirmation state naming the submitted email, not a stub", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Spam or scam");
    fireEvent.click(submitButton());

    expect(await screen.findByRole("heading", { name: "Report submitted" })).not.toBeNull();
    expect(screen.getByText(/we.ve sent a confirmation to/i)).not.toBeNull();
    expect(screen.getByText("concerned-parent@example.com")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to Soccernity" }).getAttribute("href")).toBe("/");
    // The form is gone.
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("ReportPage — errors the server can return", () => {
  async function failWith(error: unknown, category = "Spam or scam", details?: string) {
    vi.mocked(createPublicReport).mockRejectedValueOnce(error);
    renderPage();
    fillBasics();
    choose(category);
    if (details !== undefined) fireEvent.change(screen.getByLabelText(/Details/), { target: { value: details } });
    fireEvent.click(submitButton());
    return screen.findByRole("alert");
  }

  it("400 report_reason_required: the server's sentence, form kept", async () => {
    const alert = await failWith(
      new ModerationApiError("Please describe the problem in a few words.", {
        status: 400,
        code: "report_reason_required",
      }),
      "Other",
      "x",
    );
    expect(alert.textContent).toBe("Please describe the problem in a few words.");
    expect(screen.queryByRole("heading", { name: "Report submitted" })).toBeNull();
    expect((screen.getByRole("radio", { name: "Other" }) as HTMLInputElement).checked).toBe(true);
  });

  it("400 without a known code (a validation message): a plain sentence", async () => {
    const alert = await failWith(
      new ModerationApiError("reporterContactEmail must be an email", { status: 400 }),
    );
    expect(alert.textContent).toBe("Couldn't submit that report. Check your choices and try again.");
  });

  it("404 (target not found): the server's message", async () => {
    const alert = await failWith(new ModerationApiError("Post not found", { status: 404 }));
    expect(alert.textContent).toMatch(/post not found/i);
    expect(screen.queryByRole("heading", { name: "Report submitted" })).toBeNull();
  });

  it("429 (the route's rate limit): a plain sentence", async () => {
    const alert = await failWith(new ModerationApiError("ThrottlerException: Too Many Requests", { status: 429 }));
    expect(alert.textContent).toBe("You're sending reports too quickly. Please wait a moment and try again.");
  });

  it("a server error: the generic message", async () => {
    const alert = await failWith(new ModerationApiError("Couldn't submit that report (500).", { status: 500 }));
    expect(alert.textContent).toMatch(/couldn.t submit that report/i);
  });

  it("a network failure: the unreachable-server message", async () => {
    const alert = await failWith(new ModerationApiError("Couldn't reach the Soccernity server."));
    expect(alert.textContent).toBe("Couldn't reach the Soccernity server.");
  });

  it("keeps everything typed after an error, and a retry can succeed", async () => {
    vi.mocked(createPublicReport)
      .mockRejectedValueOnce(new ModerationApiError("Couldn't submit that report (500).", { status: 500 }))
      .mockResolvedValueOnce(CREATED);
    renderPage();
    fillBasics();
    choose("Harassment or bullying");
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "details" } });
    fireEvent.click(submitButton());
    await screen.findByRole("alert");

    expect((screen.getByLabelText("Your email") as HTMLInputElement).value).toBe("concerned-parent@example.com");
    expect((screen.getByRole("radio", { name: "Harassment or bullying" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Details (optional)") as HTMLTextAreaElement).value).toBe("details");

    fireEvent.click(submitButton());
    expect(await screen.findByRole("heading", { name: "Report submitted" })).not.toBeNull();
    expect(createPublicReport).toHaveBeenCalledTimes(2);
  });
});
