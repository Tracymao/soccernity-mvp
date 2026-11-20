// Following AgeGateStep.test.tsx/ClubPickerStep.test.tsx's established
// pattern -- plain DOM assertions only, no @testing-library/jest-dom.
// Mocks src/api/auth.ts rather than hitting a real network call.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import GuardianConsentConfirmPage from "./GuardianConsentConfirmPage";
import { AuthApiError } from "../api/auth";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    confirmGuardianConsent: vi.fn(),
    declineGuardianConsent: vi.fn(),
    getGuardianRequestSummary: vi.fn(),
    reportIncorrectGuardianDetails: vi.fn(),
  };
});

import {
  confirmGuardianConsent,
  declineGuardianConsent,
  getGuardianRequestSummary,
  reportIncorrectGuardianDetails,
} from "../api/auth";
import type { GuardianRequestSummary } from "../api/auth";
import { clearSession, heldAccessToken } from "../test/session";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(confirmGuardianConsent).mockReset();
  vi.mocked(declineGuardianConsent).mockReset();
  vi.mocked(getGuardianRequestSummary).mockReset();
  vi.mocked(reportIncorrectGuardianDetails).mockReset();
  // Most tests do not care about the summary: a rejected lookup is the
  // page's documented "carry on as before" path (an invalid token).
  vi.mocked(getGuardianRequestSummary).mockRejectedValue(new Error("no summary"));
});

