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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("routes /search?q= to the search results, inside the shell, with the query in the bar (B-114)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/admin/auth/refresh")) return jsonResponse(200, { accessToken: "acc-1" });
        if (url.includes("/admin/search?q=zaha")) {
          return jsonResponse(200, {
            groups: {
              articles: {
                items: [
                  {
                    id: "a1",
                    title: "Zaha double",
                    status: "published",
                    category: null,
                    publishedAt: null,
                    createdAt: "2022-08-08T09:00:00.000Z",
                  },
                ],
                truncated: false,
              },
            },
          });
        }
        throw new TypeError("Failed to fetch");
      }),
    );
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt("/search?q=zaha");

    expect(await screen.findByRole("table", { name: "Articles" })).not.toBeNull();
    expect(screen.getByText("Ada Lovelace")).not.toBeNull();
    expect((screen.getByRole("textbox", { name: "Search Soccernity" }) as HTMLInputElement).value).toBe("zaha");
  });

  // B-114 (Decision Log #464): the working search bar is on EVERY admin screen, including those that used to hide
  // it and the three that draw their own header. Exactly one bar per screen (the results page swaps in its own).
  it.each([
    "/dashboard",
    "/articles",
    "/articles/new",
    "/users",
    "/users/abc",
    "/users/abc/dob-correction",
    "/users/incorrect-details-reports",
    "/moderation",
    "/moderation/reports/abc",
    "/moderation/appeals/abc",
    "/moderation/held-investigations",
    "/moderation/contact-enquiries",
    "/moderation/contact-enquiries/abc",
    "/moderation/media",
    "/moderation/media/abc",
    "/username-reviews",
    "/username-reviews/abc",
    "/categories",
    "/categories/new",
    "/contest",
    "/contest/history",
    "/contest/impressions",
    "/contest/cycles/abc",
    "/competitions",
    "/media",
    "/media/upload",
    "/settings",
    "/settings/roles/new",
    "/profile",
    "/search",
    "/activity",
    "/does-not-exist",
  ])("shows exactly one working search bar on %s", async (path) => {
    stubApi(jsonResponse(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);

    renderAt(path);

    expect(await screen.findByRole("textbox", { name: "Search Soccernity" })).not.toBeNull();
    expect(screen.getAllByRole("search")).toHaveLength(1);
  });

  it("the search bar on another screen opens the results with the query in the URL", async () => {
    stubApi(jsonResponse(200, { accessToken: "acc-1" }));
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    renderAt("/dashboard");

    const input = await screen.findByRole("textbox", { name: "Search Soccernity" });
    fireEvent.change(input, { target: { value: "nelson" } });
    fireEvent.submit(screen.getByRole("search"));

    expect(await screen.findByRole("heading", { name: "Search" })).not.toBeNull();
    expect((screen.getByRole("textbox", { name: "Search Soccernity" }) as HTMLInputElement).value).toBe("nelson");
  });

  // B-139 part (c): the Username reviews row is for moderator and superadmin only (the server enforces it too).
  it("the nav carries a Username reviews row for a moderator and a superadmin, not for an editor", async () => {
    for (const [role, shown] of [["superadmin", true], ["moderator", true], ["editor", false]] as const) {
      stubApi(jsonResponse(200, { accessToken: "acc-1" }));
      vi.mocked(getAdminProfile).mockResolvedValue({ ...PROFILE, role } as never);
      const { unmount } = renderAt("/dashboard");
      await screen.findByRole("link", { name: "Activity" });
      const link = screen.queryByRole("link", { name: "Username reviews" });
      if (shown) expect(link?.getAttribute("href")).toBe("/username-reviews");
      else expect(link).toBeNull();
      unmount();
    }
  });

  it("/username-reviews opens the list inside the shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/admin/auth/refresh")) return jsonResponse(200, { accessToken: "acc-1" });
        if (url.includes("/admin/username-reviews")) return jsonResponse(200, { items: [], nextCursor: null });
        throw new TypeError("Failed to fetch");
      }),
    );
    vi.mocked(getAdminProfile).mockResolvedValue({ ...PROFILE, role: "moderator" } as never);
    renderAt("/username-reviews");
    expect(await screen.findByRole("heading", { level: 1, name: "Username reviews" })).not.toBeNull();
    expect(await screen.findByText("No pending requests.")).not.toBeNull();
  });

  it("the nav carries an Activity row for every role, linking to /activity", async () => {
    for (const role of ["superadmin", "moderator", "editor"]) {
      stubApi(jsonResponse(200, { accessToken: "acc-1" }));
      vi.mocked(getAdminProfile).mockResolvedValue({ ...PROFILE, role } as never);
      const { unmount } = renderAt("/dashboard");
      const link = await screen.findByRole("link", { name: "Activity" });
      expect(link.getAttribute("href")).toBe("/activity");
      unmount();
    }
  });

  it("/activity is the Audit log for a superadmin and My activity for any other admin", async () => {
    const stub = () =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith("/admin/auth/refresh")) return jsonResponse(200, { accessToken: "acc-1" });
          if (url.includes("/admin/action-log")) return jsonResponse(200, { items: [], nextCursor: null });
          if (url.includes("/admin/staff")) return jsonResponse(200, { items: [], nextCursor: null });
          throw new TypeError("Failed to fetch");
        }),
      );

    stub();
    vi.mocked(getAdminProfile).mockResolvedValue(PROFILE);
    const first = renderAt("/activity");
    expect(await screen.findByRole("heading", { level: 1, name: "Audit log" })).not.toBeNull();
    first.unmount();

    stub();
    vi.mocked(getAdminProfile).mockResolvedValue({ ...PROFILE, role: "moderator" } as never);
    renderAt("/activity");
    expect(await screen.findByRole("heading", { level: 1, name: "My activity" })).not.toBeNull();
  });
});
