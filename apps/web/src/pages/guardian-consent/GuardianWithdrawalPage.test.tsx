// GuardianWithdrawalPage -- six states, one route. Mocks the two API calls; the route is mounted
// through the real route table in router.test.tsx-style, here through MemoryRouter for the page alone.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import GuardianWithdrawalPage from "./GuardianWithdrawalPage";
import { AuthApiError } from "../../api/auth";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, requestGuardianWithdrawal: vi.fn(), withdrawGuardianConsent: vi.fn() };
});
import { requestGuardianWithdrawal, withdrawGuardianConsent } from "../../api/auth";

beforeEach(() => {
  vi.mocked(requestGuardianWithdrawal).mockReset();
  vi.mocked(withdrawGuardianConsent).mockReset();
});
afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderPage(entry = "/guardian-consent/withdraw") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <GuardianWithdrawalPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const step = () => screen.getByTestId("guardian-withdrawal").getAttribute("data-step");

async function sendRequest(email = "kid@example.com") {
  fireEvent.change(screen.getByLabelText("Email address of the Soccernity account"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send withdrawal link" }));
}

describe("GuardianWithdrawalPage", () => {
  describe("frame 1 - request (no token in the link)", () => {
    it("opens on the request step: heading, the minor's-email field with its hint, and the button", () => {
      renderPage();
      expect(step()).toBe("request");
      expect(screen.getByRole("heading", { name: "Withdraw your consent" })).not.toBeNull();
      expect(screen.getByLabelText("Email address of the Soccernity account")).not.toBeNull();
      expect(screen.getByText("This is the email the account was registered with, not your own.")).not.toBeNull();
      expect(screen.getByRole("button", { name: "Send withdrawal link" })).not.toBeNull();
      expect(requestGuardianWithdrawal).not.toHaveBeenCalled();
    });

    it("rejects a malformed address before calling the API", () => {
      renderPage();
      sendRequest("not-an-email");
      expect(screen.getByRole("alert").textContent).toMatch(/email address of the Soccernity account/);
      expect(requestGuardianWithdrawal).not.toHaveBeenCalled();
    });

    it("sends the (trimmed) email and moves to frame 2", async () => {
      vi.mocked(requestGuardianWithdrawal).mockResolvedValue({ message: "ok" });
      renderPage();
      sendRequest("  kid@example.com ");
      await screen.findByRole("heading", { name: "Check the guardian’s inbox" });
      expect(requestGuardianWithdrawal).toHaveBeenCalledWith("kid@example.com");
      expect(step()).toBe("sent");
    });
  });

  describe("frame 2 - request sent (one answer, whatever the server knew)", () => {
    it("says only that a link HAS BEEN sent IF the account had confirmed consent, and nothing has changed", async () => {
      vi.mocked(requestGuardianWithdrawal).mockResolvedValue({ message: "ok" });
      renderPage();
      sendRequest();
      await screen.findByRole("heading", { name: "Check the guardian’s inbox" });
      expect(screen.getByText(/If that account has confirmed guardian consent/)).not.toBeNull();
      expect(screen.getByText(/Nothing has changed yet/)).not.toBeNull();
    });

    it("the page is identical for any address: it never branches on the response body", async () => {
      vi.mocked(requestGuardianWithdrawal).mockResolvedValueOnce({ message: "A" }).mockResolvedValueOnce({ message: "B" });
      renderPage();
      sendRequest("a@example.com");
      await screen.findByRole("heading", { name: "Check the guardian’s inbox" });
      const first = screen.getByTestId("guardian-withdrawal").textContent;
      cleanup();
      renderPage();
      sendRequest("b@example.com");
      await screen.findByRole("heading", { name: "Check the guardian’s inbox" });
      expect(screen.getByTestId("guardian-withdrawal").textContent).toBe(first);
    });

    it("'Enter a withdrawal code' opens the Confirm step with an EMPTY field", async () => {
      vi.mocked(requestGuardianWithdrawal).mockResolvedValue({ message: "ok" });
      renderPage();
      sendRequest();
      fireEvent.click(await screen.findByRole("button", { name: "Enter a withdrawal code" }));
      expect(step()).toBe("confirm");
      expect((screen.getByLabelText("Withdrawal code") as HTMLInputElement).value).toBe("");
    });

    it("Done goes to the home page", async () => {
      vi.mocked(requestGuardianWithdrawal).mockResolvedValue({ message: "ok" });
      renderPage();
      sendRequest();
      expect(((await screen.findByRole("link", { name: "Done" })) as HTMLAnchorElement).getAttribute("href")).toBe("/");
    });
  });

  describe("frame 3 - confirm, pre-filled from the emailed link", () => {
    it("?token= opens Confirm with the code already in the field", () => {
      renderPage("/guardian-consent/withdraw?token=7c1d4e9a-3b52-4f0e-9a6d-2e8f1b5c0a47");
      expect(step()).toBe("confirm");
      expect(screen.getByRole("heading", { name: "Confirm withdrawing consent" })).not.toBeNull();
      expect((screen.getByLabelText("Withdrawal code") as HTMLInputElement).value).toBe(
        "7c1d4e9a-3b52-4f0e-9a6d-2e8f1b5c0a47",
      );
      // Opening the link never withdraws anything by itself.
      expect(withdrawGuardianConsent).not.toHaveBeenCalled();
    });

    it("shows what happens next, and Cancel goes home without calling the API", () => {
      renderPage("/guardian-consent/withdraw?token=abc");
      expect(screen.getByText("What happens next")).not.toBeNull();
      expect(screen.getByText(/The account is closed and the person can no longer sign in/)).not.toBeNull();
      expect((screen.getByRole("link", { name: "Cancel" }) as HTMLAnchorElement).getAttribute("href")).toBe("/");
      expect(withdrawGuardianConsent).not.toHaveBeenCalled();
    });

    it("a blank ?token= is no token: the page opens on the request step", () => {
      renderPage("/guardian-consent/withdraw?token=%20");
      expect(step()).toBe("request"); // a blank token is no token
    });

    it("withdraws with the (trimmed) code and shows the success frame", async () => {
      vi.mocked(withdrawGuardianConsent).mockResolvedValue({ message: "Guardian consent withdrawn." });
      renderPage("/guardian-consent/withdraw?token=abc");
      fireEvent.change(screen.getByLabelText("Withdrawal code"), { target: { value: "  pasted-code " } });
      fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
      await screen.findByRole("heading", { name: "Consent withdrawn" });
      expect(withdrawGuardianConsent).toHaveBeenCalledWith("pasted-code");
      expect(step()).toBe("success");
      expect(screen.getByText(/We have emailed the account holder/)).not.toBeNull();
      expect(screen.getByRole("link", { name: "Done" })).not.toBeNull();
    });

    it("after success the spent code is gone from the page", async () => {
      vi.mocked(withdrawGuardianConsent).mockResolvedValue({ message: "ok" });
      renderPage("/guardian-consent/withdraw?token=secret-token-value");
      fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
      await screen.findByRole("heading", { name: "Consent withdrawn" });
      expect(screen.getByTestId("guardian-withdrawal").textContent).not.toMatch(/secret-token-value/);
    });
  });

  describe("frame 5 - link invalid or expired", () => {
    it("a 400 shows the generic frame, and 'Request a new link' returns to frame 1 with the code cleared", async () => {
      vi.mocked(withdrawGuardianConsent).mockRejectedValue(new AuthApiError("x", { status: 400 }));
      renderPage("/guardian-consent/withdraw?token=used-token");
      fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
      await screen.findByRole("heading", { name: "This withdrawal link can’t be used" });
      expect(step()).toBe("invalid");
      fireEvent.click(screen.getByRole("button", { name: "Request a new link" }));
      expect(step()).toBe("request");
      expect(screen.getByTestId("location").textContent).toBe("/guardian-consent/withdraw");
      expect(screen.getByLabelText("Email address of the Soccernity account")).not.toBeNull();
    });
  });

  describe("frame 6 - too many attempts", () => {
    it("a 429 on the request step shows 'Too many attempts'; Try again returns to frame 1", async () => {
      vi.mocked(requestGuardianWithdrawal).mockRejectedValue(new AuthApiError("x", { status: 429 }));
      renderPage();
      sendRequest();
      await screen.findByRole("heading", { name: "Too many attempts" });
      expect(step()).toBe("throttled");
      expect(screen.getByText("Nothing has been changed.")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(step()).toBe("request");
      expect(screen.getByRole("heading", { name: "Withdraw your consent" })).not.toBeNull();
    });

    it("a 429 on the confirm step shows it too, and Try again drops the token from the address", async () => {
      vi.mocked(withdrawGuardianConsent).mockRejectedValue(new AuthApiError("x", { status: 429 }));
      renderPage("/guardian-consent/withdraw?token=abc");
      fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
      await screen.findByRole("heading", { name: "Too many attempts" });
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(step()).toBe("request");
      expect(screen.getByTestId("location").textContent).toBe("/guardian-consent/withdraw");
    });

    it("shows no count and no countdown", async () => {
      vi.mocked(requestGuardianWithdrawal).mockRejectedValue(new AuthApiError("x", { status: 429 }));
      renderPage();
      sendRequest();
      await screen.findByRole("heading", { name: "Too many attempts" });
      expect(screen.getByTestId("guardian-withdrawal").textContent).not.toMatch(/\d/);
    });
  });

  it("a network failure keeps the person on the same step with a message", async () => {
    vi.mocked(requestGuardianWithdrawal).mockRejectedValue(new AuthApiError("Couldn't reach the Soccernity server."));
    renderPage();
    sendRequest();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/reach the Soccernity server/));
    expect(step()).toBe("request");
  });

  it("makes no authenticated call and needs no session (the guardian has no account)", () => {
    window.sessionStorage.clear();
    renderPage("/guardian-consent/withdraw?token=abc");
    expect(step()).toBe("confirm");
  });
});
