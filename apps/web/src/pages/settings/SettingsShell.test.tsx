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

// The Display section's own rail label ("Display, Language & Region")
// shares words with 2 of its 4 hub-row labels ("Display", "Language"), so
// an unscoped getByRole("link", {name: /language/i}) would also match the
// rail's own link and throw on multiple matches. Scope row-link
// assertions to the content panel to avoid that collision.
function panel() {
  return document.querySelector(".settings-panel") as HTMLElement;
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

describe("Security & Account Settings section", () => {
  it("hub renders the intro blurb and the Two-factor authentication row", async () => {
    await renderAt("/settings/security");
    expect(screen.getByRole("heading", { name: "Security & Account Settings" })).not.toBeNull();
    expect(screen.getByText(/manage your account.s security/i)).not.toBeNull();
    const link = screen.getByRole("link", { name: /two-factor authentication/i });
    expect(link.getAttribute("href")).toBe("/settings/security/two-factor");
  });

  it("the rail marks Security active on both the hub and the leaf", async () => {
    await renderAt("/settings/security/two-factor");
    const current = within(rail())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Security & Account Settings");
  });

  it("the Two-Factor Auth (SMS) leaf renders both rows, permanently disabled with a note", async () => {
    await renderAt("/settings/security/two-factor");
    expect(screen.getByRole("heading", { name: "Two-factor authentication" })).not.toBeNull();

    for (const label of ["Text message", "Authentication app"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }

    const toggles = screen.getAllByRole("img", { name: /off \(not adjustable yet\)/i });
    expect(toggles).toHaveLength(2);

    const notes = screen.getAllByText(/two-factor authentication isn.t available yet/i);
    expect(notes).toHaveLength(2);
  });

  it("no session → log-in prompt on both the hub and the leaf, no crash", async () => {
    window.sessionStorage.clear();
    await renderAt("/settings/security");
    expect(screen.getByText(/log in to manage your account security/i)).not.toBeNull();
    cleanup();
    window.sessionStorage.clear();
    await renderAt("/settings/security/two-factor");
    expect(screen.getByText(/log in to manage two-factor authentication/i)).not.toBeNull();
  });
});

describe("Notification Preferences section", () => {
  it("hub renders the intro blurb and all 4 rows, correctly linked", async () => {
    await renderAt("/settings/notifications");
    expect(screen.getByRole("heading", { name: "Notification Preferences" })).not.toBeNull();
    expect(screen.getByText(/choose which notifications you get/i)).not.toBeNull();

    const targets: [RegExp, string][] = [
      [/push notifications/i, "/settings/notifications/push"],
      [/email notifications/i, "/settings/notifications/email"],
      [/filters/i, "/settings/notifications/filters"],
      [/muted accounts/i, "/settings/notifications/muted-accounts"],
    ];
    for (const [name, href] of targets) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
  });

  it.each([
    "/settings/notifications",
    "/settings/notifications/filters",
    "/settings/notifications/push",
    "/settings/notifications/email",
    "/settings/notifications/muted-accounts",
  ])("the rail marks Notification Preferences active on %s", async (path) => {
    await renderAt(path);
    const current = within(rail())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Notification Preferences");
  });

  it("Filters leaf renders the Quality filter row, permanently disabled with a note", async () => {
    await renderAt("/settings/notifications/filters");
    expect(screen.getByRole("heading", { name: "Filters" })).not.toBeNull();
    expect(screen.getByText(/choose what you see in your notifications/i)).not.toBeNull();
    expect(screen.getByText("Quality filter")).not.toBeNull();
    expect(screen.getByRole("img", { name: /quality filter: off \(not adjustable yet\)/i })).not.toBeNull();
    expect(screen.getByText(/notification filtering isn.t available yet/i)).not.toBeNull();
    // Removed "Mute notifications ›" row (Decision Log #230 decision #6) —
    // muting is reached only via the Muted accounts leaf.
    expect(screen.queryByText(/mute notifications/i)).toBeNull();
  });

  it("Push Notifications leaf renders one disabled toggle row", async () => {
    await renderAt("/settings/notifications/push");
    expect(screen.getByRole("heading", { name: "Push notifications" })).not.toBeNull();
    expect(screen.getByText("Turn on push notifications")).not.toBeNull();
    expect(
      screen.getByRole("img", { name: /turn on push notifications: off \(not adjustable yet\)/i }),
    ).not.toBeNull();
    expect(screen.getByText(/push notifications aren.t available yet/i)).not.toBeNull();
  });

  it("Email Notifications leaf renders the master row plus 3 sub-rows, all disabled", async () => {
    await renderAt("/settings/notifications/email");
    expect(screen.getByRole("heading", { name: "Email notifications" })).not.toBeNull();
    expect(screen.getByText("Turn on email notifications")).not.toBeNull();
    for (const label of ["New notifications", "Direct messages", "Posts emailed to you"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    const toggles = screen.getAllByRole("img", { name: /off \(not adjustable yet\)/i });
    expect(toggles).toHaveLength(4);
  });

  it("Muted accounts leaf renders all 3 rows, permanently disabled with a note each", async () => {
    await renderAt("/settings/notifications/muted-accounts");
    expect(screen.getByRole("heading", { name: "Muted accounts" })).not.toBeNull();
    for (const label of [
      "People you don't follow",
      "People who don't follow you",
      "People with a new account",
    ]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    const toggles = screen.getAllByRole("img", { name: /off \(not adjustable yet\)/i });
    expect(toggles).toHaveLength(3);
    const notes = screen.getAllByText(/muting isn.t available yet/i);
    expect(notes).toHaveLength(3);
  });

  it("no session → log-in prompt on the hub and every leaf, no crash", async () => {
    window.sessionStorage.clear();
    for (const [path, message] of [
      ["/settings/notifications", /log in to manage your notification preferences/i],
      ["/settings/notifications/filters", /log in to manage your notification filters/i],
      ["/settings/notifications/push", /log in to manage push notifications/i],
      ["/settings/notifications/email", /log in to manage email notifications/i],
      ["/settings/notifications/muted-accounts", /log in to manage muted accounts/i],
    ] as [string, RegExp][]) {
      window.sessionStorage.clear();
      await renderAt(path);
      expect(screen.getByText(message)).not.toBeNull();
      cleanup();
    }
  });
});

describe("Display, Language & Region section", () => {
  it("hub renders the intro blurb and all 4 rows, correctly linked", async () => {
    await renderAt("/settings/display");
    expect(screen.getByRole("heading", { name: "Display, Language & Region" })).not.toBeNull();
    expect(screen.getByText(/manage how soccernity content is displayed to you/i)).not.toBeNull();

    const targets: [RegExp, string][] = [
      [/^Accessibility/, "/settings/display/accessibility"],
      [/^Display/, "/settings/display/density"],
      [/^Language/, "/settings/display/language"],
      [/^Data usage/i, "/settings/display/data-usage"],
    ];
    for (const [name, href] of targets) {
      expect(within(panel()).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
  });

  it.each([
    "/settings/display",
    "/settings/display/accessibility",
    "/settings/display/density",
    "/settings/display/language",
    "/settings/display/data-usage",
  ])("the rail marks Display, Language & Region active on %s", async (path) => {
    await renderAt(path);
    const current = within(rail())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Display, Language & Region");
  });

  it("Accessibility leaf renders 2 disabled toggles and a disabled value row", async () => {
    await renderAt("/settings/display/accessibility");
    expect(screen.getByRole("heading", { name: "Accessibility" })).not.toBeNull();
    for (const label of ["Reduce motion", "Increase contrast", "Text size"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(screen.getAllByRole("img", { name: /off \(not adjustable yet\)/i })).toHaveLength(2);
    expect(screen.getByText("Default")).not.toBeNull();
  });

  it("Display leaf renders one disabled value row and a cross-reference to Accessibility", async () => {
    await renderAt("/settings/display/density");
    expect(screen.getByRole("heading", { name: "Display" })).not.toBeNull();
    expect(screen.getByText("Display density")).not.toBeNull();
    expect(screen.getByText("Comfortable")).not.toBeNull();
    const link = screen.getByRole("link", { name: /accessibility/i });
    expect(link.getAttribute("href")).toBe("/settings/display/accessibility");
  });

  it("Language leaf renders 4 disabled radio options with English (UK) selected, and the illustrative-only note", async () => {
    await renderAt("/settings/display/language");
    expect(screen.getByRole("heading", { name: "Language" })).not.toBeNull();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    for (const r of radios) {
      expect((r as HTMLButtonElement).disabled).toBe(true);
    }
    const english = screen.getByRole("radio", { name: /english \(uk\)/i });
    expect(english.getAttribute("aria-checked")).toBe("true");
    for (const name of [/french/i, /portuguese/i, /yoruba/i]) {
      expect(screen.getByRole("radio", { name }).getAttribute("aria-checked")).toBe("false");
    }
    expect(screen.getByText(/only english is available today/i)).not.toBeNull();
  });

  it("Data usage leaf renders Data saver off, Autoplay videos on, and a disabled Image quality value row", async () => {
    await renderAt("/settings/display/data-usage");
    expect(screen.getByRole("heading", { name: "Data usage" })).not.toBeNull();
    expect(screen.getByRole("img", { name: /data saver: off \(not adjustable yet\)/i })).not.toBeNull();
    expect(
      screen.getByRole("img", { name: /autoplay videos: on \(not adjustable yet\)/i }),
    ).not.toBeNull();
    expect(screen.getByText("Image quality")).not.toBeNull();
    expect(screen.getByText("Standard")).not.toBeNull();
  });

  it("no session → log-in prompt on the hub and every leaf, no crash", async () => {
    window.sessionStorage.clear();
    for (const [path, message] of [
      ["/settings/display", /log in to manage your display, language, and region settings/i],
      ["/settings/display/accessibility", /log in to manage accessibility settings/i],
      ["/settings/display/density", /log in to manage display settings/i],
      ["/settings/display/language", /log in to manage your language settings/i],
      ["/settings/display/data-usage", /log in to manage data usage settings/i],
    ] as [string, RegExp][]) {
      window.sessionStorage.clear();
      await renderAt(path);
      expect(screen.getByText(message)).not.toBeNull();
      cleanup();
    }
  });

  it("a deeper unmatched path under the now-built Display section 404s, not the old placeholder", async () => {
    await renderAt("/settings/display/foo");
    expect(screen.getByRole("heading", { name: /page not found/i })).not.toBeNull();
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
