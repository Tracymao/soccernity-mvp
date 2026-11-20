// B-278: the pages the recovery emails link to. The guarantee under test everywhere: LOADING a page
// never changes anything (only GET link/:token may be called); every state change is a button press.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import RecoveryConfirmPage from "./RecoveryConfirmPage";
import RecoveryCancelPage from "./RecoveryCancelPage";
import RecoveryGuardianPage from "./RecoveryGuardianPage";
import { RecoveryApiError } from "../../../api/twoFactorRecovery";

vi.mock("../../../api/twoFactorRecovery", async () => {
  const actual = await vi.importActual<typeof import("../../../api/twoFactorRecovery")>(
    "../../../api/twoFactorRecovery",
  );
  return {
    ...actual,
    getRecoveryLink: vi.fn(),
    confirmRecovery: vi.fn(),
    cancelRecovery: vi.fn(),
    approveRecovery: vi.fn(),
    declineRecovery: vi.fn(),
  };
});
import {
  approveRecovery,
  cancelRecovery,
  confirmRecovery,
  declineRecovery,
  getRecoveryLink,
} from "../../../api/twoFactorRecovery";

function problem(p: "invalid" | "expired" | "used") {
  return new RecoveryApiError("x", { status: 400, code: `two_factor_recovery_link_${p}`, linkProblem: p });
}

function renderPage(element: ReactElement, url: string) {
  render(<MemoryRouter initialEntries={[url]}>{element}</MemoryRouter>);
}

const state = () => screen.getByTestId("two-factor-recovery-page").getAttribute("data-state");

const WRITES = [confirmRecovery, cancelRecovery, approveRecovery, declineRecovery];
function expectNoWrites() {
  for (const fn of WRITES) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const fn of [getRecoveryLink, ...WRITES]) vi.mocked(fn).mockReset();
});
afterEach(cleanup);

// -------------------------------------------------------------------------------------------------
describe("adult confirm page (/two-factor-recovery/confirm)", () => {
  const url = "/two-factor-recovery/confirm?token=tok-1";

  it("on load it only READS the link and changes nothing (a scanner opening it is harmless)", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    renderPage(<RecoveryConfirmPage />, url);
    expect(await screen.findByRole("heading", { name: "Remove two-factor from your account?" })).not.toBeNull();
    expect(getRecoveryLink).toHaveBeenCalledTimes(1);
    expect(getRecoveryLink).toHaveBeenCalledWith("tok-1");
    expectNoWrites();
  });

  it("2.1 shows the drawn copy and the Copy Tag chip", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    renderPage(<RecoveryConfirmPage />, url);
    await screen.findByRole("heading", { name: "Remove two-factor from your account?" });
    expect(screen.getByText("[COPY PENDING LEGAL REVIEW]")).not.toBeNull();
    expect(screen.getByText("Before you confirm")).not.toBeNull();
    expect(screen.getByText("We’ll email you a notice with a link to cancel.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "This wasn’t me" })).not.toBeNull();
  });

  it("Confirm calls POST confirm once and shows 2.2 with the time zone-aware date", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockResolvedValue({
      state: "waiting",
      executeAt: "2026-11-03T14:30:00.000Z",
      cancelToken: "cancel-1",
    });
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("heading", { name: "Your request has started" })).not.toBeNull();
    expect(confirmRecovery).toHaveBeenCalledTimes(1);
    expect(confirmRecovery).toHaveBeenCalledWith("tok-1");
    const lead = screen.getByText(/Two-factor will be turned off on/).textContent ?? "";
    expect(lead).toMatch(/2026/);
    expect(lead).toMatch(/November/);
    expect(lead).toMatch(/You’ll be signed out everywhere at that time\.$/);
    // The date carries a named time zone (e.g. "GMT", "UTC", "WAT", "EST").
    expect(lead).toMatch(/\b(UTC|GMT[+-]?\d*|[A-Z]{2,5})\b.*You’ll be signed out/);
    expect(screen.getByText("We’ve emailed you a notice with a link to cancel.")).not.toBeNull();
  });

  it("'Cancel this request' (2.2) asks first (2.3), then cancels with the in-memory cancel token (2.4)", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockResolvedValue({
      state: "waiting",
      executeAt: "2026-11-03T14:30:00.000Z",
      cancelToken: "cancel-1",
    });
    vi.mocked(cancelRecovery).mockResolvedValue({ state: "cancelled" });
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel this request" }));
    expect(await screen.findByRole("heading", { name: "Cancel this recovery request?" })).not.toBeNull();
    expect(cancelRecovery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel the request" }));
    expect(await screen.findByRole("heading", { name: "Request cancelled" })).not.toBeNull();
    expect(cancelRecovery).toHaveBeenCalledTimes(1);
    expect(cancelRecovery).toHaveBeenCalledWith("cancel-1");
    expect(screen.getByRole("link", { name: "Change my password" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("'Go back' from 2.3 returns to 2.2 without a call", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockResolvedValue({
      state: "waiting",
      executeAt: "2026-11-03T14:30:00.000Z",
      cancelToken: "cancel-1",
    });
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel this request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("heading", { name: "Your request has started" })).not.toBeNull();
    expect(cancelRecovery).not.toHaveBeenCalled();
  });

  it("'This wasn’t me' before confirming makes no call (nothing has started)", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "This wasn’t me" }));
    expect(await screen.findByRole("heading", { name: "Request cancelled" })).not.toBeNull();
    expectNoWrites();
  });

  it("keeps the cancel token out of storage, cookies and the address", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockResolvedValue({
      state: "waiting",
      executeAt: "2026-11-03T14:30:00.000Z",
      cancelToken: "cancel-secret-xyz",
    });
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await screen.findByRole("heading", { name: "Your request has started" });
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("cancel-secret-xyz");
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("cancel-secret-xyz");
    expect(document.cookie).not.toContain("cancel-secret-xyz");
    expect(window.location.href).not.toContain("cancel-secret-xyz");
  });

  it.each([
    ["invalid", "This link isn’t valid", "6914:34974"],
    ["expired", "This link has expired", "6914:35018"],
    ["used", "This link has already been used", "6914:35062"],
  ] as const)("a %s link on load shows %s (Figma %s) and calls no write", async (s, heading, _frame) => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: s, kind: s === "invalid" ? null : "adult" });
    renderPage(<RecoveryConfirmPage />, url);
    expect(await screen.findByRole("heading", { name: heading })).not.toBeNull();
    expectNoWrites();
    expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe("/login");
  });

  it("a missing token is 'not valid' and makes no call at all", () => {
    renderPage(<RecoveryConfirmPage />, "/two-factor-recovery/confirm");
    expect(screen.getByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
    expect(getRecoveryLink).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("a guardian link opened on the adult page is treated as not valid", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({
      state: "valid",
      kind: "guardian",
      minor: { publicName: "x" },
      requestedAt: "2026-11-02T10:00:00.000Z",
    });
    renderPage(<RecoveryConfirmPage />, url);
    expect(await screen.findByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
  });

  it("a link that went bad between the read and the press maps the 400 to its state", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockRejectedValue(problem("used"));
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("heading", { name: "This link has already been used" })).not.toBeNull();
  });

  it("any other failure of Confirm is a plain error line and the page stays", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    vi.mocked(confirmRecovery).mockRejectedValue(new RecoveryApiError("x", { status: 500 }));
    renderPage(<RecoveryConfirmPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
    expect(state()).toBe("confirm");
  });

  it("a failure to read the link shows a plain error line, not a blank page", async () => {
    vi.mocked(getRecoveryLink).mockRejectedValue(new RecoveryApiError("x", { status: 500 }));
    renderPage(<RecoveryConfirmPage />, url);
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn’t load this page/i);
    expectNoWrites();
  });
});

