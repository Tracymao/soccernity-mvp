import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth, type AdminLoginOutcome } from "./AdminAuthContext";
import { heldAdminAccessToken, clearAdminTestSession } from "../test/session";
import { initAdminSessionChannel } from "../lib/adminSession";
import { __resetAdminRefreshForTests } from "../lib/adminRefresh";

vi.mock("../api/adminAuth", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminProfile: vi.fn(),
  AdminAuthError: class AdminAuthError extends Error {},
}));
import { adminLogin, getAdminProfile } from "../api/adminAuth";

const PROFILE = {
  id: "admin-1",
  email: "ada@soccernity.com",
  fullName: "Ada Lovelace",
  phone: null,
  role: "superadmin",
  accountStatus: "active",
  createdAt: "",
  updatedAt: "",
};
const SESSION = { accessToken: "acc-1", accessTokenExpiresIn: 900, refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z", admin: PROFILE };

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let outcome: AdminLoginOutcome | void;

function Probe() {
  const { status, admin, login, adoptSession, signedOutReason } = useAdminAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="name">{admin?.fullName ?? "-"}</span>
      <span data-testid="reason">{signedOutReason ?? "-"}</span>
      <button onClick={() => void login("ada@soccernity.com", "correcthorse").then((o) => (outcome = o))}>do-login</button>
      <button onClick={() => adoptSession(SESSION)}>do-adopt</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <StrictMode>
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  clearAdminTestSession();
  window.localStorage.clear();
  initAdminSessionChannel();
  outcome = undefined;
  vi.mocked(adminLogin).mockReset();
  vi.mocked(getAdminProfile).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { message: "No refresh cookie" })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminAuthContext: two-factor", () => {
  it("a login that needs a code is a challenge, NOT a session: still unauthenticated, no token held", async () => {
    vi.mocked(adminLogin).mockResolvedValue({ twoFactorRequired: true, challengeToken: "chal-1", challengeExpiresInSeconds: 300 });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByText("do-login"));
    await waitFor(() => expect(outcome).toBeDefined());
    expect(outcome).toEqual({ kind: "challenge", challengeToken: "chal-1", challengeExpiresInSeconds: 300 });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(heldAdminAccessToken()).toBeNull();
  });

  it("a login that needs enrolment is an enrolment step, NOT a session", async () => {
    vi.mocked(adminLogin).mockResolvedValue({ twoFactorEnrolmentRequired: true, enrolmentToken: "enrol-1", expiresInSeconds: 600 });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByText("do-login"));
    await waitFor(() => expect(outcome).toBeDefined());
    expect(outcome).toEqual({ kind: "enrolment", enrolmentToken: "enrol-1", expiresInSeconds: 600 });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(heldAdminAccessToken()).toBeNull();
  });

  it("a plain login is still signed-in", async () => {
    vi.mocked(adminLogin).mockResolvedValue(SESSION);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByText("do-login"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(outcome).toEqual({ kind: "signed-in" });
    expect(heldAdminAccessToken()).toBe("acc-1");
  });

  it("adoptSession makes a finished two-factor sign-in the live session (access token only)", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    fireEvent.click(screen.getByText("do-adopt"));
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(screen.getByTestId("name").textContent).toBe("Ada Lovelace");
    expect(heldAdminAccessToken()).toBe("acc-1");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("start-up on the refresh gate ends unauthenticated WITH the reason; an ordinary 401 has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(401, { statusCode: 401, message: "x", code: "admin_two_factor_enrolment_required" })),
    );
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("reason").textContent).toBe("two-factor-enrolment-required");
    cleanup();
    __resetAdminRefreshForTests(); // the start-up restore is cached per page load

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { message: "No refresh cookie" })));
    clearAdminTestSession();
    const { getByTestId } = renderProbe();
    await waitFor(() => expect(getByTestId("status").textContent).toBe("unauthenticated"));
    expect(getByTestId("reason").textContent).toBe("-");
  });

  it("the reason clears when a session is adopted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(401, { statusCode: 401, message: "x", code: "admin_two_factor_enrolment_required" })),
    );
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("reason").textContent).toBe("two-factor-enrolment-required"));
    fireEvent.click(screen.getByText("do-adopt"));
    expect(screen.getByTestId("reason").textContent).toBe("-");
  });
});
