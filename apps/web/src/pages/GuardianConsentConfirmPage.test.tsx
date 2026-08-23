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
  };
});

import { confirmGuardianConsent } from "../api/auth";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(confirmGuardianConsent).mockReset();
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

  it("shows a decline acknowledgement and makes no API call when 'I do not consent' is clicked", () => {
    renderConfirmPage();

    fireEvent.click(screen.getByRole("button", { name: "I do not consent" }));

    expect(screen.getByText(/don.t need to do anything else/i)).not.toBeNull();
    expect(confirmGuardianConsent).not.toHaveBeenCalled();
  });
});
