// B-271 follow-up: a tab signed out by the refresh gate (admin_two_factor_enrolment_required) shows the same
// "two-factor is now required" notice in EVERY tab, because the cross-tab sign-out broadcast carries the reason.
// No other sign-out gains a reason, and a tab that never had a session never shows one.
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { clearAdminTestSession } from "../test/session";
import {
  clearAdminSession,
  getAdminSessionChannelName,
  getAdminSignOutReason,
  initAdminSessionChannel,
  storeAdminSession,
} from "../lib/adminSession";

vi.mock("../api/adminAuth", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminProfile: vi.fn(),
  AdminAuthError: class AdminAuthError extends Error {},
}));
import { getAdminProfile } from "../api/adminAuth";

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

function Probe() {
  const { status, signedOutReason, adoptSession } = useAdminAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="reason">{signedOutReason ?? "-"}</span>
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

let otherTab: BroadcastChannel;
let received: unknown[];

beforeEach(() => {
  clearAdminTestSession();
  window.localStorage.clear();
  initAdminSessionChannel();
  vi.mocked(getAdminProfile).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "No refresh cookie" }), { status: 401 })));
  received = [];
  otherTab = new BroadcastChannel(getAdminSessionChannelName());
  otherTab.onmessage = (event: MessageEvent) => received.push(event.data);
});
afterEach(() => {
  otherTab.close();
  cleanup();
  vi.unstubAllGlobals();
});

async function signedInTab() {
  renderProbe();
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
  fireEvent.click(screen.getByText("do-adopt"));
  expect(screen.getByTestId("status").textContent).toBe("authenticated");
}

describe("the sign-out broadcast carries the reason", () => {
  it("the originating tab posts { type: 'signout', reason } for the gate and a bare { type: 'signout' } otherwise", async () => {
    storeAdminSession({ accessToken: "a1" });
    clearAdminSession("two-factor-enrolment-required");
    await vi.waitFor(() => expect(received).toContainEqual({ type: "signout", reason: "two-factor-enrolment-required" }));

    received.length = 0;
    storeAdminSession({ accessToken: "a2" });
    clearAdminSession();
    await vi.waitFor(() => expect(received).toEqual([{ type: "signout" }]));
  });

  it("the reason is readable after a sign-out and reset by the next sign-in", () => {
    storeAdminSession({ accessToken: "a1" });
    clearAdminSession("two-factor-enrolment-required");
    expect(getAdminSignOutReason()).toBe("two-factor-enrolment-required");
    storeAdminSession({ accessToken: "a2" });
    expect(getAdminSignOutReason()).toBeNull();
    clearAdminSession();
    expect(getAdminSignOutReason()).toBeNull();
  });
});

describe("a signed-in tab signed out by ANOTHER tab", () => {
  it("shows the two-factor notice reason when the other tab's sign-out carried it", async () => {
    await signedInTab();
    otherTab.postMessage({ type: "signout", reason: "two-factor-enrolment-required" });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("reason").textContent).toBe("two-factor-enrolment-required");
  });

  it("an ordinary sign-out in the other tab brings NO reason", async () => {
    await signedInTab();
    otherTab.postMessage({ type: "signout" });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("reason").textContent).toBe("-");
  });

  it("an unknown reason is ignored (treated as an ordinary sign-out)", async () => {
    await signedInTab();
    otherTab.postMessage({ type: "signout", reason: "something-else" });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("reason").textContent).toBe("-");
  });

  it("a tab that never had a session shows no notice when another tab is signed out by the gate", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    otherTab.postMessage({ type: "signout", reason: "two-factor-enrolment-required" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("reason").textContent).toBe("-");
  });

  it("signing in again clears the notice", async () => {
    await signedInTab();
    otherTab.postMessage({ type: "signout", reason: "two-factor-enrolment-required" });
    await waitFor(() => expect(screen.getByTestId("reason").textContent).toBe("two-factor-enrolment-required"));
    fireEvent.click(screen.getByText("do-adopt"));
    expect(screen.getByTestId("reason").textContent).toBe("-");
  });
});
