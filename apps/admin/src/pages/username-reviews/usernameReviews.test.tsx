// B-139 part (c) (Decision Log #467): the Username reviews list, the request detail and the decide dialog.
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AdminApiError } from "../../api/adminClient";

vi.mock("../../api/usernameReviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/usernameReviews")>();
  return { ...actual, listUsernameReviews: vi.fn(), decideUsernameReview: vi.fn(), findUsernameReviewById: vi.fn() };
});

import {
  decideUsernameReview,
  findUsernameReviewById,
  listUsernameReviews,
  USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE,
  USERNAME_REVIEW_NOT_FOUND_CODE,
  USERNAME_REVIEW_NOT_PENDING_CODE,
  USERNAME_REVIEW_OWN_REVOCATION_CODE,
  USERNAME_REVIEW_REASON_INVALID_CODE,
  USERNAME_REVIEW_USER_HAS_USERNAME_CODE,
  USERNAME_REVIEW_USER_UNAVAILABLE_CODE,
  type UsernameReviewListItem,
} from "../../api/usernameReviews";
import UsernameReviewsPage from "./UsernameReviewsPage";
import UsernameReviewDetailPage from "./UsernameReviewDetailPage";

afterEach(() => {
  cleanup();
});
beforeEach(() => {
  vi.mocked(listUsernameReviews).mockReset();
  vi.mocked(decideUsernameReview).mockReset();
  vi.mocked(findUsernameReviewById).mockReset();
});

const ID = "214a1b2c-0000-4000-8000-000000000214";
const GOOD_REASON = "Second review found no rule broken.";

