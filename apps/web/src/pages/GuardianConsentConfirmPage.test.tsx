// Following AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established
// pattern -- plain DOM assertions only, no @testing-library/jest-dom.
// Mocks src/api/auth.ts rather than hitting a real network call.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GuardianConsentConfirmPage from "./GuardianConsentConfirmPage";
import { AuthApiError } from "../api/auth";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    confirmGuardianConsent: vi.fn(),
    declineGuardianConsent: vi.fn(),
  };
});

import { confirmGuardianConsent, declineGuardianConsent } from "../api/auth";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(confirmGuardianConsent).mockReset();
  vi.mocked(declineGuardianConsent).mockReset();
});

function renderConfirmPage(searchParams = "?token=real-token-123") {
  render(
    <MemoryRouter initialEntries={[`/guardian-consent/confirm${searchParams}`]}>
      <GuardianConsentConfirmPage />
    </MemoryRouter>,
  );
}

describe("GuardianConsentConfirmPage", () => {
  it("is genuinely public -- works correctly with no auth/session present in storage", () => {
    // Prove this route is actually public, not just unguarded by
    // accident: clear every session mechanism this app has (see
    // src/lib/session.ts) before rendering, and confirm the page still
    // renders and can still call the confirm endpoint.
    window.sessionStorage.clear();
    window.localStorage.clear();
    expect(window.sessionStorage.getItem("sn_access_token")).toBeNull();
    expect(window.localStorage.getItem("sn_access_token")).toBeNull();

    vi.mocked(confirmGuardianConsent).mockResolvedValueOnce({ message: "Guardian consent confirmed." });

    renderConfirmPage();

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "I consent" }));

    expect(confirmGuardianConsent).toHaveBeenCalledWith("real-token-123");
  });

  it("shows a missing-token state and never calls the API when ?token= is absent", () => {
    renderConfirmPage("");

    expect(screen.getByRole("alert").textContent).toMatch(/missing its approval token/i);
    expect(confirmGuardianConsent).not.toHaveBeenCalled();
  });

  it("disables the I consent button until the confirmation checkbox is checked", () => {
    renderConfirmPage();

    const consentButton = screen.getByRole("button", { name: "I consent" }) as HTMLButtonElement;
    expect(consentButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(consentButton.disabled).toBe(false);
  });

  it("shows a generic confirmed message after a successful POST /auth/guardian-consent", async () => {
    vi.mocked(confirmGuardianConsent).mockResolvedValueOnce({ message: "Guardian consent confirmed." });

    renderConfirmPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "I consent" }));

    expect(await screen.findByText(/your approval has been recorded/i)).not.toBeNull();
  });

  it("shows a generic error message on an invalid/expired token, without leaking which reason", async () => {
    vi.mocked(confirmGuardianConsent).mockRejectedValueOnce(
      new AuthApiError("This link is invalid or has expired. Ask the account holder to resend the approval request."),
    );

    renderConfirmPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "I consent" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/invalid or has expired/i);
  });

  it("calls POST /auth/guardian-consent/decline with the URL token and shows a real declined state", async () => {
    vi.mocked(declineGuardianConsent).mockResolvedValueOnce({ message: "Guardian consent declined." });

    renderConfirmPage();
    fireEvent.click(screen.getByRole("button", { name: "I do not consent" }));

    expect(await screen.findByText(/your decision has been recorded/i)).not.toBeNull();
    expect(screen.getByText(/scheduled for\s+deletion/i)).not.toBeNull();
    expect(declineGuardianConsent).toHaveBeenCalledWith("real-token-123");
    expect(confirmGuardianConsent).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "I consent" })).toBeNull();
  });

  it("shows the backend's 'already confirmed' message verbatim when declining a confirmed account", async () => {
    vi.mocked(declineGuardianConsent).mockRejectedValueOnce(
      new AuthApiError("Consent for this account has already been confirmed. Request a withdrawal link instead.", {
        status: 400,
      }),
    );

    renderConfirmPage();
    fireEvent.click(screen.getByRole("button", { name: "I do not consent" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already been confirmed/i);
    expect(alert.textContent).not.toMatch(/invalid or has expired/i);
  });

  it("shows the backend's 'declined or withdrawn' message when confirming a declined account", async () => {
    vi.mocked(confirmGuardianConsent).mockRejectedValueOnce(
      new AuthApiError("Consent for this account was declined or withdrawn and cannot be confirmed with this link.", {
        status: 400,
      }),
    );

    renderConfirmPage();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "I consent" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/declined or withdrawn/i);
  });

  it("shows an error and re-enables both buttons when the decline call fails", async () => {
    vi.mocked(declineGuardianConsent).mockRejectedValueOnce(new AuthApiError("Couldn't reach the Soccernity server."));

    renderConfirmPage();
    fireEvent.click(screen.getByRole("button", { name: "I do not consent" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t reach/i);
    expect((screen.getByRole("button", { name: "I do not consent" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never calls decline when ?token= is absent", () => {
    renderConfirmPage("");
    expect(declineGuardianConsent).not.toHaveBeenCalled();
  });
});
