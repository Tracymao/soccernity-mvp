// B-230 (Decision Log #417 item 2, #468): the signed-in header avatar shows the
// owner's initials when there is no approved picture, desktop and mobile.
// Figma: "Avatar - Initials" 6959:46000, navbar variants 6961:45993 (desktop) /
// 6961:46102 (mobile), states frame 6962:45997.
//
// Kept apart from Header.test.tsx (which covers navigation, the drawer and the
// dropdown) so this file only has to describe the avatar face.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Header from "./Header";
import type { UserProfile } from "../api/users";

vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
vi.mock("../api/notifications", async () => {
  const actual = await vi.importActual<typeof import("../api/notifications")>("../api/notifications");
  return { ...actual, getUnreadCount: vi.fn() };
});
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, logoutSession: vi.fn().mockResolvedValue(undefined) };
});
import { getUser } from "../api/users";
import { getUnreadCount } from "../api/notifications";
import { seedSession, clearSession } from "../test/session";

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// A decodable { sub, role } token so Header's profile fetch fires.
const TOKEN = `${base64Url({ alg: "none" })}.${base64Url({ sub: "user-1", role: "fan" })}.sig`;

const BASE_PROFILE: UserProfile = {
  id: "user-1",
  email: "adeniyi@example.com",
  phone: null,
  displayName: "Adeniyi Christiana",
  username: null,
  publicName: "Soccernity member",
  dateOfBirth: "1997-11-08",
  isMinor: false,
  role: "fan",
  verificationStatus: "verified",
  profileComplete: true,
  guardianConsentStatus: "not_applicable",
  nextStep: "none",
  createdAt: "2026-01-15T00:00:00.000Z",
  clubAffiliationId: null,
  isTeamOrganiser: false,
  representedClub: null,
  bio: null,
  preferredClub: null,
  profileCountry: null,
  avatar: null,
  cover: null,
};

function profileWith(over: Partial<UserProfile>): UserProfile {
  return { ...BASE_PROFILE, ...over };
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/community"]}>
      <Header />
    </MemoryRouter>,
  );
}

function accountButton(): HTMLElement {
  return screen.getByRole("button", { name: "Account menu" });
}

// Waits until the avatar button's visible text is `text`.
async function expectInitials(text: string) {
  await waitFor(() => expect(accountButton().textContent).toBe(text));
}

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  vi.mocked(getUser).mockReset();
  vi.mocked(getUnreadCount).mockReset();
  vi.mocked(getUnreadCount).mockResolvedValue(0);
});

