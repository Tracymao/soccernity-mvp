// "Messages around the reported one" on Report Detail for a message report (B-286, Decision Log #477;
// backend/b286-message-report-context). Figma admin frames 7027:59180 (messages included) and 7027:59472 (none).
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, listReports: vi.fn(), getReportById: vi.fn(), actionReport: vi.fn() };
});

import {
  getReportById,
  type Report,
  type ReportContextMessage,
  type ReportedMessage,
} from "../../api/moderation";
import ReportDetailPage from "./ReportDetailPage";
import { CONTEXT_NONE_INCLUDED } from "./ContextMessagesCard";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(getReportById).mockReset();
  vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "unavailable"));
});

function reported(overrides: Partial<ReportedMessage> = {}): ReportedMessage {
  return {
    id: "m-reported",
    sentAt: "2026-11-02T08:05:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    contentText: "You are useless, quit the team and stop messaging me.",
    originalContentText: null,
    editedAt: null,
    deletedForEveryone: false,
    ...overrides,
  };
}

function context(overrides: Partial<ReportContextMessage> & { id: string }): ReportContextMessage {
  return {
    sentAt: "2026-11-02T08:00:00.000Z",
    sender: { publicName: "matthew_amuloko" },
    sentByReporter: false,
    contentText: "text",
    originalContentText: null,
    editedAt: null,
    deletedForEveryone: false,
    ...overrides,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-open-1234",
    reporterId: "reporter-abcd",
    reporterContactEmail: null,
    reporterContactName: null,
    targetType: "message",
    targetId: "m-reported",
    reasonCategory: "harassment_or_bullying",
    reason: "Insults the player each week.",
    status: "open",
    createdAt: "2026-11-02T10:00:00.000Z",
    concernsMinor: false,
    severity: "medium",
    reviewedByAdminId: null,
    reviewedAt: null,
    actionTaken: null,
    appealStatus: null,
    appealReason: null,
    appealedAt: null,
    appealReviewedByAdminId: null,
    appealReviewedAt: null,
    escalatedAt: null,
    escalatedByAdminId: null,
    escalationNotes: null,
    escalatedToAuthority: false,
    ...overrides,
  };
}