// -------------------------------------------------------------------------------------------------
describe("adult cancel page (/two-factor-recovery/cancel)", () => {
  const url = "/two-factor-recovery/cancel?token=cancel-9";

  it("on load it makes NO call at all (a cancel token has no read route; a scanner must not cancel)", () => {
    renderPage(<RecoveryCancelPage />, url);
    expect(screen.getByRole("heading", { name: "Cancel this recovery request?" })).not.toBeNull();
    expect(getRecoveryLink).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("the button calls POST cancel with the token from the address, then shows 2.4", async () => {
    vi.mocked(cancelRecovery).mockResolvedValue({ state: "cancelled" });
    renderPage(<RecoveryCancelPage />, url);
    fireEvent.click(screen.getByRole("button", { name: "Cancel the request" }));
    expect(await screen.findByRole("heading", { name: "Request cancelled" })).not.toBeNull();
    expect(cancelRecovery).toHaveBeenCalledTimes(1);
    expect(cancelRecovery).toHaveBeenCalledWith("cancel-9");
    expect(screen.getByText("Two-factor stays on. As someone else may know your password, we recommend you change it now.")).not.toBeNull();
  });

  it("'Go back' leaves for the log-in page and calls nothing", () => {
    renderPage(<RecoveryCancelPage />, url);
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/login");
    expectNoWrites();
  });

  it.each([
    ["invalid", "This link isn’t valid"],
    ["expired", "This link has expired"],
    ["used", "This link has already been used"],
  ] as const)("a rejected cancel (%s) shows its state", async (p, heading) => {
    vi.mocked(cancelRecovery).mockRejectedValue(problem(p));
    renderPage(<RecoveryCancelPage />, url);
    fireEvent.click(screen.getByRole("button", { name: "Cancel the request" }));
    expect(await screen.findByRole("heading", { name: heading })).not.toBeNull();
  });

  it("a missing token is 'not valid' and makes no call", () => {
    renderPage(<RecoveryCancelPage />, "/two-factor-recovery/cancel");
    expect(screen.getByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
    expectNoWrites();
  });
});

// -------------------------------------------------------------------------------------------------
describe("guardian page (/two-factor-recovery/guardian)", () => {
  const url = "/two-factor-recovery/guardian?token=g-1";
  const VALID = {
    state: "valid" as const,
    kind: "guardian" as const,
    minor: { publicName: "nelson_iheagwam" },
    requestedAt: "2026-11-02T10:15:00.000Z",
  };

  it("on load it only READS the link; Approve and decline are untouched until pressed", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    renderPage(<RecoveryGuardianPage />, url);
    expect(await screen.findByRole("heading", { name: "Approve removing two-factor?" })).not.toBeNull();
    expect(getRecoveryLink).toHaveBeenCalledTimes(1);
    expect(getRecoveryLink).toHaveBeenCalledWith("g-1");
    expectNoWrites();
  });

  it("3.1 shows the summary: the PUBLIC name and the time, and the two actions", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    renderPage(<RecoveryGuardianPage />, url);
    await screen.findByRole("heading", { name: "Approve removing two-factor?" });
    expect(screen.getByText("Account")).not.toBeNull();
    expect(screen.getByText("nelson_iheagwam")).not.toBeNull();
    expect(screen.getByText("Asked on")).not.toBeNull();
    expect(screen.getByText(/2026/)).not.toBeNull();
    expect(screen.getByText("Two-factor is removed from the account.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "I didn’t expect this" })).not.toBeNull();
  });

  it("Approve calls POST guardian/approve once and shows 3.2", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    vi.mocked(approveRecovery).mockResolvedValue({ state: "done" });
    renderPage(<RecoveryGuardianPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("heading", { name: "Request approved" })).not.toBeNull();
    expect(approveRecovery).toHaveBeenCalledTimes(1);
    expect(approveRecovery).toHaveBeenCalledWith("g-1");
    expect(declineRecovery).not.toHaveBeenCalled();
  });

  it("'I didn’t expect this' calls POST guardian/decline once and shows 3.3 with the advice", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    vi.mocked(declineRecovery).mockResolvedValue({ state: "declined" });
    renderPage(<RecoveryGuardianPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "I didn’t expect this" }));
    expect(await screen.findByRole("heading", { name: "Request declined" })).not.toBeNull();
    expect(declineRecovery).toHaveBeenCalledWith("g-1");
    expect(approveRecovery).not.toHaveBeenCalled();
    expect(screen.getByText("Someone else may know the account’s password. Ask them to change it now.")).not.toBeNull();
  });

  it("3.4 expired and 3.5 already used, from the read", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "expired", kind: "guardian" });
    renderPage(<RecoveryGuardianPage />, url);
    expect(await screen.findByRole("heading", { name: "This link has expired" })).not.toBeNull();
    expect(
      screen.getByText("The request can no longer be approved. The young person can ask again from sign-in."),
    ).not.toBeNull();
    cleanup();
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "used", kind: "guardian" });
    renderPage(<RecoveryGuardianPage />, url);
    expect(await screen.findByRole("heading", { name: "This link has already been used" })).not.toBeNull();
    expect(
      screen.getByText("This request has already been answered, so there is nothing more to do."),
    ).not.toBeNull();
    expectNoWrites();
  });

  it("an unknown link reuses the not-valid copy (no guardian frame exists for it)", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "invalid", kind: null });
    renderPage(<RecoveryGuardianPage />, url);
    expect(await screen.findByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
  });

  it("an adult link opened on the guardian page is not valid there", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue({ state: "valid", kind: "adult" });
    renderPage(<RecoveryGuardianPage />, url);
    expect(await screen.findByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
    expectNoWrites();
  });

  it("a link that expired between the read and Approve maps the 400 to 3.4", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    vi.mocked(approveRecovery).mockRejectedValue(problem("expired"));
    renderPage(<RecoveryGuardianPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("heading", { name: "This link has expired" })).not.toBeNull();
  });

  it("recovery unavailable (503) on Approve is a plain error line and the page stays", async () => {
    vi.mocked(getRecoveryLink).mockResolvedValue(VALID);
    vi.mocked(approveRecovery).mockRejectedValue(
      new RecoveryApiError("x", { status: 503, code: "two_factor_recovery_unavailable" }),
    );
    renderPage(<RecoveryGuardianPage />, url);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/recovery isn’t available right now/i));
    expect(state()).toBe("summary");
  });

  it("a missing token is not valid and makes no call", () => {
    renderPage(<RecoveryGuardianPage />, "/two-factor-recovery/guardian");
    expect(screen.getByRole("heading", { name: "This link isn’t valid" })).not.toBeNull();
    expect(getRecoveryLink).not.toHaveBeenCalled();
  });
});
