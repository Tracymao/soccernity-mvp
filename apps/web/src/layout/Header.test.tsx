// Following AgeGateStep.test.tsx / ProfilePage.test.tsx's established
// pattern -- plain DOM assertions, no @testing-library/jest-dom. Session
// seeded directly into sessionStorage; viewport width set on
// window.innerWidth (jsdom lets useIsMobile read it directly -- see
// useIsMobile.ts).
//
// Header.tsx / navigation.ts had NO test file before this (Phase 2 of the
// navbar correction, Decision Log #161).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import Header from "./Header";
import { primaryNavItems, drawerNavItems, accountMenuItems } from "./navigation";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});

vi.mock("../api/notifications", async () => {
  const actual = await vi.importActual<typeof import("../api/notifications")>("../api/notifications");
  return { ...actual, getUnreadCount: vi.fn() };
});

import { getUser } from "../api/users";
import { getUnreadCount } from "../api/notifications";

const TOKEN_KEY = "sn_access_token";

// A real, decodable { sub, role } access token (base64url), matching
// ProfilePage.test.tsx's helper. The other tests deliberately use a
// non-decodable string so Header's profile fetch never fires there.
function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodableToken(sub = "user-1"): string {
  return `${base64Url({ alg: "none" })}.${base64Url({ sub, role: "fan" })}.sig`;
}

const BASE_PROFILE: UserProfile = {
  id: "user-1",
  email: "adeniyi@example.com",
  phone: null,
  displayName: "Adeniyi Christiana",
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderHeader(path = "/community") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  setViewport(1200);
  vi.mocked(getUser).mockReset();
  vi.mocked(getUnreadCount).mockReset();
  // Default to 0 unless a test overrides it -- keeps every pre-existing
  // test's assertions (no badge, no dot) true without having to touch
  // each one individually.
  vi.mocked(getUnreadCount).mockResolvedValue(0);
});

describe("navigation config", () => {
  it("is the canonical Figma icon order: Sports Hub, Blog, Community, Leaderboard, Bants, Clubs, Grassroots, Scouting, Academy", () => {
    expect(primaryNavItems.map((i) => i.label)).toEqual([
      "Sports Hub",
      "Blog",
      "Community",
      "Leaderboard",
      "Bants",
      "Clubs",
      "Grassroots",
      "Scouting",
      "Academy",
    ]);
    expect(primaryNavItems.find((i) => i.label === "Blog")?.to).toBe("/blog");
    expect(primaryNavItems.find((i) => i.label === "Clubs")?.to).toBe("/clubs");
  });

  it("adds Scouting and Academy as the last two desktop icon-nav items, tinted, pointing at /scouting and /academy (Decision Log #284)", () => {
    const scouting = primaryNavItems[primaryNavItems.length - 2];
    const academy = primaryNavItems[primaryNavItems.length - 1];
    expect(scouting.label).toBe("Scouting");
    expect(scouting.to).toBe("/scouting");
    expect(scouting.tinted).toBe(true);
    expect(academy.label).toBe("Academy");
    expect(academy.to).toBe("/academy");
    expect(academy.tinted).toBe(true);
  });

  it("does NOT add Scouting or Academy to the mobile drawer or account dropdown (navbar only, Decision Log #284)", () => {
    expect(drawerNavItems.some((i) => i.label === "Scouting" || i.label === "Academy")).toBe(false);
    expect(accountMenuItems.some((i) => i.label === "Scouting" || i.label === "Academy")).toBe(false);
  });

  it("labels the news/blog pillar 'Blog', never 'News' (Decision Log #165)", () => {
    expect(primaryNavItems.some((i) => i.label === "News")).toBe(false);
    expect(drawerNavItems.some((i) => i.label === "News")).toBe(false);
  });

  it("drawer order matches the live Figma Navigation Drawer (Decision Log #162/#266/#282/#287/#288)", () => {
    expect(drawerNavItems.map((i) => i.label)).toEqual([
      "Community",
      "Messages",
      "Notifications",
      "Sports Hub",
      "Blog",
      "Bants",
      "Leaderboard",
      "Clubs",
      "Groups",
      "Grassroots",
      "Settings",
    ]);
  });

  it("does NOT have a Profile row -- folded into the identity block instead (Decision Log #287/#288)", () => {
    expect(drawerNavItems.some((i) => i.label === "Profile")).toBe(false);
  });

  it("does NOT have a Home row (Decision Log #282 -- the header logo already links home)", () => {
    expect(drawerNavItems.some((i) => i.label === "Home")).toBe(false);
    expect(drawerNavItems.some((i) => i.to === "/")).toBe(false);
  });

  it("the Groups drawer item points at /groups and is available (Decision Log #1/#281/#282, sprint-3/community-groups-frontend)", () => {
    const groups = drawerNavItems.find((i) => i.label === "Groups");
    expect(groups?.to).toBe("/groups");
    // `available` omitted => defaults to true (route exists in router.tsx).
    expect(groups?.available).toBeUndefined();
  });

  it("the Groups account-dropdown item points at /groups and is available (Decision Log #1/#281/#282, sprint-3/community-groups-frontend)", () => {
    const groups = accountMenuItems.find((i) => i.label === "Groups");
    expect(groups?.to).toBe("/groups");
    expect(groups?.available).toBeUndefined();
  });

  it("the Grassroots drawer item points at /grassroots and is available", () => {
    const grassroots = drawerNavItems.find((i) => i.label === "Grassroots");
    expect(grassroots?.to).toBe("/grassroots");
    // `available` omitted => defaults to true (route exists in router.tsx).
    expect(grassroots?.available).toBeUndefined();
  });

  it("adds Grassroots as a tinted desktop icon-nav item, -> /grassroots (Decision Log #272), before Scouting/Academy (Decision Log #284)", () => {
    const grassroots = primaryNavItems[primaryNavItems.length - 3];
    expect(grassroots.label).toBe("Grassroots");
    expect(grassroots.to).toBe("/grassroots");
    expect(grassroots.tinted).toBe(true);
  });
});