function renderDetail(r: Report, withState = true) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/moderation/reports/${r.id}`, state: withState ? { report: r } : undefined }]}
    >
      <Routes>
        <Route path="/moderation/reports/:id" element={<ReportDetailPage /> as ReactNode} />
      </Routes>
    </MemoryRouter>,
  );
}

function card(): HTMLElement {
  return screen.getByRole("heading", { name: "Messages around the reported one" }).closest(".mod-card") as HTMLElement;
}

describe("Report Detail: messages around the reported one", () => {
  it("lists the chosen messages oldest first with the reported message highlighted in its place", async () => {
    const r = report({
      reportedMessage: reported(),
      contextMessages: [
        // The server returns them oldest first; the reported message is slotted in by time.
        context({ id: "m-1", sentAt: "2026-11-02T07:57:00.000Z", sentByReporter: true, contentText: "Please stop." }),
        context({ id: "m-2", sentAt: "2026-11-02T08:00:00.000Z", contentText: "Or what?" }),
        context({ id: "m-3", sentAt: "2026-11-02T08:06:00.000Z", sentByReporter: true, contentText: "I am not quitting." }),
      ],
    });
    renderDetail(r);
    const items = within(await waitFor(card)).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".mod-context__text")?.textContent)).toEqual([
      "Please stop.",
      "Or what?",
      "You are useless, quit the team and stop messaging me.",
      "I am not quitting.",
    ]);
    // Highlighted, and marked as the current item for assistive technology.
    expect(items[2].getAttribute("aria-current")).toBe("true");
    expect(within(items[2]).getByText("Reported message")).toBeTruthy();
    expect(items.filter((li) => li.getAttribute("aria-current") === "true")).toHaveLength(1);
    // The reporter's own messages carry a pill; the other person's do not.
    expect(within(items[0]).getByText("Reporter")).toBeTruthy();
    expect(within(items[1]).queryByText("Reporter")).toBeNull();
    expect(within(items[3]).getByText("Reporter")).toBeTruthy();
    // Sender is the public name only.
    expect(within(items[1]).getByText("matthew_amuloko")).toBeTruthy();
  });

  it("shows the description line and no gap rows (the server returns no counts for what was not chosen)", async () => {
    renderDetail(report({ reportedMessage: reported(), contextMessages: [context({ id: "m-1" })] }));
    const c = await waitFor(card);
    expect(c.textContent).toContain("Chosen by the reporter, oldest first.");
    expect(c.textContent).toContain("Messages the reporter did not choose are not shown.");
    expect(c.textContent).not.toMatch(/were not included/);
  });

  it("marks an edited message with Edited and its original text, and a deleted one with Deleted by the sender", async () => {
    const r = report({
      reportedMessage: reported(),
      contextMessages: [
        context({
          id: "m-1",
          sentAt: "2026-11-02T08:06:00.000Z",
          contentText: "I am not quitting.",
          originalContentText: "I might quit.",
          editedAt: "2026-11-02T08:09:00.000Z",
          sentByReporter: true,
        }),
        context({
          id: "m-2",
          sentAt: "2026-11-02T08:07:00.000Z",
          contentText: "Stop.",
          deletedForEveryone: true,
        }),
      ],
    });
    renderDetail(r);
    const items = within(await waitFor(card)).getAllByRole("listitem");
    const edited = items.find((li) => li.textContent?.includes("I am not quitting."))!;
    expect(within(edited).getByText("Edited")).toBeTruthy();
    expect(edited.textContent).toContain("Original: “I might quit.”");
    const deleted = items.find((li) => li.textContent?.includes("Stop."))!;
    expect(within(deleted).getByText("Deleted by the sender")).toBeTruthy();
    // The text of a deleted message is kept for review.
    expect(deleted.querySelector(".mod-context__text")?.textContent).toBe("Stop.");
  });

  it("with no messages chosen it says so in one sentence and lists nothing", async () => {
    renderDetail(report({ reportedMessage: reported(), contextMessages: [] }));
    const c = await waitFor(card);
    expect(c.textContent).toContain(CONTEXT_NONE_INCLUDED);
    expect(within(c).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows no card for a post report, or before the message has been read", async () => {
    renderDetail(report({ targetType: "post", targetId: "p-1" }));
    await screen.findByText("Reported content");
    expect(screen.queryByText("Messages around the reported one")).toBeNull();
  });

  it("a report handed over from the queue reads the single report and then shows the card", async () => {
    // The queue row carries neither the message nor the context.
    const handed = report();
    vi.mocked(getReportById).mockResolvedValue(
      report({
        reportedMessage: reported(),
        contextMessages: [context({ id: "m-1", contentText: "Or what?" })],
        holds: [],
      }),
    );
    renderDetail(handed);
    expect(screen.queryByText("Messages around the reported one")).toBeNull();
    const c = await waitFor(card);
    expect(c.textContent).toContain("Or what?");
    expect(getReportById).toHaveBeenCalledTimes(1);
  });

  it("a direct visit (no hand-over) shows the card from the single-report read", async () => {
    vi.mocked(getReportById).mockResolvedValue(
      report({ reportedMessage: reported(), contextMessages: [], holds: [] }),
    );
    renderDetail(report(), false);
    const c = await waitFor(card);
    expect(c.textContent).toContain(CONTEXT_NONE_INCLUDED);
  });

  it("when the reported message is gone and nothing was attached, the card is left out", async () => {
    renderDetail(report({ reportedMessage: null, contextMessages: [] }));
    await screen.findByText("Reported content");
    expect(screen.queryByText("Messages around the reported one")).toBeNull();
  });

  it("when the reported message is gone but context messages remain, they are still listed", async () => {
    renderDetail(report({ reportedMessage: null, contextMessages: [context({ id: "m-1", contentText: "Or what?" })] }));
    const c = await waitFor(card);
    expect(c.textContent).toContain("Or what?");
    expect(within(c).queryByText("Reported message")).toBeNull();
  });

  it("offers no control that removes or changes a message", async () => {
    renderDetail(report({ reportedMessage: reported(), contextMessages: [context({ id: "m-1" })] }));
    const c = await waitFor(card);
    expect(within(c).queryAllByRole("button")).toHaveLength(0);
  });
});
