// B-120: the guardians' incorrect-details reports screen (Figma pass K family
// 6737:27844 ...), wired to GET /admin/users/incorrect-details-reports and
// POST /admin/users/:id/incorrect-details-report/resolve.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/adminUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/adminUsers")>();
  return { ...actual, listIncorrectDetailsReports: vi.fn(), resolveIncorrectDetailsReport: vi.fn() };
});

import {
  listIncorrectDetailsReports,
  resolveIncorrectDetailsReport,
  type IncorrectDetailsReport,
} from "../../api/adminUsers";
import IncorrectDetailsReportsPage from "./IncorrectDetailsReportsPage";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listIncorrectDetailsReports).mockReset();
  vi.mocked(resolveIncorrectDetailsReport).mockReset();
});

function report(n: number, overrides: Partial<IncorrectDetailsReport> = {}): IncorrectDetailsReport {
  return {
    userId: `6b1f5f2e-4b3a-4c9d-9e21-2f7c1a8d4e0${n}`,
    minorDisplayName: `Sample minor ${n}`,
    minorAccountStatus: "active",
    guardianName: `Sample guardian ${n}`,
    guardianEmail: `guardian${n}@example.com`,
    consentStatus: "pending",
    reportedAt: `2026-10-1${n}T09:00:00.000Z`,
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/users/incorrect-details-reports"]}>
      <Routes>
        <Route path="/users" element={<p>users list</p>} />
        <Route path="/users/incorrect-details-reports" element={<IncorrectDetailsReportsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("IncorrectDetailsReportsPage", () => {
  it("lists the open reports with exactly the response columns and the explainer", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1), report(2)], truncated: false });
    renderPage();

    expect(await screen.findByText("Sample minor 1")).not.toBeNull();
    const table = screen.getByRole("table", { name: "Incorrect-details reports" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Minor", "User ID", "Account", "Guardian", "Guardian email", "Consent", "Reported", "Action"]);
    expect(within(table).getByText("6b1f5f2e…1a8d4e01")).not.toBeNull();
    expect(within(table).getAllByText("Active").length).toBe(2);
    expect(within(table).getAllByText("Pending").length).toBe(2);
    expect(within(table).getAllByRole("button", { name: "Resolve" }).length).toBe(2);
    expect(screen.getByText(/A guardian has said the details on a consent request are wrong/)).not.toBeNull();
    expect(screen.queryByText(/Showing the first 200/)).toBeNull();
  });

  it("shows no date of birth anywhere", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1)], truncated: false });
    renderPage();
    await screen.findByText("Sample minor 1");
    expect(document.body.textContent).not.toMatch(/date of birth:|born/i);
  });

  it("shows the empty state", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [], truncated: false });
    renderPage();
    expect(await screen.findByText("No open incorrect-details reports")).not.toBeNull();
    expect(screen.getByText("When a guardian reports incorrect details on a consent request, it appears here.")).not.toBeNull();
  });

  it("shows the truncated notice when the server says more exist", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1)], truncated: true });
    renderPage();
    expect(
      await screen.findByText("Showing the first 200 open reports. More open reports exist than this list returns."),
    ).not.toBeNull();
  });

  it("shows the load error with Retry, and Retry loads again", async () => {
    vi.mocked(listIncorrectDetailsReports).mockRejectedValueOnce(new AdminApiError(403, "Forbidden resource"));
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The incorrect-details reports could not be loaded. Check the connection and try again.",
    );
    vi.mocked(listIncorrectDetailsReports).mockResolvedValueOnce({ items: [report(1)], truncated: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sample minor 1")).not.toBeNull();
  });

  it("Resolve opens the confirm dialog and sends nothing until it is confirmed", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1)], truncated: false });
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Resolve" }))[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Resolve incorrect-details report")).not.toBeNull();
    expect(dialog.textContent).toContain("Report on Sample minor 1’s consent request, reported 11 Oct 2026.");
    expect(resolveIncorrectDetailsReport).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(resolveIncorrectDetailsReport).not.toHaveBeenCalled();
  });

  it("a confirmed resolve calls the endpoint and the row leaves the list", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1), report(2)], truncated: false });
    vi.mocked(resolveIncorrectDetailsReport).mockResolvedValue({ resolved: true });
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Resolve" }))[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resolve report" }));

    await waitFor(() => expect(resolveIncorrectDetailsReport).toHaveBeenCalledWith(report(1).userId));
    await waitFor(() => expect(screen.queryByText("Sample minor 1")).toBeNull());
    expect(screen.getByText("Sample minor 2")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a 404 is an expected outcome: the drawn message, and the list is refreshed", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValueOnce({ items: [report(1), report(2)], truncated: false });
    vi.mocked(resolveIncorrectDetailsReport).mockRejectedValue(
      new AdminApiError(404, "No open incorrect-details report for this user"),
    );
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Resolve" }))[0]);
    // Another admin resolved it: the refreshed list no longer has it.
    vi.mocked(listIncorrectDetailsReports).mockResolvedValueOnce({ items: [report(2)], truncated: false });
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resolve report" }));

    expect(
      await screen.findByText(
        "No open incorrect-details report for this user. It may already have been resolved, so the list has been refreshed.",
      ),
    ).not.toBeNull();
    await waitFor(() => expect(screen.queryByText("Sample minor 1")).toBeNull());
    expect(listIncorrectDetailsReports).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("any other failure says the report is still open and keeps the row", async () => {
    vi.mocked(listIncorrectDetailsReports).mockResolvedValue({ items: [report(1)], truncated: false });
    vi.mocked(resolveIncorrectDetailsReport).mockRejectedValue(new AdminApiError(500, "boom"));
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Resolve" }))[0]);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resolve report" }));

    expect(await screen.findByText("The report could not be resolved. It is still open. Try again.")).not.toBeNull();
    expect(screen.getByText("Sample minor 1")).not.toBeNull();
    expect(listIncorrectDetailsReports).toHaveBeenCalledTimes(1);
  });
});
