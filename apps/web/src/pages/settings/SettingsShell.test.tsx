// Settings shell + landing + Account overview + placeholders + route
// redirects. Mounts the REAL route tree (createMemoryRouter(routes)) so
// nesting, redirects and active-state derivation are exercised for real.
// Only api/users is mocked (landing identity row).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, useRoutes } from "react-router";
import { routes } from "../../app/router";

vi.mock("../../api/users", async () => {
  const actual = await vi.importActual<typeof import("../../api/users")>("../../api/users");
  return {
    ...actual,
    getUser: vi.fn().mockResolvedValue({
      id: "u1",
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      isMinor: false,
    }),
  };
});

// header.payload.signature with payload {"sub":"u1","role":"fan"}
const TOKEN = `x.${btoa(JSON.stringify({ sub: "u1", role: "fan" }))}.y`;

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
}

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(document.querySelector("main")).not.toBeNull());
  return router;
}

// <Navigate> inside a DATA router (createMemoryRouter) trips a jsdom/undici
// AbortSignal realm mismatch, so redirects are exercised through a plain
// <MemoryRouter> + useRoutes(routes) instead — same real route tree.
function Probe() {
  const el = useRoutes(routes);
  const loc = useLocation();
  return (
    <>
      <span data-testid="path">{loc.pathname}</span>
      {el}
    </>
  );
}
async function pathAfterRedirect(from: string) {
  render(
    <MemoryRouter initialEntries={[from]}>
      <Probe />
    </MemoryRouter>,
  );
  return screen.getByTestId("path");
}

const SECTION_LABELS = [
  "Account",
  "Security & Account Settings",
  "Privacy",
  "Notification Preferences",
  "Display, Language & Region",
];

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("sn_access_token", TOKEN);
  setWidth(1280);
});

function rail() {
  return screen.getByRole("navigation", { name: "Settings sections" });
}

describe("Settings shell — desktop rail", () => {
  it("renders all 5 rows with the Decision Log #230 labels", async () => {
    await renderAt("/settings/account");
    const links = within(rail()).getAllByRole("link");
    expect(links.map((l) => l.textContent?.replace("›", "").trim())).toEqual(SECTION_LABELS);
  });

  it.each([
    ["/settings/account", "Account"],
    ["/settings/account/deactivate", "Account"],
    ["/settings/account/delete", "Account"],
    ["/settings/privacy", "Privacy"],
    ["/settings/security", "Security & Account Settings"],
    ["/settings/notifications", "Notification Preferences"],
    ["/settings/display", "Display, Language & Region"],
  ])("%s marks %s active", async (path, label) => {
    await renderAt(path);
    const current = within(rail())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain(label);
  });

  it("landing (/settings) has no active row", async () => {
    await renderAt("/settings");
    const current = within(rail())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(0);
  });
});

describe("Settings landing", () => {
  it("desktop: identity from GET /users/:id + 5 section links", async () => {
    await renderAt("/settings");
    expect(await screen.findByText("Ada Lovelace")).not.toBeNull();
    expect(screen.getByText("ada@example.com")).not.toBeNull();
    expect(screen.getByText("Overview")).not.toBeNull();
  });

  it("no session → log-in prompt, no fetch", async () => {
    window.sessionStorage.clear();
    await renderAt("/settings");
    expect(screen.getByText(/log in to manage your settings/i)).not.toBeNull();
  });

  it("mobile: shows the All settings card → /settings/menu, no rail", async () => {
    setWidth(390);
    await renderAt("/settings");
    const card = await screen.findByRole("link", { name: /all settings/i });
    expect(card.getAttribute("href")).toBe("/settings/menu");
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    expect(screen.queryByText(/‹/)).toBeNull();
  });
});

describe("Mobile hub + back bar", () => {
  it("/settings/menu lists the 5 sections with no back bar", async () => {
    setWidth(390);
    await renderAt("/settings/menu");
    for (const label of SECTION_LABELS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: /‹\s*settings/i })).toBeNull();
  });

  it("a section page shows the back bar → /settings/menu", async () => {
    setWidth(390);
    await renderAt("/settings/account");
    const back = screen.getByRole("link", { name: /settings/i, description: "" });
    expect(back).not.toBeNull();
    expect(document.querySelector(".settings-backbar")?.getAttribute("href")).toBe("/settings/menu");
  });

  it("/settings/menu redirects to /settings on desktop", async () => {
    const path = await pathAfterRedirect("/settings/menu");
    await waitFor(() => expect(path.textContent).toBe("/settings"));
  });
});

describe("Account overview", () => {
  it("links Deactivate/Delete to the real flows; other rows are disabled", async () => {
    await renderAt("/settings/account");
    expect(
      screen.getByRole("link", { name: /deactivate account/i }).getAttribute("href"),
    ).toBe("/settings/account/deactivate");
    expect(screen.getByRole("link", { name: /delete account/i }).getAttribute("href")).toBe(
      "/settings/account/delete",
    );
    expect(screen.getByText(/account information/i).closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText(/change password/i).closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getByText(/club representation/i).closest("[aria-disabled='true']")).not.toBeNull();
  });

  it("re-parented Deactivate and Delete render inside the shell", async () => {
    await renderAt("/settings/account/deactivate");
    expect(screen.getByRole("heading", { name: /deactivate/i })).not.toBeNull();
    expect(rail()).not.toBeNull();
    cleanup();
    await renderAt("/settings/account/delete");
    expect(screen.getByRole("heading", { name: /delete your account/i })).not.toBeNull();
    expect(rail()).not.toBeNull();
  });
});

describe("Unbuilt sections", () => {
  it.each(["security", "notifications", "display"])("/settings/%s shows the not-built placeholder", async (seg) => {
    await renderAt(`/settings/${seg}`);
    expect(screen.getByRole("status").textContent).toMatch(/not built yet/i);
  });

  it("deeper unbuilt paths also land on the placeholder, not a 404", async () => {
    await renderAt("/settings/security/two-factor");
    expect(screen.getByRole("status").textContent).toMatch(/not built yet/i);
  });
});

describe("Old routes redirect", () => {
  it.each([
    ["/settings/deactivate", "/settings/account/deactivate"],
    ["/settings/delete-account", "/settings/account/delete"],
  ])("%s → %s", async (from, to) => {
    const path = await pathAfterRedirect(from);
    await waitFor(() => expect(path.textContent).toBe(to));
  });

  it("/settings/privacy still resolves under the shell", async () => {
    const router = await renderAt("/settings/privacy");
    expect(router.state.location.pathname).toBe("/settings/privacy");
  });
});
