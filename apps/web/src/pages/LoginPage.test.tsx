// B-125 (Decision Log #367, #394 A6): a login routes on the server's
// onboarding state. A restricted-pending minor lands on the Restricted Pending
// page on EVERY login -- including one whose guardian has declined -- and
// never on /community.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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

// Shows where the visitor ended up, query string included.
function SearchProbe() {
  const loc = useLocation();
  return <p data-testid="search-url">{loc.pathname + loc.search}</p>;
}

function renderLogin(url = "/login") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/search" element={<SearchProbe />} />
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

// Decision Log #571 (code-only): after logging in from the search prompt the visitor returns to
// their search, but only when the account is fully onboarded and the value passes the allow-list.
describe("LoginPage returnTo", () => {
  const SAFE = "/login?returnTo=%2Fsearch%3Fq%3Dsalah";

  it("none + a safe returnTo -> back to /search?q=salah", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin(SAFE);
    submit();
    expect((await screen.findByTestId("search-url")).textContent).toBe("/search?q=salah");
    expect(screen.queryByText("community page")).toBeNull();
    await waitFor(() => expect(heldAccessToken()).toBe("acc"));
  });

  it("keeps an encoded query exactly as it was typed", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin("/login?returnTo=%2Fsearch%3Fq%3Dman%2520utd");
    submit();
    expect((await screen.findByTestId("search-url")).textContent).toBe("/search?q=man%20utd");
  });

  it.each([
    ["verify_email", "verify prompt page"],
    ["create_profile", "create profile page"],
    ["restricted_pending", "restricted pending page"],
  ])("%s with a safe returnTo goes to onboarding, never to /search", async (nextStep, page) => {
    vi.mocked(login).mockResolvedValue(loggedIn(nextStep, nextStep === "restricted_pending" ? "pending" : "not_applicable"));
    renderLogin(SAFE);
    submit();
    expect(await screen.findByText(page)).not.toBeNull();
    expect(screen.queryByTestId("search-url")).toBeNull();
  });

  it.each([
    ["an absolute URL", "https%3A%2F%2Fevil.example"],
    ["a protocol-relative URL", "%2F%2Fevil.example"],
    ["another page", "%2Fcommunity"],
    ["a path trick", "%2Fsearch%2F..%2Flogin"],
  ])("none with %s ignores the returnTo and goes to /community", async (_label, value) => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin(`/login?returnTo=${value}`);
    submit();
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(screen.queryByTestId("search-url")).toBeNull();
  });

  it("no returnTo: unchanged, /community", async () => {
    vi.mocked(login).mockResolvedValue(loggedIn("none"));
    renderLogin();
    submit();
    expect(await screen.findByText("community page")).not.toBeNull();
  });

  it("a failed login stays on the form and still has the returnTo in the address", async () => {
    vi.mocked(login).mockRejectedValue(new AuthApiError("Invalid credentials", { status: 401 }));
    renderLogin(SAFE);
    submit();
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByTestId("search-url")).toBeNull();
  });
});
