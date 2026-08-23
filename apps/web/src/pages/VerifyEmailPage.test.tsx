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
    vi.mocked(verifyEmail).mockResolvedValueOnce({ verified: true, userId: "user-1" });

    renderVerifyPage();

    expect(verifyEmail).toHaveBeenCalledWith("real-token-123");
    expect(screen.getByText(/verifying your email/i)).not.toBeNull();
  });

  it("shows the missing-token state and never calls the API when ?token= is absent", () => {
    renderVerifyPage("");

    expect(screen.getByText(/missing its verification token/i)).not.toBeNull();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("renders the Verified state after a successful POST /auth/verify-email", async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({ verified: true, userId: "user-1" });

    renderVerifyPage();

    expect(await screen.findByText(/email verified/i)).not.toBeNull();
    const cta = screen.getByRole("link", { name: /continue to soccernity/i }) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/profile");
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
});
