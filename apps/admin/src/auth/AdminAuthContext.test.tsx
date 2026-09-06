import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { AdminApiError } from "../api/adminClient";

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

function renderProbe() {
  return render(
    <AdminAuthProvider>
      <Probe />
    </AdminAuthProvider>,
  );
}

describe("AdminAuthContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(adminLogin).mockReset();
    vi.mocked(adminLogout).mockReset();
    vi.mocked(getAdminProfile).mockReset();
  });
  afterEach(cleanup);

  it("boots to unauthenticated when there is no stored token", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(getAdminProfile).not.toHaveBeenCalled();
  });

  it("boots to authenticated and hydrates the profile when a token is stored", async () => {
    window.localStorage.setItem("sn_admin_access_token", "acc-1");
    window.localStorage.setItem("sn_admin_refresh_token", "ref-1");
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("name").textContent).toBe("Ada Lovelace");
  });

  it("ends the session when the stored token is rejected (401 after refresh)", async () => {
    window.localStorage.setItem("sn_admin_access_token", "acc-bad");
    window.localStorage.setItem("sn_admin_refresh_token", "ref-bad");
    vi.mocked(getAdminProfile).mockRejectedValue(new AdminApiError(401, "unauthorized"));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(window.localStorage.getItem("sn_admin_access_token")).toBeNull();
  });

  it("login stores the token pair and flips to authenticated", async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      accessToken: "acc-new",
      accessTokenExpiresIn: 900,
      refreshToken: "ref-new",
      refreshTokenExpiresAt: "2026-01-02T00:00:00.000Z",
      admin: PROFILE,
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));

    fireEvent.click(screen.getByText("do-login"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(window.localStorage.getItem("sn_admin_access_token")).toBe("acc-new");
    expect(window.localStorage.getItem("sn_admin_refresh_token")).toBe("ref-new");
    expect(screen.getByTestId("name").textContent).toBe("Ada Lovelace");
  });

  it("logout clears storage and flips to unauthenticated", async () => {
    window.localStorage.setItem("sn_admin_access_token", "acc-1");
    window.localStorage.setItem("sn_admin_refresh_token", "ref-1");
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    vi.mocked(adminLogout).mockResolvedValue(undefined);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    fireEvent.click(screen.getByText("do-logout"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(window.localStorage.getItem("sn_admin_access_token")).toBeNull();
    expect(adminLogout).toHaveBeenCalledWith("ref-1", "acc-1");
  });
});
