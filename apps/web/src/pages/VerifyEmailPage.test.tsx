// Following GuardianConsentConfirmPage.test.tsx's established pattern --
// plain DOM assertions only, no @testing-library/jest-dom (not a
// devDependency here). Mocks ../api/auth's verifyEmail rather than hitting
// a real network call.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import VerifyEmailPage from "./VerifyEmailPage";
import { AuthApiError } from "../api/auth";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    verifyEmail: vi.fn(),
  };
});

import { verifyEmail } from "../api/auth";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(verifyEmail).mockReset();
});

function renderVerifyPage(searchParams = "?token=real-token-123") {
  render(
    <MemoryRouter initialEntries={[`/verify-email${searchParams}`]}>
      <VerifyEmailPage />
    </MemoryRouter>,
  );
}

describe("VerifyEmailPage", () => {
  it("auto-fires POST /auth/verify-email on mount when a token is present", () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({
      verified: true,
      userId: "user-1",
      guardianConsentStatus: "not_applicable",
    });

    renderVerifyPage();

    expect(verifyEmail).toHaveBeenCalledWith("real-token-123");
    expect(screen.getByText(/verifying your email/i)).not.toBeNull();
  });

  it("shows the missing-token state and never calls the API when ?token= is absent", () => {
    renderVerifyPage("");

    expect(screen.getByText(/missing its verification token/i)).not.toBeNull();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("renders the Verified state after a successful POST /auth/verify-email for a non-minor (guardianConsentStatus: not_applicable)", async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({
      verified: true,
      userId: "user-1",
      guardianConsentStatus: "not_applicable",
    });

    renderVerifyPage();

    const heading = await screen.findByText("Email verified");
    expect(heading).not.toBeNull();
    const cta = screen.getByRole("link", { name: /continue to soccernity/i }) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/profile");
    // Never the distinct pending-consent copy.
    expect(screen.queryByText(/approval still pending/i)).toBeNull();
  });

  it("renders the Verified state after a successful POST /auth/verify-email for a minor whose guardian already confirmed", async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({
      verified: true,
      userId: "user-1",
      guardianConsentStatus: "confirmed",
    });

    renderVerifyPage();

    expect(await screen.findByText("Email verified")).not.toBeNull();
    expect(screen.queryByText(/approval still pending/i)).toBeNull();
  });

  it("renders a genuinely distinct state -- not the ordinary Verified state -- for a minor whose guardian consent is still pending (Decision Log #38)", async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({
      verified: true,
      userId: "user-1",
      guardianConsentStatus: "pending",
    });

    renderVerifyPage();

    expect(await screen.findByText(/approval still pending/i)).not.toBeNull();
    // Never claims full/ordinary access.
    expect(screen.queryByText("Email verified")).toBeNull();
    expect(screen.queryByRole("link", { name: /continue to soccernity/i })).toBeNull();

    const cta = screen.getByRole("link", { name: /check my guardian consent status/i }) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/guardian-consent");
  });

  it("renders a generic error state on a rejected/failed verification call, without leaking which reason", async () => {
    vi.mocked(verifyEmail).mockRejectedValueOnce(
      new AuthApiError("This verification link is invalid or has expired."),
    );

    renderVerifyPage();

    expect(await screen.findByText(/no longer valid/i)).not.toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/invalid or has expired/i);
  });

  it("renders a real, enabled mailto: support link on the error state, not a disabled button (Decision Log #37)", async () => {
    vi.mocked(verifyEmail).mockRejectedValueOnce(
      new AuthApiError("This verification link is invalid or has expired."),
    );

    renderVerifyPage();

    const supportLink = (await screen.findByRole("link", {
      name: /contact support/i,
    })) as HTMLAnchorElement;
    expect(supportLink.getAttribute("href")).toBe("mailto:support@soccernity.com?subject=Email%20verification%20help");
    expect(supportLink.hasAttribute("disabled")).toBe(false);
  });

  it("renders a real, enabled mailto: support link on the missing-token state, not a disabled button (Decision Log #37)", () => {
    renderVerifyPage("");

    const supportLink = screen.getByRole("link", { name: /contact support/i }) as HTMLAnchorElement;
    expect(supportLink.getAttribute("href")).toBe("mailto:support@soccernity.com?subject=Email%20verification%20help");
    expect(supportLink.hasAttribute("disabled")).toBe(false);
  });
});