// The same cases on both layouts: the Figma frame is one component for desktop
// and mobile (the mobile variant only differs in the navbar around it).
describe.each([
  ["desktop", 1200],
  ["mobile", 390],
])("header avatar initials -- %s", (_label, width) => {
  beforeEach(() => {
    setViewport(width);
    seedSession(TOKEN);
  });

  it("shows the two initials of a two-word name", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "Adeniyi Christiana" }));
    renderHeader();
    await expectInitials("AC");
  });

  it("a single-word name gives one letter", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "Adeniyi" }));
    renderHeader();
    await expectInitials("A");
  });

  it("a long name gives first and last word only, never more than two characters", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(
      profileWith({ displayName: "Maria da Silva dos Santos Oliveira Albuquerque Pereira Lima" }),
    );
    renderHeader();
    await expectInitials("ML");
    expect(Array.from(accountButton().textContent ?? "").length).toBe(2);
  });

  it("an empty or whitespace-only name falls back to ? (what the frame shows for no word)", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "" }));
    renderHeader();
    await expectInitials("?");
    cleanup();

    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "   \t " }));
    renderHeader();
    await expectInitials("?");
  });

  it("non-Latin names: Cyrillic, Arabic and CJK", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "Иван Петров" }));
    renderHeader();
    await expectInitials("ИП");
    cleanup();

    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "محمد علي" }));
    renderHeader();
    await expectInitials("مع");
    cleanup();

    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "李 小龙" }));
    renderHeader();
    await expectInitials("李小");
  });

  it("a name that starts outside the Basic Multilingual Plane is not cut in half", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ displayName: "𠮷野 家" }));
    renderHeader();
    await expectInitials("𠮷家");
  });

  it("uses the owner's displayName, not the public name other people see (Decision Log #364)", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(
      profileWith({ displayName: "Adeniyi Christiana", username: "nelson_iheagwam", publicName: "nelson_iheagwam" }),
    );
    renderHeader();
    await expectInitials("AC"); // not "N"
  });

  it("is decoration only: the button keeps its accessible name and the letters are hidden from it", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({}));
    renderHeader();
    await expectInitials("AC");
    expect(accountButton().getAttribute("aria-label")).toBe("Account menu");
    expect(accountButton().querySelector(".sn-header__avatar-initials")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows an approved picture instead of initials", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(
      profileWith({ avatar: { url: "https://cdn.example.test/a.jpg", status: "approved" } }),
    );
    renderHeader();
    await waitFor(() => expect(accountButton().querySelector("img")).not.toBeNull());
    const img = accountButton().querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.example.test/a.jpg");
    expect(accountButton().textContent).toBe("");
    expect(accountButton().querySelector(".sn-header__avatar-initials")).toBeNull();
  });

  it.each(["pending", "rejected"] as const)(
    "a %s picture is not shown in the header: the owner sees initials",
    async (status) => {
      vi.mocked(getUser).mockResolvedValueOnce(
        profileWith({ avatar: { url: "https://cdn.example.test/a.jpg", status } }),
      );
      renderHeader();
      await expectInitials("AC");
      expect(accountButton().querySelector("img")).toBeNull();
    },
  );

  it("an approved picture that cannot be loaded falls back to the initials", async () => {
    vi.mocked(getUser).mockResolvedValueOnce(
      profileWith({ avatar: { url: "https://cdn.example.test/broken.jpg", status: "approved" } }),
    );
    renderHeader();
    await waitFor(() => expect(accountButton().querySelector("img")).not.toBeNull());
    fireEvent.error(accountButton().querySelector("img")!);
    await expectInitials("AC");
    expect(accountButton().querySelector("img")).toBeNull();
  });

  it("shows nothing (the plain circle) while the profile is loading, so no ? flashes", async () => {
    vi.mocked(getUser).mockReturnValueOnce(new Promise<never>(() => {}));
    renderHeader();
    expect(accountButton().textContent).toBe("");
    expect(accountButton().querySelector("img")).toBeNull();
    expect(accountButton().querySelector(".sn-header__avatar-initials")).toBeNull();
  });

  it("shows nothing if the profile fetch fails -- the header still works", async () => {
    vi.mocked(getUser).mockRejectedValueOnce(new Error("network"));
    renderHeader();
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    expect(accountButton().textContent).toBe("");
  });

  it("keeps the unread dot next to the initials", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(3);
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({}));
    renderHeader();
    await expectInitials("AC");
    await waitFor(() => expect(accountButton().querySelector(".sn-header__avatar-dot")).not.toBeNull());
  });

  it("logged out: there is no avatar and no initials", () => {
    clearSession();
    renderHeader();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(document.querySelector(".sn-header__avatar-initials")).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});

// #468: the account dropdown and the drawer identity block were NOT changed. The
// drawer still draws the PUBLIC name (what it did before), so for someone with a
// username the header (displayName) and the drawer (publicName) can differ.
describe("the drawer and the dropdown are unchanged by B-230", () => {
  beforeEach(() => seedSession(TOKEN));

  it("mobile: the drawer identity block still shows the public name and its initials", async () => {
    setViewport(390);
    vi.mocked(getUser).mockResolvedValueOnce(
      profileWith({ displayName: "Adeniyi Christiana", username: "nelson_iheagwam", publicName: "nelson_iheagwam" }),
    );
    renderHeader();
    await expectInitials("AC");

    fireEvent.click(accountButton());
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(within(drawer).getByText("nelson_iheagwam")).not.toBeNull();
    expect(within(drawer).getByText("N")).not.toBeNull();
  });

  it("mobile: the drawer's identity circle still renders initials for a display-name-only account", async () => {
    setViewport(390);
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({ publicName: "Adeniyi Christiana" }));
    renderHeader();
    await expectInitials("AC");
    fireEvent.click(accountButton());
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(await within(drawer).findByText("AC")).not.toBeNull();
  });

  it("desktop: the account dropdown has no initials or name added", async () => {
    setViewport(1200);
    vi.mocked(getUser).mockResolvedValueOnce(profileWith({}));
    renderHeader();
    await expectInitials("AC");
    fireEvent.click(accountButton());
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText("AC")).toBeNull();
    expect(within(menu).queryByText("Adeniyi Christiana")).toBeNull();
  });
});
