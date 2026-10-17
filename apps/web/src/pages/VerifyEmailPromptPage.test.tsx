import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import VerifyEmailPromptPage from "./VerifyEmailPromptPage";
import ContinuePage from "./ContinuePage";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
import { getUser } from "../api/users";

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fakeToken(sub = "user-1"): string {
  return `${b64({ alg: "none" })}.${b64({ sub, role: "fan" })}.sig`;
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
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
  it("names the address the link was sent to and offers support, not a resend that does not exist", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
    vi.mocked(getUser).mockResolvedValue({
      email: "tobi@example.com",
      verificationStatus: "unverified",
    } as Awaited<ReturnType<typeof getUser>>);
    renderAt("/verify-email/prompt");

    expect(await screen.findByText(/tobi@example\.com/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
    const support = screen.getByRole("link", { name: /contact support/i }) as HTMLAnchorElement;
    expect(support.getAttribute("href")).toMatch(/^mailto:support@soccernity\.com/);
  });

  it("moves on through /continue once the account is verified", async () => {
    window.sessionStorage.setItem("sn_access_token", fakeToken());
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
    window.sessionStorage.setItem("sn_access_token", fakeToken());
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
