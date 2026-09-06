// Integration smoke test: mount the REAL route tree (adminRoutes) via
// useRoutes under a plain <MemoryRouter>, with the real AdminAuthProvider,
// mocking only the network. Confirms the shell + guard + section screens
// wire together and nothing throws on a real navigation.
//
// useRoutes (not createMemoryRouter) is used deliberately — the routes
// here are plain element routes with no loaders/actions, and the RR6
// data-router's internal AbortController machinery trips a jsdom/undici
// AbortSignal-realm mismatch in this Node version. useRoutes has none of
// that and renders the identical tree.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { adminRoutes } from "./routes";
import { AdminAuthProvider } from "../auth/AdminAuthContext";

vi.mock("../api/adminAuth", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminProfile: vi.fn(),
  AdminAuthError: class extends Error {},
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

function Tree() {
  return useRoutes(adminRoutes);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminAuthProvider>
        <Tree />
      </AdminAuthProvider>
    </MemoryRouter>,
  );
}

describe("adminRoutes (integration)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getAdminProfile).mockReset();
  });
  afterEach(cleanup);

  it("sends an unauthenticated visitor from a deep link to /login", async () => {
    renderAt("/moderation");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Admin Console" })).not.toBeNull(),
    );
  });

  it("renders the shell + a section screen for an authenticated admin", async () => {
    window.localStorage.setItem("sn_admin_access_token", "acc-1");
    window.localStorage.setItem("sn_admin_refresh_token", "ref-1");
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt("/settings");

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).not.toBeNull());
    // Settings/Roles is a disclosed stub — banner names the missing backend
    expect(screen.getByText(/no admin role-management endpoint/i)).not.toBeNull();
  });

  it("shows a not-found state for an unknown authenticated path", async () => {
    window.localStorage.setItem("sn_admin_access_token", "acc-1");
    window.localStorage.setItem("sn_admin_refresh_token", "ref-1");
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt("/does-not-exist");

    await waitFor(() => expect(screen.getByText(/page not found/i)).not.toBeNull());
  });
});
