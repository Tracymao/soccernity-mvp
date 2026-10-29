import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { AdminApiError } from "../api/adminClient";
import { getAdminAccessToken, getAdminSessionChannelName, initAdminSessionChannel } from "../lib/adminSession";
import { clearAdminTestSession, heldAdminAccessToken, seedAdminSession } from "../test/session";

vi.mock("../api/adminAuth", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminProfile: vi.fn(),
  AdminAuthError: class AdminAuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
import { adminLogin, adminLogout, getAdminProfile } from "../api/adminAuth";

const API = "http://localhost:3000";

const PROFILE = {
  id: "admin-1",
  email: "ada@soccernity.com",
  fullName: "Ada Lovelace",
  phone: null,
  role: "superadmin",
  accountStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Probe() {
  const { status, admin, login, logout } = useAdminAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="name">{admin?.fullName ?? "-"}</span>
      <button onClick={() => void login("ada@soccernity.com", "correcthorse")}>do-login</button>
      <button onClick={() => void logout()}>do-logout</button>
    </div>
  );
}

function renderProbe(strict = false) {
  const tree = (
    <AdminAuthProvider>
      <Probe />
    </AdminAuthProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

let backend: ReturnType<typeof vi.fn>;

function refreshCalls() {
  return backend.mock.calls.filter(([u]) => u === `${API}/admin/auth/refresh`);
}

describe("AdminAuthContext", () => {
  beforeEach(() => {
    clearAdminTestSession();
    window.localStorage.clear();
    window.sessionStorage.clear();
    initAdminSessionChannel();
    vi.mocked(adminLogin).mockReset();
    vi.mocked(adminLogout).mockReset();
    vi.mocked(getAdminProfile).mockReset();
    // The start-up cookie refresh: signed out unless a test says otherwise.
    backend = vi.fn().mockResolvedValue(json(401, { message: "No refresh cookie" }));
    vi.stubGlobal("fetch", backend);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("boots to unauthenticated when the cookie refresh finds no session", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(getAdminProfile).not.toHaveBeenCalled();
    expect(refreshCalls()).toHaveLength(1);
  });

  it.each([403, 503])("a %i from the start-up refresh also ends in unauthenticated (the login screen)", async (status) => {
    backend.mockResolvedValue(json(status));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(getAdminProfile).not.toHaveBeenCalled();
  });

  it("stays in loading until the refresh settles, then hydrates the profile (token in memory only)", async () => {
    let settle!: (r: Response) => void;
    backend.mockImplementation(() => new Promise<Response>((r) => (settle = r)));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderProbe();

    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => expect(refreshCalls()).toHaveLength(1));
    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(getAdminProfile).not.toHaveBeenCalled();

    await act(async () => {
      settle(json(200, { accessToken: "acc-1" }));
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("name").textContent).toBe("Ada Lovelace");
    expect(heldAdminAccessToken()).toBe("acc-1");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("removes the old build's sn_admin_* keys from localStorage at start-up and does not use them", async () => {
    window.localStorage.setItem("sn_admin_access_token", "old-access");
    window.localStorage.setItem("sn_admin_refresh_token", "old-refresh");

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(window.localStorage.getItem("sn_admin_access_token")).toBeNull();
    expect(window.localStorage.getItem("sn_admin_refresh_token")).toBeNull();
    expect(getAdminProfile).not.toHaveBeenCalled();
  });

  it("StrictMode's double effect makes exactly ONE refresh call (a second use of the cookie is reuse)", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderProbe(true);

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(refreshCalls()).toHaveLength(1);
  });

  it("ends the session when the restored token is rejected (401 after refresh)", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "acc-bad" }));
    vi.mocked(getAdminProfile).mockRejectedValue(new AdminApiError(401, "unauthorized"));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(heldAdminAccessToken()).toBeNull();
  });

  it("login stores the access token in memory only and flips to authenticated", async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      accessToken: "acc-new",
      accessTokenExpiresIn: 900,
      refreshTokenExpiresAt: "2026-01-02T00:00:00.000Z",
      admin: PROFILE,
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    // Spy only after boot: the boot's cross-tab lease key (sn_admin_refresh_lock, no token in it) is
    // not part of sign-in.
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    fireEvent.click(screen.getByText("do-login"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(heldAdminAccessToken()).toBe("acc-new");
    // Sign-in writes nothing to either browser storage.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(screen.getByTestId("name").textContent).toBe("Ada Lovelace");
    setItem.mockRestore();
  });

  it("logout calls the endpoint with the held access token, clears memory and flips to unauthenticated", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    vi.mocked(adminLogout).mockResolvedValue(undefined);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    fireEvent.click(screen.getByText("do-logout"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(heldAdminAccessToken()).toBeNull();
    expect(adminLogout).toHaveBeenCalledWith("acc-1");
  });

  it("a sign-out heard from another tab ends this session without a reload", async () => {
    backend.mockResolvedValue(json(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    const otherTab = new BroadcastChannel(getAdminSessionChannelName());
    otherTab.postMessage({ type: "signout" });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("name").textContent).toBe("-");
    expect(getAdminAccessToken()).toBeNull();
    otherTab.close();
  });

  it("does not restore when a session is already held (no refresh call)", async () => {
    seedAdminSession("acc-held");
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(refreshCalls()).toHaveLength(0);
  });
});
