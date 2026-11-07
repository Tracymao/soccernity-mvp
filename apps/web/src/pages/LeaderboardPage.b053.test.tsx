// B-053 (Decision Log #472): the All-time period, the Club column and the 7-day change on the Overall board,
// plus the empty-state card. Figma 5171:6633 (desktop), 5540:7264 (mobile), 5542:7344 / 5542:7695 (empty).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LeaderboardPage from "./LeaderboardPage";
import type { ClubSummary } from "../api/clubs";
import type { UserProfile } from "../api/users";
import type { LeaderboardEntryView } from "../api/leaderboard";
import { seedSession, clearSession } from "../test/session";

vi.mock("../api/clubs", async () => {
  const actual = await vi.importActual<typeof import("../api/clubs")>("../api/clubs");
  return { ...actual, listClubs: vi.fn() };
});
vi.mock("../api/leaderboard", async () => {
  const actual = await vi.importActual<typeof import("../api/leaderboard")>("../api/leaderboard");
  return { ...actual, getLeaderboard: vi.fn() };
});
vi.mock("../api/users", async () => {
  const actual = await vi.importActual<typeof import("../api/users")>("../api/users");
  return { ...actual, getUser: vi.fn() };
});
vi.mock("../api/contest", async () => {
  const actual = await vi.importActual<typeof import("../api/contest")>("../api/contest");
  return { ...actual, getCurrentContest: vi.fn() };
});

import { listClubs } from "../api/clubs";
import { getLeaderboard } from "../api/leaderboard";
import { getUser } from "../api/users";
import { getCurrentContest } from "../api/contest";

const IKOYI: ClubSummary = {
  id: "club-ikoyi",
  name: "Ikoyi Rovers FC",
  league: null,
  country: null,
  logoUrl: null,
  memberCount: 1,
  joined: true,
};

function profile(club: { id: string; name: string } | null): UserProfile {
  return {
    id: "me",
    email: "fan@example.com",
    phone: null,
    displayName: "Fan",
    username: null,
    publicName: "Fan",
    dateOfBirth: "1998-07-04",
    isMinor: false,
    role: "fan",
    verificationStatus: "unverified",
    profileComplete: true,
    guardianConsentStatus: "not_applicable",
    nextStep: "none",
    createdAt: new Date().toISOString(),
    clubAffiliationId: null,
    isTeamOrganiser: false,
    representedClub: club,
    bio: null,
    preferredClub: null,
    profileCountry: null,
    avatar: null,
    cover: null,
  } as UserProfile;
}

function b64(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN = `${b64({ alg: "none" })}.${b64({ sub: "me", role: "fan" })}.sig`;

const ROWS: LeaderboardEntryView[] = [
  { userId: "a", publicName: "Moved Up", points: 500, rank: 1, club: { id: "c1", name: "Ikoyi Rovers FC" }, rankChange7d: -3 },
  { userId: "b", publicName: "Moved Down", points: 400, rank: 2, club: { id: "c2", name: "Surulere United" }, rankChange7d: 2 },
  { userId: "c", publicName: "Held Steady", points: 300, rank: 3, club: null, rankChange7d: 0 },
  { userId: "d", publicName: "Newcomer", points: 200, rank: 4, club: null, rankChange7d: null },
];

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/leaderboard"]}>
      <LeaderboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  setWidth(1280);
});
beforeEach(() => {
  setWidth(1280);
  clearSession();
  seedSession(TOKEN);
  vi.mocked(listClubs).mockReset();
  vi.mocked(listClubs).mockResolvedValue({ items: [IKOYI], nextCursor: null });
  vi.mocked(getUser).mockReset();
  vi.mocked(getUser).mockResolvedValue(profile(null));
  vi.mocked(getCurrentContest).mockReset();
  vi.mocked(getCurrentContest).mockRejectedValue(new Error("not used"));
  vi.mocked(getLeaderboard).mockReset();
  vi.mocked(getLeaderboard).mockResolvedValue({ items: ROWS, nextCursor: null });
});

function row(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("Overall board: 7-day change (sign: negative = moved UP)", () => {
  it("draws an up arrow for a negative rankChange7d, a down arrow for a positive one", async () => {
    renderPage();
    await screen.findByText("Moved Up");

    const up = within(row("Moved Up")).getByLabelText("Up 3 places over the last 7 days");
    expect(up.textContent).toBe("▲3");
    const down = within(row("Moved Down")).getByLabelText("Down 2 places over the last 7 days");
    expect(down.textContent).toBe("▼2");
  });

  it("draws 0 with no arrow for a zero change, and a dash with no arrow for null", async () => {
    renderPage();
    await screen.findByText("Held Steady");

    const zero = within(row("Held Steady")).getByLabelText("Rank unchanged over the last 7 days");
    expect(zero.textContent).toBe("0");
    const none = within(row("Newcomer")).getByLabelText("No rank change figure for the last 7 days");
    expect(none.textContent).toBe("—");
    expect(row("Held Steady").textContent).not.toMatch(/[▲▼]/);
    expect(row("Newcomer").textContent).not.toMatch(/[▲▼]/);
  });

  it("does not colour-code the change (the frames say it is never colour-coded)", async () => {
    renderPage();
    await screen.findByText("Moved Up");
    const classes = Array.from(document.querySelectorAll(".lb-change")).map((el) => el.className);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.join(" ")).not.toMatch(/green|red|alert/);
  });
});

