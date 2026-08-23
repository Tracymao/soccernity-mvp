// Following AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established
// pattern -- plain DOM assertions only, no @testing-library/jest-dom.
// Mocks src/api/auth.ts rather than hitting a real network call. Session
// is seeded directly into sessionStorage (the real mechanism
// src/lib/session.ts reads, same one LoginPage.tsx writes) with a real,
// well-formed (if unsigned) JWT-shaped token, rather than mocking
// lib/session.ts itself -- exercises the real decode path too.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GuardianConsentPage from "./GuardianConsentPage";
import { AuthApiError } from "../api/auth";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    getGuardianConsentStatus: vi.fn(),
    resendGuardianConsentRequest: vi.fn(),
  };
});

import { getGuardianConsentStatus, resendGuardianConsentRequest } from "../api/auth";

function base64UrlEncode(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeAccessToken(sub = "minor-user-1"): string {
  const header = base64UrlEncode({ alg: "none", typ: "JWT" });
  const payload = base64UrlEncode({ sub, role: "fan" });
  return `${header}.${payload}.signature`;
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getGuardianConsentStatus).mockReset();
  vi.mocked(resendGuardianConsentRequest).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/guardian-consent"]}>
      <GuardianConsentPage />
    </MemoryRouter>,
  );
}

describe("GuardianConsentPage", () => {
  it("shows a log-in prompt and never calls the status endpoint when no session exists", () => {
    renderPage();

    expect(screen.getByText(/log in to see your guardian consent status/i)).not.toBeNull();
    expect(getGuardianConsentStatus).not.toHaveBeenCalled();
  });

  it("renders the restricted-pending state (screen 5) with only Section 8.3 step 5's three restrictions, and calls resend when eligible", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "guardian@example.com",
      canResend: true,
      consentTimestamp: null,
    });
    vi.mocked(resendGuardianConsentRequest).mockResolvedValueOnce({ message: "sent" });

    renderPage();

    expect(await screen.findByText(/waiting for approval/i)).not.toBeNull();
    expect(screen.getByText(/guardian@example.com/)).not.toBeNull();

    // Only the three Section 8.3 step 5 restrictions -- profile hidden,
    // DMs off, Banter Rooms read-only -- nothing invented beyond them.
    expect(screen.getByText("Your profile is hidden")).not.toBeNull();
    expect(screen.getByText("Direct messages are off")).not.toBeNull();
    expect(screen.getByText(/Banter Rooms & Community Groups are read-only/)).not.toBeNull();

    const resendButton = screen.getByRole("button", { name: /resend approval request/i }) as HTMLButtonElement;
    expect(resendButton.disabled).toBe(false);

    fireEvent.click(resendButton);
    await waitFor(() => expect(resendGuardianConsentRequest).toHaveBeenCalledWith("guardian@example.com"));
  });

  it("disables resend when canResend is false", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "guardian@example.com",
      canResend: false,
      consentTimestamp: null,
    });

    renderPage();

    const resendButton = (await screen.findByRole("button", {
      name: /resend approval request/i,
    })) as HTMLButtonElement;
    expect(resendButton.disabled).toBe(true);
  });

  it("renders the activation confirmation state (screen 6) when consentStatus is confirmed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "confirmed",
      guardianEmail: "guardian@example.com",
      canResend: false,
      consentTimestamp: "2026-08-15T12:00:00.000Z",
    });

    renderPage();

    expect(await screen.findByText(/you.re all set/i)).not.toBeNull();
    expect(screen.getByText("Your profile is visible")).not.toBeNull();
    expect(screen.getByRole("link", { name: /go to my profile/i })).not.toBeNull();
  });

  it("shows a not-a-minor message on a 404 from the status endpoint", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(
      new AuthApiError("Couldn't load your guardian consent status (404).", { status: 404 }),
    );

    renderPage();

    expect(await screen.findByText(/only applies to accounts registered as under 18/i)).not.toBeNull();
  });

  it("shows a generic error state on an unexpected failure", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(new AuthApiError("Server error", { status: 500 }));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t load your guardian consent status/i);
  });
});
