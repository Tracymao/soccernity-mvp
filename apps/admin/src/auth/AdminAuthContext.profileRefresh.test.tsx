// B-282: the admin's own childSafetyVetted comes from GET /admin/profile, read fresh at boot and again on demand
// (refreshProfile), never trusted from anything stored.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { initAdminSessionChannel } from "../lib/adminSession";
import { clearAdminTestSession } from "../test/session";

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
  role: "moderator",
  accountStatus: "active",
  childSafetyVetted: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function Probe() {
  const { status, admin, refreshProfile } = useAdminAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="vetted">{String(admin?.childSafetyVetted)}</span>
      <button onClick={() => void refreshProfile()}>refresh</button>
    </div>
  );
}

beforeEach(() => {
  clearAdminTestSession();
  initAdminSessionChannel();
  vi.mocked(getAdminProfile).mockReset();
  // The start-up cookie refresh succeeds, so the profile is read.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "acc-1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("childSafetyVetted on the admin session", () => {
  it("is read from GET /admin/profile at boot", async () => {
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    render(
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("vetted").textContent).toBe("true");
    expect(getAdminProfile).toHaveBeenCalledTimes(1);
  });

  it("refreshProfile re-reads the profile and adopts a changed vetting state", async () => {
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    render(
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("vetted").textContent).toBe("true"));

    vi.mocked(getAdminProfile).mockResolvedValue({ ...PROFILE, childSafetyVetted: false });
    await act(async () => {
      fireEvent.click(screen.getByText("refresh"));
    });
    await waitFor(() => expect(screen.getByTestId("vetted").textContent).toBe("false"));
    expect(getAdminProfile).toHaveBeenCalledTimes(2);
  });

  it("refreshProfile leaves the held profile alone when the read fails", async () => {
    vi.mocked(getAdminProfile).mockResolvedValueOnce(PROFILE);
    render(
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("vetted").textContent).toBe("true"));

    vi.mocked(getAdminProfile).mockRejectedValue(new Error("network"));
    await act(async () => {
      fireEvent.click(screen.getByText("refresh"));
    });
    expect(screen.getByTestId("vetted").textContent).toBe("true");
  });
});
