// Integration smoke test: mount the REAL route tree (adminRoutes) via
// useRoutes under a plain <MemoryRouter>, with the real AdminAuthProvider,
// mocking only the network. Confirms the shell + guard + section screens
// wire together and nothing throws on a real navigation.
//
// useRoutes (not createMemoryRouter) is used deliberately — the routes
// here are plain element routes with no loaders/actions, and the React Router
// data router (still the case on v8) trips a jsdom/undici
// AbortSignal-realm mismatch in this Node version. useRoutes has none of
// that and renders the identical tree.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useRoutes } from "react-router";
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

// The start-up cookie refresh (B-247) is the only network call the shell makes before
// the section screen: 200 = a restored session, 401 = signed out. Everything else
// fails like an unreachable API (as it did before the session moved into memory).
function stubApi(refresh: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/admin/auth/refresh")) return refresh;
      throw new TypeError("Failed to fetch");
    }),
  );
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("adminRoutes (integration)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(getAdminProfile).mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends an unauthenticated visitor from a deep link to /login", async () => {
    stubApi(jsonResponse(401, { message: "No refresh cookie" }));
    renderAt("/moderation");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Admin Console" })).not.toBeNull(),
    );
  });

  it("renders the shell + a section screen for an authenticated admin", async () => {
    stubApi(jsonResponse(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt("/settings");

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).not.toBeNull());
    // Settings/Roles is real data now (feat/admin-roles-vetting-wiring) —
    // its own async GET /admin/staff isn't mocked here, so just confirm
    // the section screen itself rendered (its header, synchronous).
    expect(screen.getByRole("heading", { name: "Roles" })).not.toBeNull();
  });

  it("shows a not-found state for an unknown authenticated path", async () => {
    stubApi(jsonResponse(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt("/does-not-exist");

    await waitFor(() => expect(screen.getByText(/page not found/i)).not.toBeNull());
  });
});
