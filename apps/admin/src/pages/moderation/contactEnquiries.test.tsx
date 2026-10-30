// B-046 part B (Decision Log #444, #445): the Contact enquiries tab, Enquiry Detail, the Escalate dialog and the
// Report Detail view for a report made from an enquiry.
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/contactEnquiries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/contactEnquiries")>();
  return {
    ...actual,
    listContactEnquiries: vi.fn(),
    getContactEnquiry: vi.fn(),
    setContactEnquiryHandled: vi.fn(),
    escalateContactEnquiry: vi.fn(),
  };
});
vi.mock("../../api/moderation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/moderation")>();
  return { ...actual, listReports: vi.fn(), getReportById: vi.fn(), actionReport: vi.fn() };
});

import {
  escalateContactEnquiry,
  getContactEnquiry,
  listContactEnquiries,
  setContactEnquiryHandled,
  type ContactEnquiryDetail,
  type ContactEnquiryListItem,
} from "../../api/contactEnquiries";
import { actionReport, CHILD_SAFETY_VETTING_REQUIRED_CODE, getReportById, listReports, type Report } from "../../api/moderation";
import ContactEnquiriesPage from "./ContactEnquiriesPage";
import ContactEnquiryDetailPage from "./ContactEnquiryDetailPage";
import ModerationQueuePage from "./ModerationQueuePage";
import ReportDetailPage from "./ReportDetailPage";

afterEach(() => {
  cleanup();
});
beforeEach(() => {
  vi.mocked(listContactEnquiries).mockReset();
  vi.mocked(getContactEnquiry).mockReset();
  vi.mocked(setContactEnquiryHandled).mockReset();
  vi.mocked(escalateContactEnquiry).mockReset();
  vi.mocked(listReports).mockReset();
  vi.mocked(getReportById).mockReset();
  vi.mocked(actionReport).mockReset();
});

const ENQUIRY_ID = "318a1b2c-0000-4000-8000-000000000318";
const REPORT_ID = "1043d4e5-0000-4000-8000-000000001043";
const GOOD_REASON = "The message describes a safety concern.";

function listItem(overrides: Partial<ContactEnquiryListItem> = {}): ContactEnquiryListItem {
  return {
    id: ENQUIRY_ID,
    name: "Chioma Eze",
    email: "chioma.eze@example.com",
    category: "technical_issues",
    subject: "Score not updating",
    status: "new",
    createdAt: "2026-10-29T10:00:00.000Z",
    lastMessageAt: "2026-10-29T10:00:00.000Z",
    handledAt: null,
    handledByAdminId: null,
    submitter: "signed_in",
    hasEscalation: false,
    ...overrides,
  };
}

function detail(overrides: Partial<ContactEnquiryDetail> = {}): ContactEnquiryDetail {
  return {
    ...listItem(),
    message: "The live score for last night’s match has been stuck at 0–0 since half time.",
    userId: "user-1",
    escalatedReportId: null,
    ...overrides,
  };
}

