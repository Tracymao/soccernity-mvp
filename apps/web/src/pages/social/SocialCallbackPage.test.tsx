// B-085: the OAuth redirect page. Every outcome, the login-CSRF check, and the single-use code under StrictMode.
import { StrictMode } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../../api/socialAuth", async () => {
  const actual = await vi.importActual<typeof import("../../api/socialAuth")>("../../api/socialAuth");
  return { ...actual, completeSocialCallback: vi.fn() };
});
vi.mock("../../lib/socialSignIn", async () => {
  const actual = await vi.importActual<typeof import("../../lib/socialSignIn")>("../../lib/socialSignIn");
  return { ...actual, beginSocialSignIn: vi.fn() };
});
vi.mock("../twoFactor/TwoFactorCodePrompt", () => ({
  default: (props: { challengeToken: string }) => <p>two-factor prompt {props.challengeToken}</p>,
}));
import { completeSocialCallback } from "../../api/socialAuth";
import { AuthApiError } from "../../api/auth";
import { beginSocialSignIn, savePendingSocialSignIn } from "../../lib/socialSignIn";
import { clearSession, heldAccessToken } from "../../test/session";
import SocialCallbackPage, { resetSocialCallbackCache } from "./SocialCallbackPage";

beforeEach(() => {
  clearSession();
  window.sessionStorage.clear();
  resetSocialCallbackCache();
  vi.mocked(completeSocialCallback).mockReset();
  vi.mocked(beginSocialSignIn).mockReset();
});
afterEach(cleanup);

function renderAt(search: string, provider = "facebook", strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[`/auth/social/${provider}/callback${search}`]}>
      <Routes>
        <Route path="/auth/social/:provider/callback" element={<SocialCallbackPage />} />
        <Route path="/community" element={<p>community page</p>} />
        <Route path="/create-profile" element={<p>create profile page</p>} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function signedIn(nextStep: string) {
  return {
    status: "signed_in" as const,
    response: { accessToken: "acc", user: { id: "u1", nextStep } },
  } as unknown as Awaited<ReturnType<typeof completeSocialCallback>>;
}

describe("signed in", () => {
  it("stores the session and routes on the server's nextStep", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("none"));
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(completeSocialCallback).toHaveBeenCalledWith("google", "c1", "s1");
    expect(heldAccessToken()).toBe("acc");
  });

  it("sends a new account with an incomplete profile to Create Profile", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("create_profile"));
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByText("create profile page")).not.toBeNull();
  });

  it("sends a restricted-pending minor to the Restricted Pending page", async () => {
    savePendingSocialSignIn({ provider: "facebook", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("restricted_pending"));
    renderAt("?code=c1&state=s1");
    expect(await screen.findByText("restricted pending page")).not.toBeNull();
  });

  it("calls the API once under React StrictMode (the provider's code is single use)", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("none"));
    renderAt("?code=c1&state=s1", "google", true);
    expect(await screen.findByText("community page")).not.toBeNull();
    expect(completeSocialCallback).toHaveBeenCalledTimes(1);
  });
});

describe("two-factor and registration", () => {
  it("shows the existing code prompt when the account has two-factor on", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue({
      status: "two_factor_required",
      challenge: { twoFactorRequired: true, challengeToken: "ct1", challengeExpiresInSeconds: 300 },
    });
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByText("two-factor prompt ct1")).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
  });

  it("hands a new person with an email to the hand-off screen (no account yet, no session)", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue({
      status: "registration_required",
      socialRegistrationToken: "rt",
      profile: { displayName: "Jane Doe", email: "jane@example.com", emailVerified: true, needsEmail: false },
    });
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByRole("heading", { name: "One more step" })).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
  });

  it("asks for an email first when the provider sent none", async () => {
    savePendingSocialSignIn({ provider: "facebook", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue({
      status: "registration_required",
      socialRegistrationToken: "rt",
      profile: { displayName: "Jane Doe", email: null, emailVerified: false, needsEmail: true },
    });
    renderAt("?code=c1&state=s1");
    expect(await screen.findByRole("heading", { name: "Enter your email" })).not.toBeNull();
  });
});

describe("cancelled", () => {
  it("shows Sign-in cancelled when the person declined, and never calls the API", async () => {
    savePendingSocialSignIn({ provider: "facebook", state: "s1", staySignedIn: false });
    renderAt("?error=access_denied&error_reason=user_denied&state=s1");
    expect(await screen.findByRole("heading", { name: "Sign-in cancelled" })).not.toBeNull();
    expect(screen.getByText(/You closed the Facebook window before finishing, so you.re not signed in\./)).not.toBeNull();
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("Try again starts the same provider again with the same Stay signed in choice", async () => {
    savePendingSocialSignIn({ provider: "facebook", state: "s1", staySignedIn: true });
    vi.mocked(beginSocialSignIn).mockResolvedValue(undefined);
    renderAt("?error=access_denied&state=s1");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(beginSocialSignIn).toHaveBeenCalledWith("facebook", true));
  });

  it("Back to log in goes to /login", async () => {
    renderAt("?error=access_denied&state=s1", "google");
    fireEvent.click(await screen.findByRole("link", { name: "Back to log in" }));
    expect(await screen.findByText("login page")).not.toBeNull();
  });
});

describe("refused or failed", () => {
  const FAILED = "We couldn’t sign you in";

  it("shows the failed screen when the provider reports another error", async () => {
    savePendingSocialSignIn({ provider: "facebook", state: "s1", staySignedIn: false });
    renderAt("?error=server_error&state=s1");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Facebook didn.t confirm your sign-in\. This can happen if you declined access or the service isn.t available right now\./,
    );
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("shows the failed screen when the API refuses the sign-in", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockRejectedValue(new AuthApiError("no", { status: 401, code: "social_auth_failed" }));
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(heldAccessToken()).toBeNull();
  });

  it("refuses without calling the API when the state does not match the one this browser saved (login CSRF)", async () => {
    savePendingSocialSignIn({ provider: "google", state: "mine", staySignedIn: false });
    renderAt("?code=c1&state=attackers", "google");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("refuses when this browser never started a flow", async () => {
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("refuses when the saved flow was for the other provider", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    renderAt("?code=c1&state=s1", "facebook");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("refuses a redirect with no code", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    renderAt("?state=s1", "google");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
  });

  it("refuses an unknown provider (Apple has no callback)", async () => {
    renderAt("?code=c1&state=s1", "apple");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(completeSocialCallback).not.toHaveBeenCalled();
  });

  it("uses the saved state only once", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("none"));
    renderAt("?code=c1&state=s1", "google");
    await screen.findByText("community page");
    cleanup();
    resetSocialCallbackCache();
    renderAt("?code=c1&state=s1", "google");
    expect(await screen.findByRole("heading", { name: FAILED })).not.toBeNull();
    expect(completeSocialCallback).toHaveBeenCalledTimes(1);
  });

  it("Try again that cannot start stays on the failed screen", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(beginSocialSignIn).mockRejectedValue(new Error("nope"));
    renderAt("?error=server_error&state=s1", "google");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(beginSocialSignIn).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: FAILED })).not.toBeNull();
  });
});

describe("the address bar", () => {
  it("removes the spent code and state", async () => {
    savePendingSocialSignIn({ provider: "google", state: "s1", staySignedIn: false });
    vi.mocked(completeSocialCallback).mockResolvedValue(signedIn("none"));
    const replace = vi.spyOn(window.history, "replaceState");
    renderAt("?code=c1&state=s1", "google");
    await screen.findByText("community page");
    expect(replace).toHaveBeenCalled();
    replace.mockRestore();
  });
});
