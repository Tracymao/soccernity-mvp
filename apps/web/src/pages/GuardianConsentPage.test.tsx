// Following AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established
// pattern -- plain DOM assertions only, no @testing-library/jest-dom.
// Mocks src/api/auth.ts rather than hitting a real network call. Session
// is seeded directly into the in-memory session store (the real mechanism
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

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
import { getUser } from "../api/users";
import { seedSession, clearSession } from "../test/session";

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
  clearSession();
  vi.mocked(getGuardianConsentStatus).mockReset();
  vi.mocked(resendGuardianConsentRequest).mockReset();
  // The signed-in minor's own profile: its email is what the resend route needs
  // (QA D-03), its name personalises the approved heading.
  vi.mocked(getUser).mockReset();
  vi.mocked(getUser).mockResolvedValue({
    email: "minor@example.com",
    displayName: "Ade Bello",
  } as Awaited<ReturnType<typeof getUser>>);
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
    seedSession(fakeAccessToken());
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
    // QA D-03: the route looks the account up by the MINOR's own email.
    await waitFor(() => expect(resendGuardianConsentRequest).toHaveBeenCalledWith("minor@example.com"));
  });

  it("shows the registration status line on the pending view only (B-199, Decision Log #367)", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "guardian@example.com",
      canResend: true,
      consentTimestamp: null,
    });
    renderPage();
    const line = await screen.findByTestId("registration-status-line");
    expect(line.textContent).toMatch(/Registration cannot be completed until your guardian approves/);
    expect(line.textContent).toMatch(/card verification where required/);
    expect(line.textContent).toMatch(/\[COPY PENDING LEGAL REVIEW\]/);
  });

  it("does not show the registration status line once consent is confirmed", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "confirmed",
      guardianEmail: "guardian@example.com",
      canResend: false,
      consentTimestamp: "2026-09-01T10:00:00.000Z",
    });
    renderPage();
    await screen.findAllByText(/continue registration/i);
    expect(screen.queryByTestId("registration-status-line")).toBeNull();
  });

  it("offers Change guardian email as a link to the real screen in the pending state (not a disabled button)", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "guardian@example.com",
      canResend: true,
      consentTimestamp: null,
    });

    renderPage();

    const link = (await screen.findByRole("link", { name: /change guardian email/i })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/guardian-consent/change-email");
  });

  it("disables resend when canResend is false", async () => {
    seedSession(fakeAccessToken());
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

  // sprint-1/f5-f6-bugfixes -- Bug 1 fix, option (a). Confirms the dead
  // "you can resend once every 24 hours" footnote is genuinely gone, not
  // just harder to trigger -- checked in both the canResend:true (the
  // only real-world case, per getConsentStatus()'s own canResend ===
  // consentStatus === 'pending' definition) and canResend:false (the
  // artificial case the test above already exercises to check the
  // button's disabled state) shapes, since the old dead code was
  // specifically conditioned on canResend:false.
  it("never renders a resend-cooldown footnote, regardless of canResend", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "pending",
      guardianEmail: "guardian@example.com",
      canResend: false,
      consentTimestamp: null,
    });

    renderPage();
    await screen.findByText(/waiting for approval/i);

    expect(screen.queryByText(/once every 24 hours/i)).toBeNull();
  });

  it("renders the approved state when consentStatus is confirmed, and Continue registration goes to /continue", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({
      consentStatus: "confirmed",
      guardianEmail: "guardian@example.com",
      canResend: false,
      consentTimestamp: "2026-08-15T12:00:00.000Z",
      guardianFirstName: "Sarah",
      lastDecisionAt: "2026-08-15T12:00:00.000Z",
    });

    renderPage();

    // Frame 5108:6631: "Your account is approved, Ade" / "Sarah approved your
    // account on 15 August 2026." (minor's first name from the profile, the
    // guardian's first name and date from the status response, B-131).
    expect(await screen.findByText("Your account is approved, Ade")).not.toBeNull();
    expect(screen.getByText(/sarah approved your account on 15 august 2026/i)).not.toBeNull();
    expect(screen.getByText("Your profile will be visible")).not.toBeNull();
    // B-125: the CTA resolves the next onboarding step from the server.
    const cta = screen.getByRole("link", { name: /continue registration/i }) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/continue");
    expect(screen.queryByRole("link", { name: /go to my profile/i })).toBeNull();
  });

  // B-110 / B-125 (Decision Log #395, #402): `declined` is its own state and is
  // never rendered as pending. After decline 1 or 2 the session stays valid and
  // this is the page the minor sees.
  describe("declined (after guardian decline 1 or 2)", () => {
    function seedDeclined(canResend = true) {
      seedSession(fakeAccessToken());
      vi.mocked(getGuardianConsentStatus).mockResolvedValue({
        consentStatus: "declined",
        guardianEmail: "guardian@example.com",
        canResend,
        consentTimestamp: null,
      });
    }

    it("renders the decline view, not the pending view", async () => {
      seedDeclined();
      renderPage();

      expect(await screen.findByText(/your guardian hasn.t approved your account/i)).not.toBeNull();
      expect(screen.getByTestId("guardian-consent-declined")).not.toBeNull();
      expect(screen.queryByTestId("guardian-consent-pending")).toBeNull();
      expect(screen.queryByText(/waiting for approval/i)).toBeNull();
      expect(screen.getByText("Posting is limited")).not.toBeNull();
    });

    it("shows the static cap sentence but never a running decline count", async () => {
      seedDeclined();
      renderPage();

      const sentence = await screen.findByTestId("decline-cap-sentence");
      expect(sentence.textContent).toMatch(/a guardian can decline up to 3 times/i);
      // No "1 of 3" / "2 of 3" / "declined N times" counter anywhere on the page.
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/\b[123] of 3\b/);
      expect(text).not.toMatch(/declined \d+ time/i);
      expect(text).not.toMatch(/\d+ (declines|attempts) (left|remaining)/i);
    });

    it("offers resend and change-guardian-email", async () => {
      seedDeclined();
      renderPage();

      const link = (await screen.findByRole("link", { name: /change guardian email/i })) as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe("/guardian-consent/change-email");
      const resend = screen.getByRole("button", { name: /resend approval request/i }) as HTMLButtonElement;
      expect(resend.disabled).toBe(false);
    });

    it("resending posts the MINOR's own email (not the guardian's), then re-reads the status (QA D-03)", async () => {
      seedDeclined();
      vi.mocked(resendGuardianConsentRequest).mockResolvedValueOnce({ message: "sent" });
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: /resend approval request/i }));

      await waitFor(() => expect(resendGuardianConsentRequest).toHaveBeenCalledWith("minor@example.com"));
      expect(resendGuardianConsentRequest).not.toHaveBeenCalledWith("guardian@example.com");
      // Initial load + the re-read after a successful resend.
      await waitFor(() => expect(getGuardianConsentStatus).toHaveBeenCalledTimes(2));
    });

    it("names the guardian and the decision date when the status carries them (B-131, frame 5491:8241)", async () => {
      seedSession(fakeAccessToken());
      vi.mocked(getGuardianConsentStatus).mockResolvedValue({
        consentStatus: "declined",
        guardianEmail: "guardian@example.com",
        canResend: true,
        consentTimestamp: null,
        guardianFirstName: "Sarah",
        lastDecisionAt: "2026-08-15T10:00:00.000Z",
      });
      renderPage();

      expect(await screen.findByRole("heading", { name: /sarah hasn.t approved your account/i })).not.toBeNull();
      expect(screen.getByText(/chose not to approve your account on 15 august 2026/i)).not.toBeNull();
    });

    it("does not promise following to a restricted minor (QA D-13)", async () => {
      seedDeclined();
      renderPage();
      await screen.findByTestId("guardian-consent-declined");
      expect(document.body.textContent ?? "").not.toMatch(/follow teams/i);
    });

    it("disables resend when the server says the request cannot be reopened", async () => {
      seedDeclined(false);
      renderPage();

      const resend = (await screen.findByRole("button", {
        name: /resend approval request/i,
      })) as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
    });
  });

  it("shows a not-a-minor message on a 404 from the status endpoint", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(
      new AuthApiError("Couldn't load your guardian consent status (404).", { status: 404 }),
    );

    renderPage();

    expect(await screen.findByText(/only applies to accounts registered as under 18/i)).not.toBeNull();
  });

  it("shows a generic error state on an unexpected failure", async () => {
    seedSession(fakeAccessToken());
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(new AuthApiError("Server error", { status: 500 }));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn.t load your guardian consent status/i);
  });
});