function enquiryReport(overrides: Partial<Report> = {}): Report {
  return {
    id: REPORT_ID,
    reporterId: null,
    reporterContactEmail: "chioma.eze@example.com",
    reporterContactName: "Chioma Eze",
    targetType: "enquiry",
    targetId: ENQUIRY_ID,
    reason: "Contact enquiry (Technical issues) - Score not updating: The live score…",
    status: "open",
    createdAt: "2026-10-30T08:00:00.000Z",
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
    source: "contact_enquiry",
    ...overrides,
  };
}

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderAt(ui: ReactNode, routePath: string, initialEntry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function vettingRequiredError(): AdminApiError {
  return new AdminApiError(403, "This action requires a child-safety-vetted admin.", {
    statusCode: 403,
    code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
    message: "This action requires a child-safety-vetted admin.",
  });
}

// ---------------------------------------------------------------------------------------------------
// The tab (list)
// ---------------------------------------------------------------------------------------------------

describe("ContactEnquiriesPage", () => {
  function renderPage() {
    return renderAt(<ContactEnquiriesPage />, "/moderation/contact-enquiries", "/moderation/contact-enquiries");
  }

  it("lists the enquiries with the drawn columns, status pills, source and the Escalated flag", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({
      items: [
        listItem(),
        listItem({ id: "e2", name: "Daniel Okafor", category: "editorial_complaints", subject: "Article correction", submitter: "guest" }),
        listItem({ id: "e3", name: "Seun Ajayi", status: "handled", hasEscalation: true, category: "data", subject: "Wrong fixture time" }),
        listItem({ id: "e4", name: "Amara Nwosu", category: "livescores_issues", subject: "Late scores" }),
      ],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText("Chioma Eze")).not.toBeNull();
    const table = screen.getByRole("table", { name: "Contact enquiries" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Received",
      "Name",
      "Email",
      "Category",
      "Subject",
      "Status",
      "Source",
      "Flags",
      "Action",
    ]);
    // Dates and wording as the frame draws them; the data/livescores label is split in two.
    expect(within(table).getAllByText("29 Oct 2026")).toHaveLength(4);
    expect(within(table).getByText("Technical issues")).not.toBeNull();
    expect(within(table).getByText("Editorial Complaints")).not.toBeNull();
    expect(within(table).getByText("Data")).not.toBeNull();
    expect(within(table).getByText("Livescores Issues")).not.toBeNull();
    expect(within(table).getAllByText("New")).toHaveLength(3);
    expect(within(table).getByText("Handled")).not.toBeNull();
    expect(within(table).getByText("Guest")).not.toBeNull();
    expect(within(table).getAllByText("Signed-in")).toHaveLength(3);
    // Only the escalated enquiry carries the flag.
    expect(within(table).getAllByText("Escalated")).toHaveLength(1);
    expect(listContactEnquiries).toHaveBeenCalledWith({ limit: 50 });
  });

  it("shows no message text and no count in the tab label (the list carries neither)", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [listItem()], nextCursor: null });
    renderPage();
    await screen.findByText("Chioma Eze");
    expect(screen.queryByText(/stuck at 0/)).toBeNull();
    expect(screen.getByText("Contact enquiries", { selector: "span.mod-tab" })).not.toBeNull();
    expect(screen.queryByText(/Contact enquiries \(\d+\)/)).toBeNull();
  });

  it("links each row's Open button to its enquiry and the tab strip back to the queue", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [listItem()], nextCursor: null });
    renderPage();
    const open = await screen.findByRole("link", { name: /Open enquiry from Chioma Eze/ });
    expect(open.getAttribute("href")).toBe(`/moderation/contact-enquiries/${ENQUIRY_ID}`);
    expect(open.textContent).toBe("Open");
    expect(screen.getByRole("link", { name: "Open Reports" }).getAttribute("href")).toBe("/moderation");
    expect(screen.getByRole("link", { name: "Appeals" }).getAttribute("href")).toBe("/moderation?tab=appeals");
  });

  it("asks the server for the chosen status and category when Apply filter is pressed", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [listItem()], nextCursor: null });
    renderPage();
    await screen.findByText("Chioma Eze");

    // Choosing a value alone does nothing; Apply filter sends it.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "handled" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "livescores_issues" } });
    expect(listContactEnquiries).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() =>
      expect(listContactEnquiries).toHaveBeenLastCalledWith({ status: "handled", category: "livescores_issues", limit: 50 }),
    );

    // Back to All drops the filters.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(listContactEnquiries).toHaveBeenLastCalledWith({ limit: 50 }));
  });

  it("offers all six server categories and both statuses, with the drawn hints", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await screen.findByText("No contact enquiries");
    const category = screen.getByLabelText("Category");
    expect(within(category).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All",
      "Technical issues",
      "Editorial Complaints",
      "Data",
      "Livescores Issues",
      "Suggestions",
      "Enquiries/Feedback",
    ]);
    expect(within(screen.getByLabelText("Status")).getAllByRole("option").map((o) => o.textContent)).toEqual(["All", "New", "Handled"]);
    expect(screen.getByText("New, handled or all.")).not.toBeNull();
    expect(screen.getByText("Any category from the Contact Us form.")).not.toBeNull();
  });

  it("shows the empty state", async () => {
    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No contact enquiries")).not.toBeNull();
    expect(screen.getByText("Messages sent through the Contact Us form will appear here.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a loading line while the first page loads", async () => {
    let resolve: (v: { items: ContactEnquiryListItem[]; nextCursor: null }) => void = () => {};
    vi.mocked(listContactEnquiries).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    expect(screen.getByText("Loading the contact enquiries…")).not.toBeNull();
    await act(async () => resolve({ items: [], nextCursor: null }));
    expect(await screen.findByText("No contact enquiries")).not.toBeNull();
  });

  it("shows the drawn load error and a Retry that asks again", async () => {
    vi.mocked(listContactEnquiries).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn’t load the contact enquiries")).not.toBeNull();
    expect(within(alert).getByText(/Check the connection and try again\./)).not.toBeNull();
    expect(screen.queryByText("No contact enquiries")).toBeNull();

    vi.mocked(listContactEnquiries).mockResolvedValue({ items: [listItem()], nextCursor: null });
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Chioma Eze")).not.toBeNull();
    expect(screen.queryByText("Couldn’t load the contact enquiries")).toBeNull();
  });

  it("loads the next page when Load more is pressed and appends it", async () => {
    vi.mocked(listContactEnquiries)
      .mockResolvedValueOnce({ items: [listItem()], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [listItem({ id: "e2", name: "Second Person" })], nextCursor: null });
    renderPage();
    await screen.findByText("Chioma Eze");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second Person")).not.toBeNull();
    expect(screen.getByText("Chioma Eze")).not.toBeNull();
    expect(listContactEnquiries).toHaveBeenLastCalledWith({ cursor: "cursor-2", limit: 50 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the loaded rows and says so when a further page fails", async () => {
    vi.mocked(listContactEnquiries)
      .mockResolvedValueOnce({ items: [listItem()], nextCursor: "cursor-2" })
      .mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderPage();
    await screen.findByText("Chioma Eze");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn’t load more enquiries. Try again.")).not.toBeNull();
    expect(screen.getByText("Chioma Eze")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// The queue's tab row
// ---------------------------------------------------------------------------------------------------

describe("ModerationQueuePage tab row", () => {
  it("has a Contact enquiries tab that links to the inbox", async () => {
    vi.mocked(listReports).mockResolvedValue({ items: [], nextCursor: null });
    renderAt(<ModerationQueuePage />, "/moderation", "/moderation");
    await screen.findByText("No open reports");
    expect(screen.getByRole("link", { name: "Contact enquiries" }).getAttribute("href")).toBe("/moderation/contact-enquiries");
  });

  it("opens on the Appeals tab when linked with ?tab=appeals", async () => {
    vi.mocked(listReports).mockResolvedValue({ items: [], nextCursor: null });
    renderAt(<ModerationQueuePage />, "/moderation", "/moderation?tab=appeals");
    expect(await screen.findByText("No pending appeals")).not.toBeNull();
    expect(listReports).toHaveBeenCalledWith({ status: "actioned", limit: 50 });
  });

  it("labels an enquiry report in the queue as a contact enquiry from Contact Us", async () => {
    vi.mocked(listReports).mockResolvedValue({ items: [enquiryReport()], nextCursor: null });
    renderAt(<ModerationQueuePage />, "/moderation", "/moderation");
    expect(await screen.findByText("Contact enquiry")).not.toBeNull();
    expect(screen.getByText("Contact Us")).not.toBeNull();
    expect(screen.queryByText("Public report")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// Enquiry Detail
// ---------------------------------------------------------------------------------------------------

describe("ContactEnquiryDetailPage", () => {
  function renderPage() {
    return renderAt(<ContactEnquiryDetailPage />, "/moderation/contact-enquiries/:id", `/moderation/contact-enquiries/${ENQUIRY_ID}`);
  }

  it("shows the enquiry, the message, the actions and the retention line", async () => {
    vi.mocked(getContactEnquiry).mockResolvedValue(detail());
    renderPage();

    expect(await screen.findByRole("heading", { name: "Enquiry #318a1b2c" })).not.toBeNull();
    expect(getContactEnquiry).toHaveBeenCalledWith(ENQUIRY_ID);
    expect(screen.getByRole("link", { name: "← Contact enquiries" }).getAttribute("href")).toBe("/moderation/contact-enquiries");

    const card = screen.getByRole("region", { name: "Enquiry" });
    for (const [label, value] of [
      ["Name", "Chioma Eze"],
      ["Email", "chioma.eze@example.com"],
      ["Category", "Technical issues"],
      ["Subject", "Score not updating"],
      ["Received", "29 Oct 2026"],
      ["Source", "Signed-in"],
    ]) {
      expect(within(card).getByText(label)).not.toBeNull();
      expect(within(card).getByText(value)).not.toBeNull();
    }
    expect(within(card).queryByText("Report")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Message" })).getByText(/stuck at 0–0 since half time/)).not.toBeNull();
    expect(screen.getByText("New")).not.toBeNull();
    expect(screen.queryByText("Escalated")).toBeNull();

    expect(screen.getByRole("button", { name: "Mark handled" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Escalate to a report" })).not.toBeNull();
    expect(screen.getByText("Reply by email opens your email app with the sender’s address filled in.")).not.toBeNull();
    expect(
      screen.getByText(
        "Enquiries are deleted automatically 12 months after the last message. If you escalate one, the report’s retention applies instead. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();
  });

  it("Reply by email is a mailto link to the sender's address and calls nothing", async () => {
    vi.mocked(getContactEnquiry).mockResolvedValue(detail());
    renderPage();
    const reply = await screen.findByRole("link", { name: "Reply by email" });
    expect(reply.getAttribute("href")).toBe("mailto:chioma.eze@example.com");
    expect(setContactEnquiryHandled).not.toHaveBeenCalled();
    expect(escalateContactEnquiry).not.toHaveBeenCalled();
  });

  it("marks the enquiry handled and shows Reopen, then reopens it", async () => {
    vi.mocked(getContactEnquiry).mockResolvedValue(detail());
    vi.mocked(setContactEnquiryHandled)
      .mockResolvedValueOnce(detail({ status: "handled", handledAt: "2026-10-30T09:00:00.000Z", handledByAdminId: "admin-1" }))
      .mockResolvedValueOnce(detail());
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Mark handled" }));
    expect(await screen.findByRole("button", { name: "Reopen" })).not.toBeNull();
    expect(setContactEnquiryHandled).toHaveBeenLastCalledWith(ENQUIRY_ID, true);
    expect(screen.getByText("Handled")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByRole("button", { name: "Mark handled" })).not.toBeNull();
    expect(setContactEnquiryHandled).toHaveBeenLastCalledWith(ENQUIRY_ID, false);
    expect(screen.getByText("New")).not.toBeNull();
  });

  it("disables the button while saving and shows the server's message when it fails", async () => {
    vi.mocked(getContactEnquiry).mockResolvedValue(detail());
    let reject: (e: unknown) => void = () => {};
    vi.mocked(setContactEnquiryHandled).mockReturnValue(new Promise((_, r) => (reject = r)));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Mark handled" }));
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new AdminApiError(404, "Contact enquiry not found")));
    expect((await screen.findByRole("alert")).textContent).toBe("Contact enquiry not found");
    // Nothing changed on screen.
    expect(screen.getByRole("button", { name: "Mark handled" })).not.toBeNull();
    expect(screen.getByText("New")).not.toBeNull();
  });

  it("shows the escalated state: pills, the Report row, Reopen, a link to the report and the new retention line", async () => {
    vi.mocked(getContactEnquiry).mockResolvedValue(
      detail({ status: "handled", hasEscalation: true, escalatedReportId: REPORT_ID }),
    );
    renderPage();

    expect(await screen.findByRole("heading", { name: "Enquiry #318a1b2c" })).not.toBeNull();
    expect(screen.getByText("Handled")).not.toBeNull();
    expect(screen.getAllByText("Escalated")).toHaveLength(1);
    const card = screen.getByRole("region", { name: "Enquiry" });
    expect(within(card).getByText("Report")).not.toBeNull();
    expect(within(card).getByText("#1043d4e5")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reopen" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Escalate to a report" })).toBeNull();
    const view = screen.getByRole("link", { name: "View report #1043d4e5" });
    expect(view.getAttribute("href")).toBe(`/moderation/reports/${REPORT_ID}`);
    expect(
      screen.getByText(
        "Escalated to report #1043d4e5. That report’s retention applies instead of the 12-month deletion. [COPY PENDING LEGAL REVIEW]",
      ),
    ).not.toBeNull();
    expect(screen.queryByText(/Enquiries are deleted automatically/)).toBeNull();
  });

  it("shows loading, not-found and error states", async () => {
    let resolve: (v: ContactEnquiryDetail) => void = () => {};
    vi.mocked(getContactEnquiry).mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderPage();
    expect(screen.getByText("Loading the enquiry…")).not.toBeNull();
    await act(async () => resolve(detail()));
    expect(await screen.findByRole("heading", { name: "Enquiry #318a1b2c" })).not.toBeNull();
    unmount();

    vi.mocked(getContactEnquiry).mockRejectedValue(new AdminApiError(404, "Contact enquiry not found"));
    const second = renderPage();
    expect(await screen.findByText("Enquiry not found")).not.toBeNull();
    expect(screen.getByText(/It may have been deleted after 12 months/)).not.toBeNull();
    second.unmount();

    vi.mocked(getContactEnquiry).mockRejectedValue(new AdminApiError(500, "boom"));
    renderPage();
    expect(await screen.findByText(/Couldn’t load this enquiry/)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// The Escalate dialog
// ---------------------------------------------------------------------------------------------------

describe("Escalate to a report dialog", () => {
  function renderPage() {
    return renderAt(<ContactEnquiryDetailPage />, "/moderation/contact-enquiries/:id", `/moderation/contact-enquiries/${ENQUIRY_ID}`);
  }

  async function openDialog() {
    vi.mocked(getContactEnquiry).mockResolvedValue(detail());
    renderPage();
    const opener = await screen.findByRole("button", { name: "Escalate to a report" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Escalate to a report" });
    return { opener, dialog };
  }

  it("shows the drawn fields: intro, severity (Medium), the minor option, a required reason and the audit line", async () => {
    const { dialog } = await openDialog();
    expect(
      within(dialog).getByText(
        "Enquiry #318a1b2c. This creates a report in the Moderation Queue and links it to this enquiry.",
      ),
    ).not.toBeNull();
    const severity = within(dialog).getByLabelText("Severity") as HTMLSelectElement;
    expect(severity.value).toBe("medium");
    expect(within(severity).getAllByRole("option").map((o) => o.textContent)).toEqual(["Low", "Medium", "High", "Critical"]);
    expect(within(dialog).getByText("Low, medium, high or critical.")).not.toBeNull();
    const minor = within(dialog).getByLabelText(/This concerns a minor/) as HTMLInputElement;
    expect(minor.checked).toBe(false);
    expect(within(dialog).getByText("Reports marked this way can only be opened by child-safety-vetted admins.")).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason (required)")).not.toBeNull();
    expect(within(dialog).getByText("The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Escalate to a report" })).not.toBeNull();
  });

  it("refuses a reason under 10 or over 500 characters without calling the server", async () => {
    const { dialog } = await openDialog();
    const reason = within(dialog).getByLabelText("Reason (required)");

    fireEvent.change(reason, { target: { value: "too short" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Give a reason of at least 10 characters.");
    expect(escalateContactEnquiry).not.toHaveBeenCalled();

    // The textarea's own maxLength is 500, so a longer value is cut by the browser; 10 is the lower bound that matters.
    fireEvent.change(reason, { target: { value: "   " + "x".repeat(6) + "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Give a reason of at least 10 characters.");
    expect(escalateContactEnquiry).not.toHaveBeenCalled();

    // Exactly 10 characters passes.
    vi.mocked(escalateContactEnquiry).mockResolvedValue({
      enquiry: detail({ hasEscalation: true, escalatedReportId: REPORT_ID }),
      report: { id: REPORT_ID, status: "open", severity: "medium", concernsMinor: false },
    });
    fireEvent.change(reason, { target: { value: "1234567890" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));
    await waitFor(() => expect(escalateContactEnquiry).toHaveBeenCalledTimes(1));
  });

  it("sends the chosen severity, the minor flag and the trimmed reason, then shows the escalated state", async () => {
    const { dialog } = await openDialog();
    vi.mocked(escalateContactEnquiry).mockResolvedValue({
      enquiry: detail({ hasEscalation: true, escalatedReportId: REPORT_ID }),
      report: { id: REPORT_ID, status: "open", severity: "high", concernsMinor: true },
    });

    fireEvent.change(within(dialog).getByLabelText("Severity"), { target: { value: "high" } });
    fireEvent.click(within(dialog).getByLabelText(/This concerns a minor/));
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: `  ${GOOD_REASON}  ` } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(escalateContactEnquiry).toHaveBeenCalledWith(ENQUIRY_ID, {
      severity: "high",
      concernsMinor: true,
      reason: GOOD_REASON,
    });
    // The page now shows the escalated state with a link to the report.
    expect(screen.getByRole("link", { name: "View report #1043d4e5" })).not.toBeNull();
    expect(screen.getByText("Escalated")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Escalate to a report" })).toBeNull();
  });

  it("shows the server's own 4xx message inside the dialog and keeps what was typed", async () => {
    const { dialog } = await openDialog();
    vi.mocked(escalateContactEnquiry).mockRejectedValue(
      new AdminApiError(409, "This enquiry has already been escalated to a report.", {
        code: "contact_enquiry_already_escalated",
      }),
    );
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe("This enquiry has already been escalated to a report.");
    expect(screen.getByRole("dialog", { name: "Escalate to a report" })).not.toBeNull();
    expect((within(dialog).getByLabelText("Reason (required)") as HTMLTextAreaElement).value).toBe(GOOD_REASON);
    expect((within(dialog).getByRole("button", { name: "Escalate to a report" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a generic line for a server error that is not a 4xx", async () => {
    const { dialog } = await openDialog();
    vi.mocked(escalateContactEnquiry).mockRejectedValue(new AdminApiError(500, "internal detail"));
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Couldn’t record that action. Please try again.");
  });

  it("replaces the form with the restricted notice inside the dialog on child_safety_vetting_required, with Close", async () => {
    const { dialog } = await openDialog();
    vi.mocked(escalateContactEnquiry).mockRejectedValue(vettingRequiredError());
    fireEvent.click(within(dialog).getByLabelText(/This concerns a minor/));
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));

    await screen.findByText("Restricted — child-safety vetting required");
    const restricted = screen.getByRole("dialog", { name: "Escalate to a report" });
    expect(within(restricted).getByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(within(restricted).queryByLabelText("Reason (required)")).toBeNull();
    expect(within(restricted).queryByLabelText("Severity")).toBeNull();
    // Nothing was escalated: the page behind still offers the action.
    fireEvent.click(within(restricted).getAllByRole("button", { name: "Close" })[1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Escalate to a report" })).not.toBeNull();
  });

  it("disables the dialog while saving and ignores a second submit and Escape", async () => {
    const { dialog } = await openDialog();
    let resolve: (v: Awaited<ReturnType<typeof escalateContactEnquiry>>) => void = () => {};
    vi.mocked(escalateContactEnquiry).mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));

    const saving = await within(dialog).findByRole("button", { name: "Escalating…" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(escalateContactEnquiry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Escalate to a report" })).not.toBeNull();

    await act(async () =>
      resolve({
        enquiry: detail({ hasEscalation: true, escalatedReportId: REPORT_ID }),
        report: { id: REPORT_ID, status: "open", severity: "medium", concernsMinor: false },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  describe("keyboard and focus", () => {
    it("moves focus to the first field (Severity) when it opens", async () => {
      const { dialog } = await openDialog();
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Severity"));
    });

    it("keeps Tab inside the dialog, wrapping from the last control to the first and back", async () => {
      const { dialog } = await openDialog();
      const confirm = within(dialog).getByRole("button", { name: "Escalate to a report" });
      confirm.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(confirm);
    });

    it("pulls focus back in when it is somewhere outside the dialog", async () => {
      const { opener, dialog } = await openDialog();
      opener.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("Escape closes it and gives focus back to the control that opened it", async () => {
      const { opener } = await openDialog();
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(opener);
      expect(escalateContactEnquiry).not.toHaveBeenCalled();
    });

    it("Cancel gives focus back to the opener too", async () => {
      const { opener, dialog } = await openDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(opener);
    });

    it("the restricted notice also traps focus and Escape closes it", async () => {
      const { dialog } = await openDialog();
      vi.mocked(escalateContactEnquiry).mockRejectedValue(vettingRequiredError());
      fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: GOOD_REASON } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Escalate to a report" }));
      const restricted = await screen.findByText("Restricted — child-safety vetting required");
      const box = restricted.closest("[role=dialog]") as HTMLElement;
      expect(box.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });
});

// ---------------------------------------------------------------------------------------------------
// Report Detail for a report made from an enquiry
// ---------------------------------------------------------------------------------------------------

describe("ReportDetailPage for a report made from a Contact Us enquiry", () => {
  const enquiryView = {
    id: ENQUIRY_ID,
    name: "Chioma Eze",
    email: "chioma.eze@example.com",
    category: "technical_issues",
    subject: "Score not updating",
    message: "The live score for last night’s match has been stuck at 0–0 since half time.",
    status: "handled",
    createdAt: "2026-10-29T10:00:00.000Z",
    userId: "user-1",
  };

  function renderReport(state?: { report: Report }) {
    return renderAt(
      <ReportDetailPage />,
      "/moderation/reports/:id",
      state ? { pathname: `/moderation/reports/${REPORT_ID}`, state } : `/moderation/reports/${REPORT_ID}`,
    );
  }

  it("shows the reported enquiry and report details, with no reported-user section and no hold actions", async () => {
    vi.mocked(getReportById).mockResolvedValue(enquiryReport({ contactEnquiry: enquiryView, holds: [] }));
    renderReport();

    expect(await screen.findByRole("heading", { name: "Report #1043d4e5" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "← Moderation Queue" }).getAttribute("href")).toBe("/moderation");
    expect(screen.getAllByText("From Contact Us").length).toBeGreaterThan(0);
    expect(screen.getByText("Open")).not.toBeNull();

    const enq = screen.getByRole("region", { name: "Reported enquiry" });
    for (const [label, value] of [
      ["Source", "From Contact Us"],
      ["Category", "Technical issues"],
      ["Subject", "Score not updating"],
      ["Contact name", "Chioma Eze"],
      ["Contact email", "chioma.eze@example.com"],
    ]) {
      expect(within(enq).getByText(label)).not.toBeNull();
      expect(within(enq).getByText(value)).not.toBeNull();
    }
    expect(within(enq).getByText("Message")).not.toBeNull();
    expect(within(enq).getByText(/stuck at 0–0 since half time/)).not.toBeNull();

    const details = screen.getByRole("region", { name: "Report details" });
    expect(within(details).getByText("Severity")).not.toBeNull();
    expect(within(details).getByText("Medium")).not.toBeNull();
    expect(within(details).getByText("Concerns a minor")).not.toBeNull();
    expect(within(details).getByText("No")).not.toBeNull();
    expect(within(details).getByText("Submitted")).not.toBeNull();
    expect(within(details).getByText("Status")).not.toBeNull();

    // The drawn actions: Dismiss Report and View enquiry; nothing else.
    expect(screen.getByRole("button", { name: "Dismiss Report" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "View enquiry #318a1b2c" }).getAttribute("href")).toBe(
      `/moderation/contact-enquiries/${ENQUIRY_ID}`,
    );
    for (const name of ["Reporter acted in bad faith", "Legal hold", "Remove Content", "Warn User", "Suspend User"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText("Reported content")).toBeNull();
    expect(screen.queryByText("Reporter")).toBeNull();
    expect(screen.queryByText("Escalate")).toBeNull();
    expect(
      screen.getByText(
        "This report came from a Contact Us enquiry. It has no reported account or content, so there are no account or hold actions.",
      ),
    ).not.toBeNull();
  });

  it("reads the enquiry for a report handed over from the queue (the list row does not carry it)", async () => {
    vi.mocked(getReportById).mockResolvedValue(enquiryReport({ contactEnquiry: enquiryView, holds: [] }));
    renderReport({ report: enquiryReport() });

    expect(await screen.findByRole("heading", { name: "Report #1043d4e5" })).not.toBeNull();
    expect(await screen.findByText("Score not updating")).not.toBeNull();
    expect(getReportById).toHaveBeenCalledWith(REPORT_ID);
  });

  it("says the enquiry could not be loaded when the read fails for a handed-over report", async () => {
    vi.mocked(getReportById).mockRejectedValue(new AdminApiError(500, "boom"));
    renderReport({ report: enquiryReport() });
    expect(await screen.findByText("The enquiry this report came from couldn’t be loaded. It may have been deleted.")).not.toBeNull();
    // The report itself is still shown.
    expect(screen.getByRole("button", { name: "Dismiss Report" })).not.toBeNull();
  });

  it("says so when the enquiry is gone", async () => {
    vi.mocked(getReportById).mockResolvedValue(enquiryReport({ contactEnquiry: null }));
    renderReport();
    expect(await screen.findByText(/couldn’t be loaded\. It may have been deleted/)).not.toBeNull();
  });

  it("Dismiss Report dismisses the report and returns to the queue", async () => {
    vi.mocked(getReportById).mockResolvedValue(enquiryReport({ contactEnquiry: enquiryView }));
    vi.mocked(actionReport).mockResolvedValue(enquiryReport({ status: "reviewed", actionTaken: "dismissed" }));
    renderReport();

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss Report" }));
    await waitFor(() => expect(actionReport).toHaveBeenCalledWith(REPORT_ID, "dismissed"));
    expect((await screen.findByTestId("loc")).textContent).toBe("/moderation");
  });

  it("shows the server's message when dismissing fails, and the restricted notice on a vetting 403", async () => {
    vi.mocked(getReportById).mockResolvedValue(enquiryReport({ contactEnquiry: enquiryView }));
    vi.mocked(actionReport).mockRejectedValueOnce(new AdminApiError(409, "This report has already been actioned."));
    renderReport();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss Report" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This report has already been actioned.");

    vi.mocked(actionReport).mockRejectedValueOnce(vettingRequiredError());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Report" }));
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss Report" })).toBeNull();
  });

  it("a report already dismissed shows no Dismiss button, only the link to the enquiry", async () => {
    vi.mocked(getReportById).mockResolvedValue(
      enquiryReport({ status: "reviewed", actionTaken: "dismissed", reviewedAt: "2026-10-30T09:00:00.000Z", contactEnquiry: enquiryView }),
    );
    renderReport();
    expect(await screen.findByText(/This report was already dismissed/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss Report" })).toBeNull();
    expect(screen.getByRole("link", { name: "View enquiry #318a1b2c" })).not.toBeNull();
  });

  it("shows the existing restricted state when the read itself is a vetting 403", async () => {
    vi.mocked(getReportById).mockRejectedValue(vettingRequiredError());
    renderReport();
    expect(await screen.findByText("Restricted — child-safety vetting required")).not.toBeNull();
  });
});
