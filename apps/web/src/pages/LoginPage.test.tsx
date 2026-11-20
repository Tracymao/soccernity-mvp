// B-125 (Decision Log #367, #394 A6): a login routes on the server's
// onboarding state. A restricted-pending minor lands on the Restricted Pending
// page on EVERY login -- including one whose guardian has declined -- and
// never on /community.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import LoginPage from "./LoginPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn() };
});
import { login, AuthApiError } from "../api/auth";
import { clearSession, heldAccessToken } from "../test/session";

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(login).mockReset();
});

function loggedIn(nextStep: string, guardianConsentStatus = "not_applicable") {
  return {
    accessToken: "acc",
    accessTokenExpiresIn: 900,
    refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
    user: { id: "u1", nextStep, guardianConsentStatus },
  } as unknown as Awaited<ReturnType<typeof login>>;
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
        <Route path="/verify-email/prompt" element={<p>verify prompt page</p>} />
        <Route path="/create-profile" element={<p>create profile page</p>} />
        <Route path="/community" element={<p>community page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "tobi@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage routing on nextStep", () => {
  it("restricted_pending (guardian pending) -> /guardian-consent, not /community", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("restricted_pending", "pending"));
    renderLogin();
    submit();
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
    expect(screen.queryByText("community page")).toBeNull();
  });

  it("restricted_pending (guardian declined) -> /guardian-consent too, declined is not folded away", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("restricted_pending", "declined"));
    renderLogin();
    submit();
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
  });

  it("verify_email -> the verify prompt", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("verify_email"));
    renderLogin();
    submit();
    expect(await screen.findByText("verify prompt page")).not.toBeNull();
  });

  it("create_profile -> Create Profile", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("create_profile"));
    renderLogin();
    submit();
    expect(await screen.findByText("create profile page")).not.toBeNull();
  });

  it("none -> /community, and the session is stored", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin();
    submit();
    expect(await screen.findByText("community page")).not.toBeNull();
    await waitFor(() => expect(heldAccessToken()).toBe("acc"));
    // B-246: in memory only. Neither storage holds a token (or the value of one).
    for (const store of [window.sessionStorage, window.localStorage]) {
      expect(store.length).toBe(0);
    }
    expect(document.cookie).toBe("");
  });

  it("sends 'Stay signed in' to the API (true -> a persistent refresh cookie, otherwise a session cookie)", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin();
    submit();
    await screen.findByText("community page");
    expect(vi.mocked(login).mock.calls[0][0]).toMatchObject({ staySignedIn: false });

    cleanup();
    vi.mocked(login).mockClear();
    renderLogin();
    fireEvent.click(screen.getByLabelText(/stay signed in/i));
    submit();
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(vi.mocked(login).mock.calls[0][0]).toMatchObject({ staySignedIn: true });
  });

  it("stays on the form with an error when login fails", async () => {
    vi.mocked(login).mockRejectedValue(new AuthApiError("That email and password don't match.", { status: 401 }));
    renderLogin();
    submit();
    expect((await screen.findByRole("alert")).textContent).toMatch(/don.t match/i);
    expect(screen.queryByText("community page")).toBeNull();
  });
});