const SUMMARY: GuardianRequestSummary = {
  minorName: "Ade Bello",
  dateOfBirth: "2011-09-04",
  guardianName: "Sarah Bello",
  guardianRelationship: "Parent",
  expiresAt: "2026-09-05T10:00:00.000Z",
  requestedAt: "2026-08-15T10:00:00.000Z",
  incorrectDetailsReported: false,
  notices: { guardianEmailShownOnMinorProfile: true, photoAndUsernameVisibleToOthers: true },
};

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
    clearSession();
    expect(heldAccessToken()).toBeNull();
    expect(heldAccessToken()).toBeNull();

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

    // W9 (B-079, Figma 5488:7164): "Thank you -- {name} can continue".
    expect(await screen.findByRole("heading", { name: /thank you — the account holder can continue/i })).not.toBeNull();
    // QA D-09: the minor still has to verify email and create a profile, so the
    // account is not "now active" at this point.
    expect(document.body.textContent ?? "").not.toMatch(/now active/i);
    expect(screen.getByText(/can now continue registration/i)).not.toBeNull();
  });

  // W9 (B-078, B-176): the request-time layout of Figma 5108:6629.
  describe("request-time layout (B-078 / B-176)", () => {
    it("is one bordered card with personalised heading and intro when the request summary loaded", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue(SUMMARY);
      renderConfirmPage();
      await screen.findByTestId("request-summary");
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toBe("Do you give permission for Ade to use Soccernity?");
      expect(document.querySelectorAll(".consent-card--main")).toHaveLength(1);
      expect(document.body.textContent).toMatch(
        /Ade named you as their parent or guardian\. Please read this before you decide/,
      );
      expect(screen.getByRole("heading", { name: "What Ade will be able to do" })).not.toBeNull();
      expect(screen.getByText("Anything Ade chooses to post")).not.toBeNull();
      expect(screen.getByText("Ade’s profile will not be indexed by Google or shown to logged-out visitors.")).not.toBeNull();
      expect(screen.getByText("Only accounts Ade follows can start a direct message.")).not.toBeNull();
    });

    it("falls back to 'this account' / 'the account holder' when there is no summary (nothing is guessed)", () => {
      renderConfirmPage();
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toBe("Do you give permission for this account to use Soccernity?");
      expect(document.body.textContent).toMatch(/You were named as the parent or guardian for a new Soccernity account\./);
      expect(screen.getByRole("heading", { name: "What the account holder will be able to do" })).not.toBeNull();
      expect(screen.getByText("Only accounts the account holder follows can start a direct message.")).not.toBeNull();
    });

    it("has the sections in the frame's order, including the new 'What we collect' list with four tagged rows", () => {
      renderConfirmPage();
      const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual([
        "What the account holder will be able to do",
        "What we collect",
        "What stays switched off for under-18 accounts",
        "Your email on their profile",
      ]);
      const collect = screen.getByRole("heading", { name: "What we collect" }).closest("section") as HTMLElement;
      const rows = collect.querySelectorAll(".consent-row");
      expect(rows).toHaveLength(4);
      expect([...rows].map((r) => r.querySelector(".consent-row__title")?.textContent)).toEqual([
        "Name and date of birth",
        "Email address",
        "Anything the account holder chooses to post",
        "Your name, email and relationship",
      ]);
      // Every new guardian-facing sentence carries the tag (it is also in the manifest).
      for (const row of rows) {
        expect(row.querySelector(".consent-row__body")?.textContent).toMatch(/\[COPY PENDING LEGAL REVIEW\]$/);
      }
      expect(collect.textContent).toMatch(/never shown publicly/);
    });

    it("tags the intro sentence", () => {
      renderConfirmPage();
      expect(document.querySelector(".consent-page__subheading")?.textContent).toMatch(
        /what we collect\. \[COPY PENDING LEGAL REVIEW\]$/,
      );
    });

    it("sections are labelled regions (keyboard / screen-reader structure)", () => {
      renderConfirmPage();
      const regions = document.querySelectorAll("section[aria-labelledby]");
      expect(regions).toHaveLength(4);
      for (const region of regions) {
        const id = region.getAttribute("aria-labelledby") as string;
        expect(document.getElementById(id)?.textContent).toBeTruthy();
      }
    });
  });

  // W9 (B-079, Figma 5488:7164): the guardian's approved screen.
  describe("approved screen (B-079)", () => {
    async function approve(summary: GuardianRequestSummary | null) {
      if (summary) vi.mocked(getGuardianRequestSummary).mockResolvedValue(summary);
      vi.mocked(confirmGuardianConsent).mockResolvedValueOnce({ message: "Guardian consent confirmed." });
      renderConfirmPage();
      if (summary) await screen.findByTestId("request-summary");
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "I consent" }));
      await screen.findByRole("heading", { name: /thank you/i });
    }

    it("names the account holder, shows the date it was recorded and the 'What happens next' card", async () => {
      await approve(SUMMARY);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Thank you — Ade can continue");
      expect(screen.getByRole("status").textContent).toMatch(
        /^Recorded on \d{1,2} [A-Z][a-z]+ \d{4}\. Ade can now continue registration, with under-18 protections in place\. \[COPY PENDING LEGAL REVIEW\]$/,
      );
      expect(screen.getByText("What happens next")).not.toBeNull();
      expect(screen.getByText("Ade continues registration")).not.toBeNull();
      expect(screen.getByText(/Ade now sets up a profile and picks a club\. \[COPY PENDING LEGAL REVIEW\]/)).not.toBeNull();
      expect(screen.getByText("You stay in control")).not.toBeNull();
      expect(screen.getByText("Nothing else is needed from you")).not.toBeNull();
      // The form is gone and nothing says the account is active.
      expect(screen.queryByRole("button", { name: "I consent" })).toBeNull();
      expect(document.body.textContent ?? "").not.toMatch(/now active|is active/i);
    });

    it("every new sentence on the approved screen is tagged", async () => {
      await approve(SUMMARY);
      const bodies = [...document.querySelectorAll(".consent-row__body")].map((el) => el.textContent ?? "");
      expect(bodies).toHaveLength(3);
      for (const body of bodies) expect(body).toMatch(/\[COPY PENDING LEGAL REVIEW\]$/);
    });

    it("links 'guardian withdrawal page' to /guardian-consent/withdraw and Done to the home page", async () => {
      await approve(SUMMARY);
      expect(
        (screen.getByRole("link", { name: "guardian withdrawal page" }) as HTMLAnchorElement).getAttribute("href"),
      ).toBe("/guardian-consent/withdraw");
      expect((screen.getByRole("link", { name: "Done" }) as HTMLAnchorElement).getAttribute("href")).toBe("/");
    });

    it("without a summary it still reads correctly (no invented name)", async () => {
      await approve(null);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Thank you — the account holder can continue");
      expect(screen.getByText("The account holder continues registration")).not.toBeNull();
    });
  });

  it("no longer promises a player profile or following (Decision Log #377, QA D-13/D-15)", () => {
    renderConfirmPage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/player profile/i);
    expect(text).not.toMatch(/follow teams/i);
    // The drafting note that used to sit in the footnote is gone.
    expect(text).not.toMatch(/not reproduced here/i);
    expect(text).not.toMatch(/isn't backed by a real policy/i);
  });

  it("states the decline cap to the guardian instead of 'declining closes the account' (B-130)", () => {
    renderConfirmPage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/declining closes the account/i);
    expect(text).toMatch(/you can decline up to 3 times/i);
    expect(text).toMatch(/after the third decline the account is scheduled for deletion/i);
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
    // Declines 1 and 2 do NOT schedule deletion: the state carries the cap
    // sentence, never a claim that this decline closed the account (B-130).
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/will stay closed|will be scheduled for deletion/i);
    expect(body).toMatch(/you can decline up to 3 times/i);
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

  // B-021 / B-029 (Decision Log #372): the request summary, the "Report
  // incorrect details" action and the approval-on-hold state.
  describe("request summary, report incorrect details and approval on hold", () => {
    it("loads the summary with the URL token and shows what the guardian is being asked to approve", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue(SUMMARY);
      renderConfirmPage();

      const panel = await screen.findByTestId("request-summary");
      expect(getGuardianRequestSummary).toHaveBeenCalledWith("real-token-123");
      expect(panel.textContent).toContain("Ade Bello");
      expect(panel.textContent).toContain("4 September 2011");
      expect(panel.textContent).toContain("Parent");
      expect(panel.textContent).toContain("15 August 2026");
      expect(screen.queryByTestId("approval-on-hold")).toBeNull();
    });

    it("the footnote has the link-expiry sentence (from the summary), the cap, and the withdrawal sentence, each tagged", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue(SUMMARY);
      renderConfirmPage();
      await screen.findByTestId("request-summary");
      const footnote = [...document.querySelectorAll(".consent-footnote")].find((el) =>
        /guardian withdrawal page/.test(el.textContent ?? ""),
      ) as HTMLElement;
      expect(footnote.textContent).toMatch(/This link expires on 5 September 2026\. \[COPY PENDING LEGAL REVIEW\]/);
      expect(footnote.textContent).toMatch(/You can decline up to 3 times/);
      expect(footnote.textContent).toMatch(/withdraw consent at any time on the guardian withdrawal page\. \[COPY PENDING LEGAL REVIEW\]/);
      expect(screen.getByRole("link", { name: "Privacy Policy" })).not.toBeNull();
    });

    it("'guardian withdrawal page' is a link to /guardian-consent/withdraw with no token (Decision Log #415 item 1)", () => {
      renderConfirmPage();
      const link = screen.getByRole("link", { name: "guardian withdrawal page" }) as HTMLAnchorElement;
      // No ?token=: the guardian lands on the request step, not on a Confirm step for this consent token.
      expect(link.getAttribute("href")).toBe("/guardian-consent/withdraw");
    });

    it("without a summary the expiry sentence is left out rather than guessed", () => {
      renderConfirmPage();
      const footnote = [...document.querySelectorAll(".consent-footnote")].find((el) =>
        /guardian withdrawal page/.test(el.textContent ?? ""),
      ) as HTMLElement;
      expect(footnote.textContent).not.toMatch(/This link expires/);
      expect(footnote.textContent).toMatch(/withdraw consent at any time/);
    });

    it("posts only the token when the guardian reports incorrect details, then shows approval on hold", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue(SUMMARY);
      vi.mocked(reportIncorrectGuardianDetails).mockResolvedValue({ message: "ok" });
      renderConfirmPage();

      fireEvent.click(await screen.findByRole("button", { name: /report incorrect details/i }));

      await waitFor(() => expect(reportIncorrectGuardianDetails).toHaveBeenCalledWith("real-token-123"));
      expect(await screen.findByTestId("approval-on-hold")).not.toBeNull();
      // The action is used up, not offered twice.
      expect(screen.queryByRole("button", { name: /report incorrect details/i })).toBeNull();
    });

    it("shows approval on hold from the first paint when a report is already open, and blocks approving", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue({ ...SUMMARY, incorrectDetailsReported: true });
      renderConfirmPage();

      expect(await screen.findByTestId("approval-on-hold")).not.toBeNull();
      expect(screen.queryByRole("button", { name: /report incorrect details/i })).toBeNull();

      fireEvent.click(screen.getByRole("checkbox"));
      const consent = screen.getByRole("button", { name: "I consent" }) as HTMLButtonElement;
      expect(consent.disabled).toBe(true);
      fireEvent.click(consent);
      expect(confirmGuardianConsent).not.toHaveBeenCalled();
    });

    it("keeps DECLINE available while approval is on hold", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue({ ...SUMMARY, incorrectDetailsReported: true });
      vi.mocked(declineGuardianConsent).mockResolvedValue({ message: "declined" });
      renderConfirmPage();

      await screen.findByTestId("approval-on-hold");
      const decline = screen.getByRole("button", { name: "I do not consent" }) as HTMLButtonElement;
      expect(decline.disabled).toBe(false);
      fireEvent.click(decline);
      await waitFor(() => expect(declineGuardianConsent).toHaveBeenCalledWith("real-token-123"));
    });

    it("shows an error and no hold when the report call fails", async () => {
      vi.mocked(getGuardianRequestSummary).mockResolvedValue(SUMMARY);
      vi.mocked(reportIncorrectGuardianDetails).mockRejectedValue(new AuthApiError("nope", { status: 429 }));
      renderConfirmPage();

      fireEvent.click(await screen.findByRole("button", { name: /report incorrect details/i }));

      expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t send that just now/i);
      expect(screen.queryByTestId("approval-on-hold")).toBeNull();
    });

    it("carries on as before when the summary lookup fails (invalid token): no panel, no hold", async () => {
      renderConfirmPage();
      await waitFor(() => expect(getGuardianRequestSummary).toHaveBeenCalled());
      expect(screen.queryByTestId("request-summary")).toBeNull();
      expect(screen.queryByTestId("approval-on-hold")).toBeNull();
      expect(screen.getByRole("button", { name: "I do not consent" })).not.toBeNull();
    });

    it("does not look up a summary when ?token= is absent", () => {
      renderConfirmPage("");
      expect(getGuardianRequestSummary).not.toHaveBeenCalled();
    });
  });
});