describe("Overall board: Club column", () => {
  it("shows the club name, or a plain dash when the club is null", async () => {
    renderPage();
    await screen.findByText("Moved Up");

    expect(within(row("Moved Up")).getByText("Ikoyi Rovers FC")).not.toBeNull();
    expect(within(row("Moved Down")).getByText("Surulere United")).not.toBeNull();
    // A person with no club and a minor (whose club the API withholds) look the same: a dash, with no text
    // that hints a club exists.
    const cells = within(row("Held Steady")).getAllByRole("cell");
    expect(cells[2].textContent).toBe("—");
    expect(row("Held Steady").textContent).not.toMatch(/hidden|private|withheld/i);
    expect(within(row("Newcomer")).getAllByRole("cell")[2].textContent).toBe("—");
  });

  it("orders the columns Rank, Player, Club, 7-day change, Points", async () => {
    renderPage();
    await screen.findByText("Moved Up");
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Rank", "Player", "Club", "7-day change", "Points"]);
  });
});

describe("Overall board: mobile layout (Figma 5540:7264)", () => {
  it("drops the Club and 7-day change columns, putting the club under the name and the change under the points", async () => {
    setWidth(390);
    renderPage();
    await screen.findByText("Moved Up");

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["#", "Player", "Pts"]);

    const first = within(row("Moved Up"));
    expect(first.getByText("Ikoyi Rovers FC")).not.toBeNull();
    expect(first.getByLabelText("Up 3 places over the last 7 days").textContent).toBe("▲3");
    // The same sign mapping holds on mobile.
    expect(within(row("Moved Down")).getByLabelText("Down 2 places over the last 7 days").textContent).toBe("▼2");
    expect(within(row("Newcomer")).getByLabelText("No rank change figure for the last 7 days").textContent).toBe("—");
  });
});

describe("Overall board: All-time", () => {
  it("enables All-time and fetches period=all-time when it is chosen", async () => {
    renderPage();
    await screen.findByText("Moved Up");

    // Weekly is the default: no period is sent (the server defaults to the current week).
    expect(vi.mocked(getLeaderboard).mock.calls[0][1]).toEqual({ clubId: undefined, period: undefined });

    const allTime = screen.getByRole("radio", { name: "All-time" }) as HTMLButtonElement;
    expect(allTime.disabled).toBe(false);
    fireEvent.click(allTime);

    await waitFor(() =>
      expect(vi.mocked(getLeaderboard)).toHaveBeenLastCalledWith(expect.any(String), {
        clubId: undefined,
        period: "all-time",
      }),
    );
    expect(screen.getByRole("radio", { name: "All-time" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/all-time/i, { selector: ".lb-meta__muted" })).not.toBeNull();
  });

  it("keeps the all-time period when loading more and when switching to the club board", async () => {
    vi.mocked(getUser).mockResolvedValue(profile({ id: IKOYI.id, name: IKOYI.name }));
    vi.mocked(getLeaderboard).mockResolvedValue({ items: ROWS, nextCursor: "cur-2" });
    renderPage();
    await screen.findByText("Moved Up");

    fireEvent.click(screen.getByRole("radio", { name: "All-time" }));
    await waitFor(() =>
      expect(vi.mocked(getLeaderboard)).toHaveBeenLastCalledWith(expect.any(String), {
        clubId: undefined,
        period: "all-time",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(vi.mocked(getLeaderboard)).toHaveBeenLastCalledWith(expect.any(String), {
        cursor: "cur-2",
        clubId: undefined,
        period: "all-time",
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: "By club" }));
    await waitFor(() =>
      expect(vi.mocked(getLeaderboard)).toHaveBeenLastCalledWith(expect.any(String), {
        clubId: IKOYI.id,
        period: "all-time",
      }),
    );
  });
});

describe("Overall board: empty states (Figma 5542:7344 / 5542:7695)", () => {
  beforeEach(() => {
    vi.mocked(getLeaderboard).mockResolvedValue({ items: [], nextCursor: null });
  });

  it("shows the card with the board-wide wording and no Reset filters button on the default filters", async () => {
    renderPage();
    expect(await screen.findByText("No ranked players here yet")).not.toBeNull();
    expect(screen.getByText(/nobody has earned points for the selected time period yet/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says 'in this club' on the club board and offers Reset filters, which returns to Global and Weekly", async () => {
    vi.mocked(getUser).mockResolvedValue(profile({ id: IKOYI.id, name: IKOYI.name }));
    renderPage();
    await screen.findByText("No ranked players here yet");

    fireEvent.click(screen.getByRole("radio", { name: "All-time" }));
    fireEvent.click(screen.getByRole("radio", { name: "By club" }));
    expect(await screen.findByText(/nobody in this club has earned points/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() =>
      expect(vi.mocked(getLeaderboard)).toHaveBeenLastCalledWith(expect.any(String), {
        clubId: undefined,
        period: undefined,
      }),
    );
    expect(screen.getByRole("radio", { name: "Global" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Weekly" }).getAttribute("aria-checked")).toBe("true");
  });

  it("does not flash the empty card while the board is still loading", async () => {
    let resolve!: (v: { items: LeaderboardEntryView[]; nextCursor: string | null }) => void;
    vi.mocked(getLeaderboard).mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    await screen.findByRole("tab", { name: "Overall" });
    expect(screen.queryByText("No ranked players here yet")).toBeNull();
    resolve({ items: [], nextCursor: null });
    expect(await screen.findByText("No ranked players here yet")).not.toBeNull();
  });

  it("shows the same card on mobile", async () => {
    setWidth(390);
    renderPage();
    expect(await screen.findByText("No ranked players here yet")).not.toBeNull();
  });
});
