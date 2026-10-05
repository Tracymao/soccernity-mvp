// Same conventions as GuardianConsentPage.test.tsx: mock src/api/auth.ts,
// seed a real, well-formed (unsigned) JWT into sessionStorage, plain DOM
// assertions.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ChangeGuardianEmailPage from "./ChangeGuardianEmailPage";
import { AuthApiError } from "../../api/auth";

vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, getGuardianConsentStatus: vi.fn(), changeGuardianEmail: vi.fn() };
});

import { changeGuardianEmail, getGuardianConsentStatus } from "../../api/auth";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const fakeToken = () => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "minor-1", role: "fan" })}.sig`;

const PENDING = {
  consentStatus: "pending",
  guardianEmail: "sarah.bello@example.com",
  canResend: true,
  consentTimestamp: null,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getGuardianConsentStatus).mockReset();
  vi.mocked(changeGuardianEmail).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/guardian-consent/change-email"]}>
      <Routes>
        <Route path="/guardian-consent/change-email" element={<ChangeGuardianEmailPage />} />
        <Route path="/guardian-consent" element={<div>STATUS PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fill(over: { name?: string; email?: string; relationship?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: over.name ?? "Auntie Ada" } });
  fireEvent.change(screen.getByLabelText(/new guardian email/i), {
    target: { value: over.email ?? "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/relationship to you/i), { target: { value: over.relationship ?? "Other" } });
}

describe("ChangeGuardianEmailPage", () => {
  it("prompts to log in and never calls the API when there is no session", () => {
    renderPage();
    expect(screen.getByText(/log in to change your guardian/i)).not.toBeNull();
    expect(getGuardianConsentStatus).not.toHaveBeenCalled();
  });

  it("shows the current guardian email and the restarts-from-scratch notice before submitting", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce(PENDING);
    renderPage();

    await waitFor(() => expect(screen.getByTestId("change-guardian-email")).not.toBeNull());
    expect(screen.getByText("sarah.bello@example.com")).not.toBeNull();
    expect(screen.getByText(/restarts approval from scratch/i)).not.toBeNull();
    expect(screen.getByText(/current approval link stops working/i)).not.toBeNull();
  });

  it("submits name, email and relationship with the caller's token, then lands on the status page", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce(PENDING);
    vi.mocked(changeGuardianEmail).mockResolvedValueOnce({ message: "ok" });
    renderPage();
    await waitFor(() => screen.getByTestId("change-guardian-email"));

    fill();
    fireEvent.click(screen.getByRole("button", { name: /send new request/i }));

    await waitFor(() => expect(screen.getByText("STATUS PAGE")).not.toBeNull());
    expect(changeGuardianEmail).toHaveBeenCalledWith(fakeToken(), {
      name: "Auntie Ada",
      email: "ada@example.com",
      relationship: "Other",
    });
  });

  it("validates client-side and calls nothing for a missing name, bad email, or missing relationship", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce(PENDING);
    renderPage();
    await waitFor(() => screen.getByTestId("change-guardian-email"));
    const submit = () => fireEvent.click(screen.getByRole("button", { name: /send new request/i }));

    fill({ name: "  " });
    submit();
    expect((await screen.findByRole("alert")).textContent).toMatch(/full name/i);

    fill({ email: "not-an-email" });
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/valid email/i));

    fill({ relationship: "" });
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/relationship/i));

    expect(changeGuardianEmail).not.toHaveBeenCalled();
  });

  it("shows the server's message verbatim (e.g. own email, too many changes) and stays on the form", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce(PENDING);
    vi.mocked(changeGuardianEmail).mockRejectedValueOnce(
      new AuthApiError("The guardian email can't be your own email address.", { status: 400 }),
    );
    renderPage();
    await waitFor(() => screen.getByTestId("change-guardian-email"));

    fill();
    fireEvent.click(screen.getByRole("button", { name: /send new request/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/can't be your own email/i);
    expect(screen.queryByText("STATUS PAGE")).toBeNull();
    expect((screen.getByRole("button", { name: /send new request/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not offer the form once consent is already confirmed", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockResolvedValueOnce({ ...PENDING, consentStatus: "confirmed" });
    renderPage();

    await waitFor(() => expect(screen.getByTestId("change-guardian-email-unavailable")).not.toBeNull());
    expect(screen.queryByLabelText(/new guardian email/i)).toBeNull();
    expect(screen.getByText(/already approved/i)).not.toBeNull();
  });

  it("explains itself for a non-minor (404)", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getGuardianConsentStatus).mockRejectedValueOnce(new AuthApiError("nope", { status: 404 }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/only applies to accounts registered as under 18/i)).not.toBeNull());
  });
});