describe("Header -- logged out", () => {
  it("renders the nine icon nav links and a Login button, no avatar", () => {
    renderHeader();

    for (const item of primaryNavItems) {
      expect(screen.getByRole("link", { name: item.label })).not.toBeNull();
    }
    expect(screen.getByRole("link", { name: "Login" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
  });

  it("renders a 'Blog' nav link and no 'News' link", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/blog");
    expect(screen.queryByRole("link", { name: "News" })).toBeNull();
  });

  it("points the Clubs nav link at /clubs", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "Clubs" }).getAttribute("href")).toBe("/clubs");
  });
});

describe("Header -- logged in (desktop)", () => {
  beforeEach(() => {
    window.sessionStorage.setItem(TOKEN_KEY, "header.payload.sig");
  });

  it("renders the avatar and no Login button", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Account menu" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
  });

  it("the top-bar messages icon is a real, enabled link to /messages (Decision Log #277)", () => {
    renderHeader();
    const messages = screen.getByRole("link", { name: "Messages" });
    expect(messages.getAttribute("href")).toBe("/messages");
    expect(messages.getAttribute("aria-disabled")).toBeNull();
  });

  it("opens the account dropdown (not the drawer) with Profile / Notification / Settings / Groups / Log out", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const menu = screen.getByRole("menu", { name: "Account" });
    // Dropdown rows carry role="menuitem"; Profile is the one real link.
    expect(within(menu).getByRole("menuitem", { name: "Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    // Notification now resolves (sprint-3/notification-centre-to-code,
    // Decision Log #291).
    expect(within(menu).getByRole("menuitem", { name: "Notification" }).getAttribute("href")).toBe(
      "/notifications",
    );
    // Settings resolves as of sprint-2/privacy-settings-to-code (-> /settings).
    expect(within(menu).getByRole("menuitem", { name: "Settings" }).getAttribute("href")).toBe(
      "/settings",
    );
    // Groups now resolves (sprint-3/community-groups-frontend, Decision
    // Log #1/#281/#282) -> a real link.
    expect(within(menu).getByRole("menuitem", { name: "Groups" }).getAttribute("href")).toBe("/groups");
    expect(within(menu).getByRole("menuitem", { name: "Log out" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("shows no unread badge or avatar dot when the unread count is 0 (Decision Log #291)", async () => {
    renderHeader();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menuitem", { name: "Notification" }).textContent).toBe("Notification");
    expect(document.querySelector(".sn-header__avatar-dot")).toBeNull();
  });

  it("calls getUnreadCount with the caller's own access token", async () => {
    renderHeader();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledWith("header.payload.sig"));
  });

  it("shows a real unread badge on the account dropdown's Notification row, and the avatar dot, when the count is > 0 (Decision Log #291)", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(3);
    renderHeader();
    await waitFor(() => expect(document.querySelector(".sn-header__avatar-dot")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const row = screen.getByRole("menuitem", { name: /Notification/ });
    expect(within(row).getByText("3")).not.toBeNull();
  });

  it("logs out: clears the session and navigates to /", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
    expect(screen.getByRole("link", { name: "Login" })).not.toBeNull();
  });
});

describe("Header -- logged in (mobile)", () => {
  beforeEach(() => {
    window.sessionStorage.setItem(TOKEN_KEY, "header.payload.sig");
    setViewport(500);
  });

  it("opens the Navigation Drawer (not the dropdown) from the avatar", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(screen.queryByRole("menu", { name: "Account" })).toBeNull();

    const nav = within(drawer).getByRole("navigation", { name: "Primary" });
    const rowLabels = Array.from(nav.children).map((el) => el.textContent);
    expect(rowLabels).toEqual(drawerNavItems.map((i) => i.label));

    expect(within(nav).getByRole("link", { name: "Clubs" }).getAttribute("href")).toBe("/clubs");
    expect(within(nav).getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/blog");
    // Messages (Decision Log #277) and Notifications (Decision Log #291)
    // both resolve now.
    expect(within(nav).getByRole("link", { name: "Messages" }).getAttribute("href")).toBe("/messages");
    expect(within(nav).getByRole("link", { name: "Notifications" }).getAttribute("href")).toBe(
      "/notifications",
    );
    // Settings resolves as of sprint-2/privacy-settings-to-code (-> /settings).
    expect(within(nav).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    // Groups now resolves (sprint-3/community-groups-frontend, Decision
    // Log #1/#281/#282) -> a real link.
    expect(within(nav).getByRole("link", { name: "Groups" }).getAttribute("href")).toBe("/groups");
    expect(within(drawer).getByRole("button", { name: "Log out" })).not.toBeNull();
  });

  it("shows a real unread badge on the drawer's Notifications row when the count is > 0 (Decision Log #291)", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(2);
    renderHeader();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const row = await within(drawer).findByRole("link", { name: /Notifications/ });
    expect(within(row).getByText("2")).not.toBeNull();
  });

  it("closes the drawer when the scrim is clicked", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("dialog", { name: "Navigation" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("logs out from the drawer: clears the session and navigates to /", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });
});

// Decision Log #168 -- the drawer identity block wired to a real
// getUser(accessToken, sub) fetch owned by Header.
describe("Header -- drawer identity block (Decision Log #168)", () => {
  beforeEach(() => {
    window.sessionStorage.setItem(TOKEN_KEY, decodableToken("user-1"));
    setViewport(500);
  });

  function openDrawer() {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    return screen.getByRole("dialog", { name: "Navigation" });
  }

  it("fetches the signed-in user's profile once, keyed on the token", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    const drawer = openDrawer();
    await within(drawer).findByText("Adeniyi Christiana");

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith(decodableToken("user-1"), "user-1");

    // A plain navigation (same token) must not refetch.
    fireEvent.click(within(drawer).getByRole("navigation", { name: "Primary" }).querySelector("a")!);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("shows the real displayName (and its initials) when the fetch succeeds", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    const drawer = openDrawer();

    expect(await within(drawer).findByText("Adeniyi Christiana")).not.toBeNull();
    expect(within(drawer).getByText("AC")).not.toBeNull();
    expect(within(drawer).queryByText("Signed in")).toBeNull();
  });

  it("still opens and navigates while the fetch is pending", () => {
    vi.mocked(getUser).mockReturnValueOnce(new Promise<never>(() => {}));
    const drawer = openDrawer();

    // Generic fallback shown, drawer fully functional.
    expect(within(drawer).getByText("Signed in")).not.toBeNull();
    expect(within(drawer).queryByText("Adeniyi Christiana")).toBeNull();

    const nav = within(drawer).getByRole("navigation", { name: "Primary" });
    fireEvent.click(within(nav).getByRole("link", { name: "Clubs" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/clubs");
  });

  it("falls back to the generic 'Signed in' row if the fetch fails, without breaking navigation", async () => {
    vi.mocked(getUser).mockRejectedValueOnce(new Error("network"));
    const drawer = openDrawer();

    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(within(drawer).getByText("Signed in")).not.toBeNull();
    expect(within(drawer).queryByText("Adeniyi Christiana")).toBeNull();

    fireEvent.click(within(drawer).getByRole("button", { name: "Log out" }));
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("pathname").textContent).toBe("/");
  });

  it("never renders a handle / username row (no real data for one -- Decision Log #58)", async () => {
    vi.mocked(getUser).mockResolvedValueOnce({ ...BASE_PROFILE, displayName: "Adeniyi Christiana" });
    const drawer = openDrawer();

    await within(drawer).findByText("Adeniyi Christiana");
    expect(within(drawer).queryByText((content) => content.includes("@"))).toBeNull();
  });

  it("wraps the identity block in a link to /profile, whether the fetch succeeded or is still pending (Decision Log #287/#288)", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    const drawer = openDrawer();
    await within(drawer).findByText("Adeniyi Christiana");

    expect(within(drawer).getByRole("link", { name: "Adeniyi Christiana" }).getAttribute("href")).toBe(
      "/profile",
    );
  });

  it("navigates to /profile and closes the drawer when the identity block is clicked", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(BASE_PROFILE);
    const drawer = openDrawer();
    await within(drawer).findByText("Adeniyi Christiana");

    fireEvent.click(within(drawer).getByRole("link", { name: "Adeniyi Christiana" }));

    expect(screen.getByTestId("pathname").textContent).toBe("/profile");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("the identity block still links to /profile in the generic fallback state (fetch pending)", () => {
    vi.mocked(getUser).mockReturnValueOnce(new Promise<never>(() => {}));
    const drawer = openDrawer();

    expect(within(drawer).getByRole("link", { name: "Signed in" }).getAttribute("href")).toBe(
      "/profile",
    );
  });
});
