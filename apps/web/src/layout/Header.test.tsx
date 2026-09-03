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
import { primaryNavItems, drawerNavItems } from "./navigation";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});

import { getUser } from "../api/users";

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
});

describe("navigation config", () => {
  it("is the canonical Figma icon order: Sports Hub, Blog, Community, Leaderboard, Bants, Clubs", () => {
    expect(primaryNavItems.map((i) => i.label)).toEqual([
      "Sports Hub",
      "Blog",
      "Community",
      "Leaderboard",
      "Bants",
      "Clubs",
    ]);
    expect(primaryNavItems.find((i) => i.label === "Blog")?.to).toBe("/blog");
    expect(primaryNavItems.find((i) => i.label === "Clubs")?.to).toBe("/clubs");
  });

  it("labels the news/blog pillar 'Blog', never 'News' (Decision Log #165)", () => {
    expect(primaryNavItems.some((i) => i.label === "News")).toBe(false);
    expect(drawerNavItems.some((i) => i.label === "News")).toBe(false);
  });

  it("drawer order matches the Figma Navigation Drawer (Decision Log #162)", () => {
    expect(drawerNavItems.map((i) => i.label)).toEqual([
      "Home",
      "Community",
      "Sports Hub",
      "Blog",
      "Bants",
      "Leaderboard",
      "Clubs",
      "Messages",
      "Notifications",
      "Profile",
      "Settings",
    ]);
  });
});

describe("Header -- logged out", () => {
  it("renders the six icon nav links and a Login button, no avatar", () => {
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

  it("opens the account dropdown (not the drawer) with Profile / Notification / Settings / Log out", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const menu = screen.getByRole("menu", { name: "Account" });
    // Dropdown rows carry role="menuitem"; Profile is the one real link.
    expect(within(menu).getByRole("menuitem", { name: "Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    // Notification + Settings have no route yet -> disabled, not links.
    expect(within(menu).queryByRole("link", { name: "Notification" })).toBeNull();
    expect(within(menu).getByText("Notification").getAttribute("aria-disabled")).toBe("true");
    expect(within(menu).getByText("Settings").getAttribute("aria-disabled")).toBe("true");
    expect(within(menu).getByRole("menuitem", { name: "Log out" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("shows no fabricated notification count on the Notification row (Decision Log #167)", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Notification").textContent).toBe("Notification");
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
    // Messages / Notifications / Settings -- no route yet (Decision Log #166).
    expect(within(nav).queryByRole("link", { name: "Messages" })).toBeNull();
    expect(within(nav).getByText("Settings").getAttribute("aria-disabled")).toBe("true");
    expect(within(drawer).getByRole("button", { name: "Log out" })).not.toBeNull();
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
});
