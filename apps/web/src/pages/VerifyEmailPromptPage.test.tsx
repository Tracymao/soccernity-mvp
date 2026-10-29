import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import VerifyEmailPromptPage from "./VerifyEmailPromptPage";
import ContinuePage from "./ContinuePage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, resendVerificationEmail: vi.fn() };
});
import { AuthApiError, resendVerificationEmail } from "../api/auth";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
import { getUser } from "../api/users";
import { seedSession, clearSession } from "../test/session";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeToken(sub = "user-1"): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  vi.mocked(getUser).mockReset();
  vi.mocked(resendVerificationEmail).mockReset();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email/prompt" element={<VerifyEmailPromptPage />} />
        <Route path="/continue" element={<ContinuePage />} />
        <Route path="/create-profile" element={<p>create profile page</p>} />
        <Route path="/guardian-consent" element={<p>restricted pending page</p>} />
        <Route path="/community" element={<p>community page</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VerifyEmailPromptPage", () => {
  function seedUnverified() {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({
      email: "tobi@example.com",
      verificationStatus: "unverified",
    } as Awaited<ReturnType<typeof getUser>>);
  }

  it("resends the verification email to the account's own address and shows the generic confirmation (QA D-08)", async () => {
    seedUnverified();
    vi.mocked(resendVerificationEmail).mockResolvedValueOnce({ message: "ok" });
    renderAt("/verify-email/prompt");

    fireEvent.click(await screen.findByRole("button", { name: /resend verification email/i }));

    await waitFor(() => expect(resendVerificationEmail).toHaveBeenCalledWith("tobi@example.com"));
    expect(await screen.findByText(/a new verification link has been sent/i)).not.toBeNull();
  });

  it("shows the rate-limit line when the server answers 429", async () => {
    seedUnverified();
    vi.mocked(resendVerificationEmail).mockRejectedValueOnce(new AuthApiError("limited", { status: 429 }));
    renderAt("/verify-email/prompt");

    fireEvent.click(await screen.findByRole("button", { name: /resend verification email/i }));

    expect(await screen.findByText(/too many requests/i)).not.toBeNull();
  });

  it("shows a plain failure line on any other error", async () => {
    seedUnverified();
    vi.mocked(resendVerificationEmail).mockRejectedValueOnce(new AuthApiError("boom", { status: 500 }));
    renderAt("/verify-email/prompt");

    fireEvent.click(await screen.findByRole("button", { name: /resend verification email/i }));

    expect(await screen.findByText(/couldn.t send that just now/i)).not.toBeNull();
  });

  it("names the address the link was sent to and offers support", async () => {
    seedUnverified();
    renderAt("/verify-email/prompt");

    expect(await screen.findByText(/tobi@example\.com/)).not.toBeNull();
    const support = screen.getByRole("link", { name: /contact support/i }) as HTMLAnchorElement;
    expect(support.getAttribute("href")).toMatch(/^mailto:support@soccernity\.com/);
  });

  it("moves on through /continue once the account is verified", async () => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({
      email: "tobi@example.com",
      verificationStatus: "verified",
      nextStep: "create_profile",
    } as Awaited<ReturnType<typeof getUser>>);
    renderAt("/verify-email/prompt");

    expect(await screen.findByText("create profile page")).not.toBeNull();
  });

  it("sends a visitor with no session to /login", () => {
    renderAt("/verify-email/prompt");
    expect(screen.getByText("login page")).not.toBeNull();
  });
});

describe("ContinuePage", () => {
  it.each([
    ["restricted_pending", "restricted pending page"],
    ["create_profile", "create profile page"],
    ["none", "community page"],
  ])("routes nextStep %s from a fresh server read", async (nextStep, page) => {
    seedSession(fakeToken());
    vi.mocked(getUser).mockResolvedValue({ nextStep } as Awaited<ReturnType<typeof getUser>>);
    renderAt("/continue");
    expect(await screen.findByText(page)).not.toBeNull();
  });

  it("goes to /login without a session and calls nothing", () => {
    renderAt("/continue");
    expect(screen.getByText("login page")).not.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});
