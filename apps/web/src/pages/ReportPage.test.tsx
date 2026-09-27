// ReportPage. Same conventions as GrassrootsRegisterTeamPage.test.tsx:
// plain DOM assertions, mocks src/api/moderation.ts. POST /reports/public
// is a real merged endpoint — exercising it live is services/api's own
// test suite's job (public-reports.controller.http.spec.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ReportPage from "./ReportPage";
import { ModerationApiError, type PublicReport } from "../api/moderation";

vi.mock("../api/moderation", async () => {
  const actual = await vi.importActual<typeof import("../api/moderation")>("../api/moderation");
  return { ...actual, createPublicReport: vi.fn() };
});

import { createPublicReport } from "../api/moderation";

const CREATED: PublicReport = {
  id: "report-new",
  targetType: "post",
  targetId: "11111111-1111-4111-8111-111111111111",
  reason: "This photo shows my child without consent.",
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

function fillForm() {
  fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "concerned-parent@example.com" } });
  fireEvent.change(screen.getByLabelText("Where can we find it?"), {
    target: { value: "11111111-1111-4111-8111-111111111111" },
  });
  fireEvent.change(screen.getByLabelText("Why are you reporting this?"), {
    target: { value: "This photo shows my child without consent." },
  });
}

describe("ReportPage", () => {
  it("has no session gate at all -- renders the form with nothing in storage", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Report a concern" })).not.toBeNull();
    expect(createPublicReport).not.toHaveBeenCalled();
  });

  it("keeps Submit disabled until email, target ID, and reason are all filled", () => {
    renderPage();
    expect((screen.getByRole("button", { name: "Submit report" }) as HTMLButtonElement).disabled).toBe(true);
    fillForm();
    expect((screen.getByRole("button", { name: "Submit report" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("submits POST /reports/public with the default target type (post) and concernsMinor false", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith({
        reporterContactEmail: "concerned-parent@example.com",
        targetType: "post",
        targetId: "11111111-1111-4111-8111-111111111111",
        reason: "This photo shows my child without consent.",
        concernsMinor: false,
      }),
    );
  });

  it("submits the chosen target type and a checked 'this involves a child' box", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);

    renderPage();
    fillForm();
    fireEvent.change(screen.getByLabelText("What are you reporting?"), { target: { value: "user" } });
    fireEvent.click(screen.getByLabelText("This involves a child"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(createPublicReport).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: "user", concernsMinor: true }),
      ),
    );
  });

  it("shows a real confirmation state naming the submitted email, not a stub", async () => {
    vi.mocked(createPublicReport).mockResolvedValueOnce(CREATED);

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByRole("heading", { name: "Report submitted" })).not.toBeNull();
    expect(screen.getByText(/we.ve sent a confirmation to/i)).not.toBeNull();
    expect(screen.getByText("concerned-parent@example.com")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to Soccernity" }).getAttribute("href")).toBe("/");
  });

  it("surfaces a 404 (target not found) message from the backend", async () => {
    vi.mocked(createPublicReport).mockRejectedValueOnce(
      new ModerationApiError("Post not found", { status: 404 }),
    );

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/post not found/i);
    expect(screen.queryByRole("heading", { name: "Report submitted" })).toBeNull();
  });

  it("shows a generic error message on other failures", async () => {
    vi.mocked(createPublicReport).mockRejectedValueOnce(
      new ModerationApiError("Couldn't submit that report (500)."),
    );

    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t submit that report/i);
  });

  it("links to support@soccernity.com for a reporter with no ID to paste in", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "support@soccernity.com" });
    expect(link.getAttribute("href")).toBe("mailto:support@soccernity.com?subject=Report%20a%20concern");
  });
});