function item(overrides: Partial<UsernameReviewListItem> = {}): UsernameReviewListItem {
  return {
    id: ID,
    status: "pending",
    createdAt: "2026-11-02T10:00:00.000Z",
    message: "I think this was a mistake. The username was my own name and I did not break any rule.",
    removedUsername: "adab",
    revokedAt: "2026-10-28T09:00:00.000Z",
    userId: "user-1",
    userDisplayName: "Ada Bello",
    revokedBy: { displayName: "Mira Okon" },
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

function apiError(status: number, code: string): AdminApiError {
  // The English message is deliberately unrelated: the screens must branch on the code.
  return new AdminApiError(status, "message text the screen must ignore", { statusCode: status, code, message: "x" });
}

// ---------------------------------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------------------------------

describe("UsernameReviewsPage", () => {
  function renderPage() {
    return renderAt(<UsernameReviewsPage />, "/username-reviews", "/username-reviews");
  }

  it("lists pending requests with the drawn columns and a Review link carrying the row", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({
      items: [
        item(),
        item({
          id: "2",
          userDisplayName: "Tolu Mensah",
          removedUsername: "tolumensah",
          revokedBy: { displayName: "Jide Aluko" },
          createdAt: "2026-11-01T10:00:00.000Z",
          revokedAt: "2026-10-22T09:00:00.000Z",
        }),
      ],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Username reviews" })).not.toBeNull();
    const table = screen.getByRole("table", { name: "Username review requests" });
    for (const header of ["Requested", "Person", "Username removed", "Removed by", "Removed on", "Status", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: header })).not.toBeNull();
    }
    expect(within(table).getByText("Ada Bello")).not.toBeNull();
    expect(within(table).getByText("@adab")).not.toBeNull();
    expect(within(table).getByText("Mira Okon")).not.toBeNull();
    expect(within(table).getByText("02 Nov 2026")).not.toBeNull();
    expect(within(table).getByText("28 Oct 2026")).not.toBeNull();
    expect(within(table).getAllByText("Pending")).toHaveLength(2);
    const review = within(table).getByRole("link", { name: /from Ada Bello about @adab/ });
    expect(review.textContent).toBe("Review");
    expect(review.getAttribute("href")).toBe(`/username-reviews/${ID}`);
    // The default view is Pending, asked of the server as such.
    expect(listUsernameReviews).toHaveBeenCalledWith({ status: "pending", limit: 50 });
  });

  it("shows a View link and the Declined pill for a decided request, and never draws fields the server does not return", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({
      items: [item({ status: "declined" })],
      nextCursor: null,
    });
    renderPage();
    const table = await screen.findByRole("table", { name: "Username review requests" });
    expect(within(table).getByText("Declined")).not.toBeNull();
    expect(within(table).getByRole("link", { name: /from Ada Bello/ }).textContent).toBe("View");
    // No reason, no decided-by and no decided-on column exists in the response.
    expect(screen.queryByRole("columnheader", { name: /reason|decided/i })).toBeNull();
  });

  it("renders a removal with an unknown revoker as a dash", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [item({ revokedBy: null })], nextCursor: null });
    renderPage();
    const table = await screen.findByRole("table", { name: "Username review requests" });
    expect(within(table).getByText("—")).not.toBeNull();
  });

  it("offers Pending, Declined and All (a reinstated request is deleted by the server, so it is not an option)", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    const select = (await screen.findByLabelText("Status")) as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Pending", "Declined", "All"]);
    expect(select.value).toBe("pending");
    expect(screen.getByText("Pending, declined or all.")).not.toBeNull();
  });

  it("applies the filter only when Apply filter is pressed, asking the server for the chosen status", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [item()], nextCursor: null });
    renderPage();
    await screen.findByRole("table", { name: "Username review requests" });
    vi.mocked(listUsernameReviews).mockClear();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "declined" } });
    expect(listUsernameReviews).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(listUsernameReviews).toHaveBeenCalledWith({ status: "declined", limit: 50 }));

    vi.mocked(listUsernameReviews).mockClear();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    await waitFor(() => expect(listUsernameReviews).toHaveBeenCalledWith({ status: undefined, limit: 50 }));
  });

  it("shows the drawn empty state, and never hints that anything is hidden", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText("No pending requests.")).not.toBeNull();
    expect(screen.getByText("A request appears here when someone asks for a review of a removed username.")).not.toBeNull();
    expect(screen.queryByText(/hidden|filtered out|not visible|restricted/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("words the empty state for the chosen filter", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await screen.findByText("No pending requests.");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "declined" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(await screen.findByText("No declined requests.")).not.toBeNull();
  });

  it("shows a loading line while the first page is on its way", async () => {
    let resolve: (v: { items: UsernameReviewListItem[]; nextCursor: string | null }) => void = () => {};
    vi.mocked(listUsernameReviews).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    expect(screen.getByText("Loading the review requests…")).not.toBeNull();
    await act(async () => resolve({ items: [item()], nextCursor: null }));
    expect(await screen.findByRole("table", { name: "Username review requests" })).not.toBeNull();
    expect(screen.queryByText("Loading the review requests…")).toBeNull();
  });

  it("shows the drawn load error with a Retry that asks again", async () => {
    vi.mocked(listUsernameReviews).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    renderPage();
    expect(await screen.findByText("Couldn’t load the review requests")).not.toBeNull();
    expect(screen.getByText("Check the connection and try again.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();

    vi.mocked(listUsernameReviews).mockResolvedValue({ items: [item()], nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Username review requests" })).not.toBeNull();
    expect(screen.queryByText("Couldn’t load the review requests")).toBeNull();
  });

  it("loads the next page with the server's cursor and appends it", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValueOnce({ items: [item()], nextCursor: "cursor-1" });
    renderPage();
    await screen.findByRole("table", { name: "Username review requests" });

    vi.mocked(listUsernameReviews).mockResolvedValueOnce({
      items: [item({ id: "3", userDisplayName: "Kemi Okoro", removedUsername: "kemi_o" })],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Kemi Okoro")).not.toBeNull();
    expect(screen.getByText("Ada Bello")).not.toBeNull();
    expect(listUsernameReviews).toHaveBeenLastCalledWith({ status: "pending", cursor: "cursor-1", limit: 50 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("says so when the next page cannot be loaded and keeps what is already shown", async () => {
    vi.mocked(listUsernameReviews).mockResolvedValueOnce({ items: [item()], nextCursor: "cursor-1" });
    renderPage();
    await screen.findByRole("table", { name: "Username review requests" });
    vi.mocked(listUsernameReviews).mockRejectedValueOnce(new AdminApiError(500, "boom"));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn’t load more requests. Try again.")).not.toBeNull();
    expect(screen.getByText("Ada Bello")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// The detail
// ---------------------------------------------------------------------------------------------------

describe("UsernameReviewDetailPage", () => {
  function renderPage(state?: { request?: UsernameReviewListItem }) {
    return renderAt(<UsernameReviewDetailPage />, "/username-reviews/:id", {
      pathname: `/username-reviews/${ID}`,
      state,
    });
  }

  it("shows the pending request from the handed-over row: removal, the person's message, the actions and the hint", async () => {
    renderPage({ request: item() });
    expect(await screen.findByRole("heading", { level: 1, name: "Review request #214a1b2c" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "← Username reviews" }).getAttribute("href")).toBe("/username-reviews");
    expect(screen.getAllByText("Pending")).toHaveLength(1);

    const removal = screen.getByRole("region", { name: "Removal" });
    expect(within(removal).getByText("Ada Bello")).not.toBeNull();
    expect(within(removal).getByText("@adab")).not.toBeNull();
    expect(within(removal).getByText("Mira Okon")).not.toBeNull();
    expect(within(removal).getByText("28 Oct 2026")).not.toBeNull();
    const request = screen.getByRole("region", { name: "Request" });
    expect(within(request).getByText("02 Nov 2026")).not.toBeNull();
    expect(
      within(request).getByText("I think this was a mistake. The username was my own name and I did not break any rule."),
    ).not.toBeNull();

    expect(screen.getByRole("button", { name: "Reinstate username" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Decline request" })).not.toBeNull();
    expect(screen.getByText("A decision is final. There is no second review.")).not.toBeNull();
    expect(
      screen.getByText(
        "The person sees the result on their create-profile screen and in an in-app notification. No email is sent for the decision.",
      ),
    ).not.toBeNull();
    // Nothing is fetched when the row was handed over.
    expect(findUsernameReviewById).not.toHaveBeenCalled();
    expect(listUsernameReviews).not.toHaveBeenCalled();
  });

  it("never draws the fields the response does not carry", async () => {
    renderPage({ request: item() });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Reason recorded at removal/)).toBeNull();
    expect(screen.queryByText(/New username chosen/)).toBeNull();
    expect(screen.queryByText(/Decided by/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Decision" })).toBeNull();
  });

  it("draws no message box when the person left no message", async () => {
    renderPage({ request: item({ message: null }) });
    const request = await screen.findByRole("region", { name: "Request" });
    expect(within(request).getByText("02 Nov 2026")).not.toBeNull();
    expect(request.querySelector(".ce-message")).toBeNull();
  });

  it("shows a decided request read-only: the Declined pill, the Decision card and no actions", async () => {
    renderPage({ request: item({ status: "declined" }) });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText("Declined").length).toBeGreaterThan(0);
    const decision = screen.getByRole("region", { name: "Decision" });
    expect(within(decision).getByText("Declined")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Reinstate username" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline request" })).toBeNull();
    expect(screen.queryByText("A decision is final. There is no second review.")).toBeNull();
    // No banner unless this admin has just decided it.
    expect(screen.queryByText("Decision recorded")).toBeNull();
  });

  it("falls back to re-reading the requests on a direct visit, and finds the request", async () => {
    vi.mocked(findUsernameReviewById).mockResolvedValue(item());
    renderPage();
    expect(screen.getByText("Loading the review request…")).not.toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: "Review request #214a1b2c" })).not.toBeNull();
    expect(findUsernameReviewById).toHaveBeenCalledWith(ID);
  });

  it("says the request is not in the list when the fallback does not find it", async () => {
    vi.mocked(findUsernameReviewById).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("Request not found")).not.toBeNull();
    expect(
      screen.getByText("This request is not in the list. A request is removed when it is reinstated or when the account is deleted."),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to username reviews" }).getAttribute("href")).toBe("/username-reviews");
  });

  it("says it could not load the request when the fallback fails", async () => {
    vi.mocked(findUsernameReviewById).mockRejectedValue(new AdminApiError(500, "boom"));
    renderPage();
    expect(await screen.findByText("Couldn’t load this request. Please try again from the list.")).not.toBeNull();
  });

  it("ignores a handed-over row for a different request", async () => {
    vi.mocked(findUsernameReviewById).mockResolvedValue(item());
    renderPage({ request: item({ id: "someone-else", userDisplayName: "Not Ada" }) });
    expect(await screen.findByRole("heading", { level: 1, name: "Review request #214a1b2c" })).not.toBeNull();
    expect(screen.queryByText("Not Ada")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// The decide dialog
// ---------------------------------------------------------------------------------------------------

describe("Decide dialog", () => {
  function renderPage() {
    return renderAt(<UsernameReviewDetailPage />, "/username-reviews/:id", {
      pathname: `/username-reviews/${ID}`,
      state: { request: item() },
    });
  }

  async function openDialog(opener: "Reinstate username" | "Decline request" = "Reinstate username") {
    renderPage();
    const button = await screen.findByRole("button", { name: opener });
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Decide on this request" });
    return { button, dialog };
  }

  function confirmButton(dialog: HTMLElement, name: string) {
    return within(dialog).getByRole("button", { name }) as HTMLButtonElement;
  }

  it("shows the drawn dialog with Reinstate selected when it was opened from Reinstate username", async () => {
    const { dialog } = await openDialog();
    expect(
      within(dialog).getByText(
        "Ada Bello asked for a review of the removal of @adab. A decision is final and there is no second review.",
      ),
    ).not.toBeNull();
    expect((within(dialog).getByLabelText(/Reinstate/) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText(/Decline/) as HTMLInputElement).checked).toBe(false);
    expect(within(dialog).getByText("The old username comes back and the removal record is deleted.")).not.toBeNull();
    expect(within(dialog).getByText("The username stays removed and the person cannot choose it again.")).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason (internal, required)")).not.toBeNull();
    expect(within(dialog).getByText("Internal. Saved to the audit record. At least 10 characters.")).not.toBeNull();
    expect(within(dialog).getByText("0 / 500")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(confirmButton(dialog, "Reinstate username")).not.toBeNull();
  });

  it("opens with Decline selected from Decline request, and the confirm label follows the choice", async () => {
    const { dialog } = await openDialog("Decline request");
    expect((within(dialog).getByLabelText(/Decline/) as HTMLInputElement).checked).toBe(true);
    expect(confirmButton(dialog, "Decline request")).not.toBeNull();
    fireEvent.click(within(dialog).getByLabelText(/Reinstate/));
    expect(confirmButton(dialog, "Reinstate username")).not.toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Decline request" })).toBeNull();
  });

  it("counts the characters as they are typed", async () => {
    const { dialog } = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
    expect(within(dialog).getByText(`${GOOD_REASON.length} / 500`)).not.toBeNull();
    expect((within(dialog).getByLabelText("Reason (internal, required)") as HTMLTextAreaElement).maxLength).toBe(500);
  });

  it("refuses a reason shorter than 10 characters, with the drawn message and no request", async () => {
    const { dialog } = await openDialog("Decline request");
    fireEvent.click(confirmButton(dialog, "Decline request"));
    expect(within(dialog).getByText("Enter at least 10 characters.")).not.toBeNull();
    expect(within(dialog).getByLabelText("Reason (internal, required)").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: "too short " } });
    fireEvent.click(confirmButton(dialog, "Decline request"));
    expect(within(dialog).getByText("Enter at least 10 characters.")).not.toBeNull();
    expect(decideUsernameReview).not.toHaveBeenCalled();
  });

  it("accepts a reason of exactly 10 characters after trimming, and sends the trimmed text", async () => {
    vi.mocked(decideUsernameReview).mockResolvedValue({ id: ID, status: "declined", decidedAt: "2026-11-03T12:00:00.000Z" });
    const { dialog } = await openDialog("Decline request");
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: "  0123456789  " } });
    fireEvent.click(confirmButton(dialog, "Decline request"));
    await waitFor(() => expect(decideUsernameReview).toHaveBeenCalledTimes(1));
    expect(decideUsernameReview).toHaveBeenCalledWith(ID, { decision: "decline", reason: "0123456789" });
  });

  it("reinstates: sends the choice and reason, closes, and shows the Decision recorded banner and the Decision card", async () => {
    vi.mocked(decideUsernameReview).mockResolvedValue({ id: ID, status: "reinstated", decidedAt: "2026-11-03T12:00:00.000Z" });
    const { dialog } = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(confirmButton(dialog, "Reinstate username"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(decideUsernameReview).toHaveBeenCalledWith(ID, { decision: "reinstate", reason: GOOD_REASON });
    expect(screen.getByText("Decision recorded")).not.toBeNull();
    expect(
      screen.getByText("Reinstated. @adab is back on Ada Bello’s account and the removal record is deleted."),
    ).not.toBeNull();
    const decision = screen.getByRole("region", { name: "Decision" });
    expect(within(decision).getByText("Reinstated")).not.toBeNull();
    expect(within(decision).getByText("03 Nov 2026")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Reinstate username" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline request" })).toBeNull();
  });

  it("declines: shows the Declined banner and no actions", async () => {
    vi.mocked(decideUsernameReview).mockResolvedValue({ id: ID, status: "declined", decidedAt: "2026-11-03T12:00:00.000Z" });
    const { dialog } = await openDialog("Decline request");
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(confirmButton(dialog, "Decline request"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Declined. @adab stays removed. This decision is final.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Decline request" })).toBeNull();
  });

  it("disables the dialog while saving and ignores a second submit and Escape", async () => {
    const { dialog } = await openDialog();
    let resolve: (v: Awaited<ReturnType<typeof decideUsernameReview>>) => void = () => {};
    vi.mocked(decideUsernameReview).mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
    fireEvent.click(confirmButton(dialog, "Reinstate username"));

    const saving = await within(dialog).findByRole("button", { name: "Saving…" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(decideUsernameReview).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Decide on this request" })).not.toBeNull();

    await act(async () => resolve({ id: ID, status: "reinstated", decidedAt: "2026-11-03T12:00:00.000Z" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  describe("coded errors (branched on the code, never on the server's message)", () => {
    async function failWith(err: unknown, opener: "Reinstate username" | "Decline request" = "Reinstate username") {
      vi.mocked(decideUsernameReview).mockRejectedValue(err);
      const { dialog, button } = await openDialog(opener);
      fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
      fireEvent.click(confirmButton(dialog, opener));
      await within(dialog).findByRole("alert");
      return { dialog, button };
    }

    it("the person already chose a new username", async () => {
      const { dialog } = await failWith(apiError(409, USERNAME_REVIEW_USER_HAS_USERNAME_CODE));
      expect(within(dialog).getByText("This request can’t be decided any more")).not.toBeNull();
      expect(
        within(dialog).getByText("Ada Bello has already chosen a new username, so @adab can’t be reinstated."),
      ).not.toBeNull();
      // The dialog stays open with what was typed, and can be used again.
      expect((within(dialog).getByLabelText("Reason (internal, required)") as HTMLTextAreaElement).value).toBe(GOOD_REASON);
      expect(confirmButton(dialog, "Reinstate username").disabled).toBe(false);
      expect(within(dialog).queryByText("message text the screen must ignore")).toBeNull();
    });

    it("the caller removed this username", async () => {
      const { dialog } = await failWith(apiError(403, USERNAME_REVIEW_OWN_REVOCATION_CODE));
      expect(within(dialog).getByText("You can’t decide this request")).not.toBeNull();
      expect(
        within(dialog).getByText("You removed this username. Another moderator or superadmin has to decide it."),
      ).not.toBeNull();
    });

    it("the request is no longer pending, and closing the dialog re-reads the request", async () => {
      vi.mocked(findUsernameReviewById).mockResolvedValue(item({ status: "declined" }));
      const { dialog } = await failWith(apiError(409, USERNAME_REVIEW_NOT_PENDING_CODE));
      expect(within(dialog).getByText("This request was already decided")).not.toBeNull();
      expect(within(dialog).getByText("Another admin has decided it. Close this dialog to see the result.")).not.toBeNull();

      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(findUsernameReviewById).toHaveBeenCalledWith(ID));
      // The re-read shows the decided request, read-only.
      expect(await screen.findByRole("region", { name: "Decision" })).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Reinstate username" })).toBeNull();
    });

    it("the username is no longer available to restore", async () => {
      const { dialog } = await failWith(apiError(409, USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE));
      expect(within(dialog).getByText("This username can’t be restored")).not.toBeNull();
      expect(within(dialog).getByText("@adab is no longer available to restore.")).not.toBeNull();
    });

    it("the account was deleted", async () => {
      const { dialog } = await failWith(apiError(409, USERNAME_REVIEW_USER_UNAVAILABLE_CODE));
      expect(within(dialog).getByText("This account has been deleted")).not.toBeNull();
      expect(within(dialog).getByText("There is nothing to reinstate.")).not.toBeNull();
    });

    it("the request was not found (also what an admin who may not see a minor's request gets)", async () => {
      const { dialog } = await failWith(apiError(404, USERNAME_REVIEW_NOT_FOUND_CODE));
      expect(within(dialog).getByText("This request was not found")).not.toBeNull();
      // Deliberately says nothing about vetting or about a minor: the server answers the two the same.
      expect(within(dialog).queryByText(/vetted|minor|child/i)).toBeNull();
    });

    it("a reason the server judges invalid becomes the field message", async () => {
      vi.mocked(decideUsernameReview).mockRejectedValue(apiError(400, USERNAME_REVIEW_REASON_INVALID_CODE));
      const { dialog } = await openDialog();
      fireEvent.change(within(dialog).getByLabelText("Reason (internal, required)"), { target: { value: GOOD_REASON } });
      fireEvent.click(confirmButton(dialog, "Reinstate username"));
      expect(await within(dialog).findByText("Enter at least 10 characters.")).not.toBeNull();
    });

    it("anything else gets the drawn could-not-save line, never the server's text", async () => {
      const { dialog } = await failWith(new AdminApiError(500, "SQL exploded", { message: "SQL exploded" }));
      expect(within(dialog).getByText("Couldn’t save the decision")).not.toBeNull();
      expect(within(dialog).getByText("Try again. If it keeps failing, check the connection.")).not.toBeNull();
      expect(within(dialog).queryByText(/SQL exploded/)).toBeNull();
    });

    it("an uncoded 4xx and a network failure both get the could-not-save line", async () => {
      const { dialog } = await failWith(new TypeError("Failed to fetch"));
      expect(within(dialog).getByText("Couldn’t save the decision")).not.toBeNull();
    });

    it("clears the error when the decision is tried again", async () => {
      const { dialog } = await failWith(new AdminApiError(500, "boom"));
      vi.mocked(decideUsernameReview).mockResolvedValue({ id: ID, status: "reinstated", decidedAt: "2026-11-03T12:00:00.000Z" });
      fireEvent.click(confirmButton(dialog, "Reinstate username"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByText("Decision recorded")).not.toBeNull();
    });
  });

  describe("keyboard and focus", () => {
    it("moves focus to the reason field when it opens", async () => {
      const { dialog } = await openDialog();
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Reason (internal, required)"));
    });

    it("keeps Tab inside the dialog, wrapping from the last control to the first and back", async () => {
      const { dialog } = await openDialog();
      const confirm = confirmButton(dialog, "Reinstate username");
      confirm.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(confirm);
    });

    it("Escape closes it and gives focus back to the control that opened it", async () => {
      const { button } = await openDialog();
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(button);
    });

    it("Cancel closes it without a request and gives focus back too", async () => {
      const { button, dialog } = await openDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(decideUsernameReview).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(button);
    });
  });
});
