// Following AgeGateStep.test.tsx / ProfilePage.test.tsx's established
// pattern -- plain DOM assertions, no @testing-library/jest-dom. Session
// seeded directly into sessionStorage; viewport width set on
// window.innerWidth (jsdom lets useIsMobile read it directly -- see
// useIsMobile.ts).
//
// Header.tsx / navigation.ts had NO test file before this (Phase 2 of the
// navbar correction, Decision Log #161).
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import Header from "./Header";
import { primaryNavItems, drawerNavItems } from "./navigation";

const TOKEN_KEY = "sn_access_token";

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
    expect(primaryNavItems.find((i) => i.label === "Blog")?.to).toBe("/news");
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
    expect(screen.getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/news");
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
    expect(within(nav).getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/news");
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
