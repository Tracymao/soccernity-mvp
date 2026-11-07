// EmailChangeConfirmPage (/email-change/confirm?token=...): public, one POST per link.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { StrictMode } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import EmailChangeConfirmPage from "./EmailChangeConfirmPage";

vi.mock("../../api/emailChange", async () => {
  const actual = await vi.importActual<typeof import("../../api/emailChange")>("../../api/emailChange");
  return { ...actual, confirmEmailChange: vi.fn() };
});

import { EmailChangeApiError, confirmEmailChange } from "../../api/emailChange";
import { clearSession, heldAccessToken, seedSession } from "../../test/session";

let n = 0;
function renderAt(token: string | null, strict = false) {
  const url = token === null ? "/email-change/confirm" : `/email-change/confirm?token=${token}`;
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <EmailChangeConfirmPage />
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
const freshToken = () => `tok-${++n}`;

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(confirmEmailChange).mockReset();
});

describe("EmailChangeConfirmPage", () => {
  it("confirms once on load and shows Verified, then signs this browser out and points to log in", async () => {
    seedSession("some-access-token");
    vi.mocked(confirmEmailChange).mockResolvedValue(undefined);
    const token = freshToken();
    renderAt(token);
    expect(await screen.findByRole("heading", { name: "Your email is changed" })).not.toBeNull();
    expect(confirmEmailChange).toHaveBeenCalledTimes(1);
    expect(confirmEmailChange).toHaveBeenCalledWith(token);
    expect(heldAccessToken()).toBeNull();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });

  it("works with no session at all (the link is the credential)", async () => {
    vi.mocked(confirmEmailChange).mockResolvedValue(undefined);
    renderAt(freshToken());
    expect(await screen.findByRole("heading", { name: "Your email is changed" })).not.toBeNull();
  });

  it("never spends a single-use link twice under React StrictMode", async () => {
    vi.mocked(confirmEmailChange).mockResolvedValue(undefined);
    renderAt(freshToken(), true);
    await screen.findByRole("heading", { name: "Your email is changed" });
    expect(confirmEmailChange).toHaveBeenCalledTimes(1);
  });

  it("shows Link expired on the server's one invalid-link answer", async () => {
    vi.mocked(confirmEmailChange).mockRejectedValue(
      new EmailChangeApiError("x", { status: 400, code: "email_change_link_invalid" }),
    );
    renderAt(freshToken());
    expect(await screen.findByRole("heading", { name: "This link has expired" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Start again" }).getAttribute("href")).toBe(
      "/settings/account/information/change-email",
    );
    expect(screen.getByRole("link", { name: "Back to Account Information" }).getAttribute("href")).toBe(
      "/settings/account/information",
    );
  });

  it("does not sign this browser out when the link is invalid", async () => {
    seedSession("some-access-token");
    vi.mocked(confirmEmailChange).mockRejectedValue(
      new EmailChangeApiError("x", { status: 400, code: "email_change_link_invalid" }),
    );
    renderAt(freshToken());
    await screen.findByRole("heading", { name: "This link has expired" });
    expect(heldAccessToken()).toBe("some-access-token");
  });

  it("shows Link expired with no request when there is no token", () => {
    renderAt(null);
    expect(screen.getByRole("heading", { name: "This link has expired" })).not.toBeNull();
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });

  it("offers Try again after a network or server failure, and really retries", async () => {
    vi.mocked(confirmEmailChange)
      .mockRejectedValueOnce(new EmailChangeApiError("offline"))
      .mockResolvedValueOnce(undefined);
    renderAt(freshToken());
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Your email is changed" })).not.toBeNull();
    await waitFor(() => expect(confirmEmailChange).toHaveBeenCalledTimes(2));
  });
});
