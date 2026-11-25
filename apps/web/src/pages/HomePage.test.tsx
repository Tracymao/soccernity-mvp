// Following AgeGateStep.test.tsx / ProfilePage.test.tsx's established
// pattern -- plain DOM assertions, no @testing-library/jest-dom. Session
// seeded directly into the in-memory session store. The two public reads the
// page makes (api/sports, api/blog) are mocked, as SportsHubPage.test.tsx
// and BlogPage.test.tsx do.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { ArticleSummary } from "../api/blog";
import type { MatchListItem } from "../api/sports";
import HomePage from "./HomePage";

vi.mock("../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../api/sports")>("../api/sports");
  return { ...actual, listFixtures: vi.fn(), listLiveScores: vi.fn(), listRecentResults: vi.fn() };
});
vi.mock("../api/blog", async () => {
  const actual = await vi.importActual<typeof import("../api/blog")>("../api/blog");
  return { ...actual, listArticles: vi.fn() };
});

import { listFixtures, listLiveScores, listRecentResults } from "../api/sports";
import { listArticles } from "../api/blog";
import { seedSession, clearSession } from "../test/session";

function team(id: string, name: string, logo: string | null = null) {
  return { id, name, logo };
}

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: "m1",
    competition: "Premier League",
    league: { id: "39", name: "Premier League", season: "2026", round: "Matchday 5", rank: 1, country: "England" },
    venue: "Anfield",
    kickoffTime: "2026-09-16T15:00:00.000Z",
    status: "live",
    statusDetail: "Second half",
    homeTeam: team("h1", "Liverpool"),
    awayTeam: team("a1", "Chelsea"),
    homeScore: 1,
    awayScore: 3,
    score: "1 - 3",
    ...overrides,
  };
}

function article(n: number, overrides: Partial<ArticleSummary> = {}): ArticleSummary {
  return {
    id: `art${n}`,
    title: `Story title ${n}`,
    excerpt: `Excerpt for story ${n}.`,
    publishedAt: "2026-09-10T09:00:00.000Z",
    category: { id: "c1", name: "La Liga", slug: "la-liga" },
    author: "Newsroom",
    coverImage: null,
    ...overrides,
  };
}

const page = <T,>(items: T[]) => ({ items, nextCursor: null });

afterEach(cleanup);
beforeEach(() => {
  clearSession();
  serve({});
  vi.mocked(listArticles).mockReset().mockResolvedValue(page<ArticleSummary>([]));
});

interface Served {
  live?: MatchListItem[];
  finished?: MatchListItem[];
  scheduled?: MatchListItem[];
  recent?: MatchListItem[];
}

// Serves the four public reads the page makes, by the status asked for.
function serve(s: Served) {
  vi.mocked(listLiveScores).mockReset().mockResolvedValue(page(s.live ?? []));
  vi.mocked(listFixtures)
    .mockReset()
    .mockImplementation(async (_d: string, o?: { status?: string }) =>
      page(o?.status === "finished" ? (s.finished ?? []) : o?.status === "scheduled" ? (s.scheduled ?? []) : []),
    );
  vi.mocked(listRecentResults)
    .mockReset()
    .mockResolvedValue({ date: "2026-09-15", items: s.recent ?? [] });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/community" element={<div>COMMUNITY FEED</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function hrefOf(name: RegExp | string, scope: HTMLElement | Document = document): string | null {
  const el = within(scope as HTMLElement).getByRole("link", { name });
  return el.getAttribute("href");
}

describe("HomePage: static content", () => {
  it("renders the hero, the pillars and the closing CTA when there is no session", async () => {
    renderAt("/");
    expect(screen.getByText(/deserves a record/i)).not.toBeNull();
    expect(screen.getByText(/where the whole game lives/i)).not.toBeNull();
    expect(screen.getByRole("heading", { name: /where no one keeps the record/i })).not.toBeNull();
    expect(screen.getByText("Grassroots first")).not.toBeNull();
    expect(screen.queryByText(/nobody keeps records for/i)).toBeNull();
    expect(document.body.textContent).not.toContain("no database has ever counted");
    expect(document.body.textContent).not.toContain("never appear in any official record anywhere");
    expect(screen.getByText("A community around your game")).not.toBeNull();
    expect(screen.getByText(/the professional game, live\./i)).not.toBeNull();
    const closing = screen.getByRole("heading", { name: /start the record you should/i });
    expect(closing).not.toBeNull();
    expect(closing.querySelector("br")).toBeNull();
    expect(screen.queryByText("COMMUNITY FEED")).toBeNull();
    await waitFor(() => expect(listFixtures).toHaveBeenCalled());
  });

  it("points its primary CTAs at /signup and Explore fixtures at /sports-hub", async () => {
    renderAt("/");
    const ctas = screen.getAllByRole("link", { name: /create your profile/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta.getAttribute("href")).toBe("/signup"));
    expect(hrefOf(/explore fixtures/i)).toBe("/sports-hub");
    expect(hrefOf(/register your team/i)).toBe("/signup");
    await waitFor(() => expect(listArticles).toHaveBeenCalled());
  });

  it("reads live scores, today's finished and scheduled matches, and articles once on mount", async () => {
    renderAt("/");
    await waitFor(() => expect(listFixtures).toHaveBeenCalledTimes(2));
    expect(listLiveScores).toHaveBeenCalledTimes(1);
    expect(listArticles).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(listFixtures).mock.calls;
    expect(calls.map((c) => c[1]?.status).sort()).toEqual(["finished", "scheduled"]);
    expect(calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows no invented content", async () => {
    renderAt("/");
    await waitFor(() => expect(listFixtures).toHaveBeenCalled());
    for (const text of [/ikoyi/i, /surulere/i, /zaha/i, /talents/i, /top stories today/i, /plus bants/i, /min read/i]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByText("GRASSROOTS")).toBeNull();
    expect(screen.queryByText("SPORTS HUB")).toBeNull();
  });
});

const sched = (id: string, over: Partial<MatchListItem> = {}) =>
  match({ id, status: "scheduled", statusDetail: null, homeScore: null, awayScore: null, ...over });
const fin = (id: string, over: Partial<MatchListItem> = {}) =>
  match({ id, status: "finished", statusDetail: null, ...over });
const lg = (id: string, name: string, rank: number | null) => ({ id, name, season: "2026", round: null, rank, country: "X" });

function heroCard(): HTMLElement {
  return document.querySelector("section.home-hero-card") as HTMLElement;
}
async function findHero(): Promise<HTMLElement> {
  return await waitFor(() => {
    const el = heroCard();
    if (!el) throw new Error("no hero card yet");
    return el;
  });
}
const tabNames = (card: HTMLElement) => within(card).queryAllByRole("tab").map((t) => t.getAttribute("title"));

describe("HomePage: hero card", () => {
  it("shows today's matches with the live pill and a linked row", async () => {
    serve({ live: [match({ id: "live1", statusDetail: "67'" })], finished: [fin("f1")] });
    renderAt("/");
    const card = await findHero();
    expect(within(card).getByRole("heading", { name: "Today’s matches" })).not.toBeNull();
    expect(within(card).getByText("1 live now")).not.toBeNull();
    expect(within(card).getByText("67'")).not.toBeNull();
    expect(within(card).getByText("FT")).not.toBeNull();
    const hrefs = Array.from(card.querySelectorAll("a.home-hero-row")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/sports-hub/matches/live1", "/sports-hub/matches/f1"]);
    expect(within(card).getByText("Plus Bants, Blog stories and the community around every match.")).not.toBeNull();
    expect(within(card).getByRole("link", { name: /view all scores/i }).getAttribute("href")).toBe("/sports-hub");
    expect(document.querySelector(".home-hero--solo")).toBeNull();
  });

  it("falls back to Live when the live match has no minute", async () => {
    serve({ live: [match({ statusDetail: null })] });
    renderAt("/");
    const card = await findHero();
    expect(card.querySelector(".home-hero-pill--live")?.textContent).toBe("Live");
  });

  it("shows no live pill, dot or live label when nothing is live", async () => {
    serve({ finished: [fin("f1")] });
    renderAt("/");
    const card = await findHero();
    expect(card.querySelector(".home-hero-livepill")).toBeNull();
    expect(card.querySelector(".home-hero-livepill__dot")).toBeNull();
    expect(card.querySelector(".home-hero-pill--live")).toBeNull();
    expect(within(card).queryByText(/^live( now)?$|live now/i)).toBeNull();
  });

  it("shows a single league as a line under the title, with no tabs", async () => {
    serve({ live: [match()] });
    renderAt("/");
    const card = await findHero();
    expect(within(card).queryAllByRole("tab").length).toBe(0);
    expect(card.querySelector(".home-hero-card__league")?.textContent).toBe("Premier League");
  });

  it("orders tabs in server rank order, with the finished-only league after", async () => {
    serve({
      live: [
        match({ id: "b", league: lg("2", "La Liga", 3) }),
        match({ id: "a", league: lg("1", "Premier League", 1) }),
      ],
      finished: [fin("c", { league: lg("3", "Serie A", 4) })],
    });
    renderAt("/");
    const card = await findHero();
    expect(tabNames(card)).toEqual(["Premier League", "La Liga", "Serie A"]);
  });

  it("opens on the highest-ranked league with a live match, else the first tab", async () => {
    serve({
      live: [match({ id: "la", league: lg("2", "La Liga", 3) })],
      finished: [fin("pl", { league: lg("1", "Premier League", 1) })],
    });
    const { unmount } = renderAt("/");
    let card = await findHero();
    let selected = within(card).getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.map((t) => t.getAttribute("title"))).toEqual(["La Liga"]);
    unmount();

    serve({
      finished: [fin("pl", { league: lg("1", "Premier League", 1) }), fin("la", { league: lg("2", "La Liga", 3) })],
    });
    renderAt("/");
    card = await findHero();
    selected = within(card).getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.map((t) => t.getAttribute("title"))).toEqual(["Premier League"]);
  });

  it("adds a More chip to Sports Hub when there are more than 3 leagues, and shows only 3 tabs", async () => {
    serve({
      finished: [1, 2, 3, 4].map((n) => fin(`m${n}`, { league: lg(String(n), `League ${n}`, n) })),
    });
    renderAt("/");
    const card = await findHero();
    expect(tabNames(card)).toEqual(["League 1", "League 2", "League 3"]);
    expect(within(card).getByRole("link", { name: "More" }).getAttribute("href")).toBe("/sports-hub");
  });

  it("has no More chip with exactly 3 leagues", async () => {
    serve({ finished: [1, 2, 3].map((n) => fin(`m${n}`, { league: lg(String(n), `League ${n}`, n) })) });
    renderAt("/");
    const card = await findHero();
    expect(within(card).queryByRole("link", { name: "More" })).toBeNull();
  });

  it("shortens a long league name on the tab and keeps the full name as the title", async () => {
    const long = "UEFA Champions League Qualification";
    serve({
      finished: [fin("a", { league: lg("1", long, 1) }), fin("b", { league: lg("2", "La Liga", 2) })],
    });
    renderAt("/");
    const card = await findHero();
    const tab = within(card).getByRole("tab", { name: long });
    expect(tab.getAttribute("title")).toBe(long);
    expect(tab.textContent!.length).toBeLessThanOrEqual(22);
    expect(tab.textContent!.endsWith("…")).toBe(true);
  });

  it("fills each tab with at most 3 rows: live first, then finished newest first", async () => {
    serve({
      live: [match({ id: "l1" })],
      finished: [
        fin("old", { kickoffTime: "2026-09-16T09:00:00.000Z" }),
        fin("new", { kickoffTime: "2026-09-16T13:00:00.000Z" }),
        fin("mid", { kickoffTime: "2026-09-16T11:00:00.000Z" }),
      ],
    });
    renderAt("/");
    const card = await findHero();
    const hrefs = Array.from(card.querySelectorAll("a.home-hero-row")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/sports-hub/matches/l1", "/sports-hub/matches/new", "/sports-hub/matches/mid"]);
  });

  it("shows the first 3 live matches when more than 3 are live", async () => {
    serve({ live: [1, 2, 3, 4, 5].map((n) => match({ id: `l${n}` })) });
    renderAt("/");
    const card = await findHero();
    expect(card.querySelectorAll("a.home-hero-row").length).toBe(3);
    expect(within(card).getByText("5 live now")).not.toBeNull();
  });

  it("switches tab on click and with the arrow keys, keeping a roving tabindex", async () => {
    serve({
      finished: [
        fin("pl", { league: lg("1", "Premier League", 1), homeTeam: team("h", "Home PL") }),
        fin("la", { league: lg("2", "La Liga", 2), homeTeam: team("h2", "Home LL") }),
      ],
    });
    renderAt("/");
    const card = await findHero();
    const tabs = within(card).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect(within(card).getByText("Home PL")).not.toBeNull();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(within(card).getByText("Home LL")).not.toBeNull();
    expect(within(card).queryByText("Home PL")).toBeNull();
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    fireEvent.click(tabs[0]);
    expect(within(card).getByText("Home PL")).not.toBeNull();
    expect(within(card).getByRole("tabpanel")).not.toBeNull();
  });

  it("uses a real logo only when safe, else the first letter in a circle", async () => {
    serve({
      finished: [
        fin("a", {
          homeTeam: team("1", "Arsenal", null),
          awayTeam: team("2", "Brighton", "https://evil.example/logo.png"),
        }),
      ],
    });
    renderAt("/");
    const card = await findHero();
    expect(Array.from(card.querySelectorAll(".home-hero-crest")).map((c) => c.textContent)).toEqual(["A", "B"]);
    expect(card.querySelectorAll("img").length).toBe(0);
  });

  it("shows a skeleton card with 3 skeleton rows while loading", () => {
    vi.mocked(listLiveScores).mockReset().mockReturnValue(new Promise(() => {}));
    renderAt("/");
    const sk = screen.getByTestId("hero-skeleton");
    expect(sk.getAttribute("aria-busy")).toBe("true");
    expect(sk.querySelectorAll(".home-hero-skel--row").length).toBe(3);
    expect(document.querySelector(".home-hero--solo")).toBeNull();
  });

  it("hides the card and widens the hero copy when nothing is live or finished today", async () => {
    serve({ scheduled: [sched("s1")] });
    renderAt("/");
    await screen.findByText("Matches today");
    expect(heroCard()).toBeNull();
    expect(screen.queryByTestId("hero-skeleton")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
  });

  it("hides the card when the request fails, with no error shown, and the page stays", async () => {
    serve({});
    vi.mocked(listLiveScores).mockRejectedValue(new Error("boom"));
    renderAt("/");
    await waitFor(() => expect(screen.queryByTestId("hero-skeleton")).toBeNull());
    expect(heroCard()).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
    expect(screen.getByText(/deserves a record/i)).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/boom|error/i);
  });
});

describe("HomePage: hero refresh", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes every 60 seconds only while a match is live and the page is visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve({ live: [match()] });
    renderAt("/");
    await findHero();
    expect(listLiveScores).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listLiveScores).toHaveBeenCalledTimes(2);

    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listLiveScores).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("does not refresh when nothing is live, and a live pill goes when the match ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve({ finished: [fin("f1")] });
    renderAt("/");
    await findHero();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listLiveScores).toHaveBeenCalledTimes(1);
  });

  it("drops the live pill after a refresh finds the match finished", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve({ live: [match({ id: "x" })] });
    renderAt("/");
    const card = await findHero();
    expect(within(card).getByText("1 live now")).not.toBeNull();
    serve({ finished: [fin("x")] });
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => expect(heroCard().querySelector(".home-hero-livepill")).toBeNull());
    expect(within(heroCard()).getByText("FT")).not.toBeNull();
  });
});

describe("HomePage: Today's Fixtures strip", () => {
  it("shows scheduled matches only, in server order, at most 4, never live", async () => {
    serve({
      live: [match({ id: "l1", homeTeam: team("9", "Live United") })],
      scheduled: [1, 2, 3, 4, 5].map((n) => sched(`s${n}`, { homeTeam: team(String(n), `Sched ${n}`) })),
    });
    renderAt("/");
    await screen.findByText("Matches today");
    await waitFor(() => expect(document.querySelectorAll("a.home-fixture").length).toBe(4));
    const hrefs = Array.from(document.querySelectorAll("a.home-fixture")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/sports-hub/matches/s1", "/sports-hub/matches/s2", "/sports-hub/matches/s3", "/sports-hub/matches/s4"]);
    expect(screen.getByText("TODAY'S FIXTURES")).not.toBeNull();
    expect(document.querySelector("a.home-fixture .home-pill--live")).toBeNull();
    expect(vi.mocked(listRecentResults)).not.toHaveBeenCalled();
  });

  it("asks only for scheduled matches", async () => {
    serve({ scheduled: [sched("s1")] });
    renderAt("/");
    await screen.findByText("Matches today");
    const scheduledCall = vi.mocked(listFixtures).mock.calls.find((c) => c[1]?.status === "scheduled");
    expect(scheduledCall?.[1]).toMatchObject({ status: "scheduled", limit: 4 });
  });

  it("falls back to the latest results with its own eyebrow and heading", async () => {
    serve({ recent: [fin("r1", { homeTeam: team("1", "Recent FC") })] });
    renderAt("/");
    await screen.findByText("Latest results");
    expect(screen.getByText("LATEST RESULTS")).not.toBeNull();
    expect(screen.queryByText("TODAY'S FIXTURES")).toBeNull();
    expect(screen.getByText("Recent FC")).not.toBeNull();
    expect(hrefOf(/view all fixtures/i)).toBe("/sports-hub");
  });

  it("shows the empty sentence when there is nothing scheduled and no recent results", async () => {
    renderAt("/");
    const text = await screen.findByText(/no matches today\./i);
    expect(text.textContent).toBe("No matches today. See all fixtures on Sports Hub.");
    expect(hrefOf(/all fixtures on sports hub/i)).toBe("/sports-hub");
  });

  it("hides the whole strip when the read fails, and the page stays", async () => {
    serve({});
    vi.mocked(listFixtures).mockRejectedValue(new Error("boom"));
    renderAt("/");
    await waitFor(() => expect(screen.queryAllByTestId("fixture-skeleton").length).toBe(0));
    expect(screen.queryByText("Matches today")).toBeNull();
    expect(screen.queryByText("TODAY'S FIXTURES")).toBeNull();
    expect(screen.queryByRole("link", { name: /view all fixtures/i })).toBeNull();
    expect(screen.getByText(/deserves a record/i)).not.toBeNull();
  });

  it("shows 4 skeleton cards while loading", () => {
    vi.mocked(listFixtures).mockReset().mockReturnValue(new Promise(() => {}));
    vi.mocked(listLiveScores).mockReset().mockResolvedValue(page<MatchListItem>([]));
    renderAt("/");
    expect(screen.getAllByTestId("fixture-skeleton").length).toBe(4);
    expect(screen.getAllByTestId("fixture-skeleton")[0].parentElement?.getAttribute("aria-busy")).toBe("true");
  });

  it("shows the first letter of a club with no logo, and a dash for a missing score", async () => {
    serve({
      scheduled: [sched("nolog", { homeTeam: team("1", "Arsenal", null), awayTeam: team("2", "Brighton", null), venue: null })],
    });
    renderAt("/");
    const card = await waitFor(() => {
      const el = document.querySelector("a.home-fixture");
      if (!el) throw new Error("no fixture yet");
      return el as HTMLElement;
    });
    expect(Array.from(card.querySelectorAll(".home-badge")).map((b) => b.textContent)).toEqual(["A", "B"]);
    expect(card.querySelectorAll("img").length).toBe(0);
    expect(card.querySelectorAll(".home-team-row__score")[0].textContent).toBe("–");
  });
});


describe("HomePage: featured placeholder", () => {
  it("marks the featured media as no-cover only when the article has no cover image", async () => {
    vi.mocked(listArticles).mockResolvedValue(page([article(1), article(2)]));
    renderAt("/");
    await screen.findByRole("heading", { name: "Story title 1" });
    expect(document.querySelector(".home-featured__mediawrap--no-cover")).not.toBeNull();
    cleanup();
    vi.mocked(listArticles).mockResolvedValue(
      page([article(1, { coverImage: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", type: "image" } as ArticleSummary["coverImage"] }), article(2)]),
    );
    renderAt("/");
    await screen.findByRole("heading", { name: "Story title 1" });
    expect(document.querySelector(".home-featured__mediawrap")).not.toBeNull();
    expect(document.querySelector(".home-featured__mediawrap--no-cover")).toBeNull();
  });
});

describe("HomePage: Latest from the blog", () => {
  it("shows the first article as featured and the next three in the side list", async () => {
    vi.mocked(listArticles).mockResolvedValue(
      page([article(1, { category: { id: "c9", name: "Premier League", slug: "pl" } }), article(2), article(3), article(4), article(5)]),
    );
    renderAt("/");
    const title = await screen.findByRole("heading", { name: "Story title 1" });
    expect(hrefOf("Story title 1")).toBe("/blog/art1");
    expect(title.closest("article")).not.toBeNull();
    expect(screen.getByText("Excerpt for story 1.")).not.toBeNull();
    expect(screen.getByText("Newsroom · 10/09/2026")).not.toBeNull();
    expect(document.querySelector(".home-featured__tag")?.textContent).toBe("Premier League");

    const side = Array.from(document.querySelectorAll("a.home-story"));
    expect(side.map((a) => a.getAttribute("href"))).toEqual(["/blog/art2", "/blog/art3", "/blog/art4"]);
    expect(side[0].textContent).toContain("Story title 2");
    expect(side[0].textContent).toContain("La Liga · 10/09/2026");
    expect(screen.queryByText("Story title 5")).toBeNull();
  });

  it("shows no rank badges, no ranking label and no reading time", async () => {
    vi.mocked(listArticles).mockResolvedValue(page([article(1), article(2), article(3), article(4)]));
    renderAt("/");
    await screen.findByRole("heading", { name: "Story title 1" });
    expect(document.querySelector(".home-pill--rank")).toBeNull();
    expect(screen.queryByText(/top stories today/i)).toBeNull();
    expect(screen.queryByText(/trending/i)).toBeNull();
    expect(screen.queryByText(/min read/i)).toBeNull();
    expect(screen.queryByText(/\d+\s+views?\b/i)).toBeNull();
  });

  it("links See more stories to /blog", async () => {
    vi.mocked(listArticles).mockResolvedValue(page([article(1)]));
    renderAt("/");
    await screen.findByRole("heading", { name: "Story title 1" });
    expect(hrefOf(/see more stories/i)).toBe("/blog");
    expect(screen.getByText("From the Blog")).not.toBeNull();
    expect(screen.getByText("LATEST")).not.toBeNull();
  });

  it("shows skeletons while loading", () => {
    vi.mocked(listArticles).mockReturnValue(new Promise(() => {}));
    renderAt("/");
    expect(screen.getAllByTestId("article-skeleton").length).toBe(4);
    expect(screen.getByText("From the Blog")).not.toBeNull();
  });

  it("hides the whole section when there are no articles", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.queryAllByTestId("article-skeleton").length).toBe(0));
    expect(screen.queryByText("From the Blog")).toBeNull();
    expect(screen.queryByRole("link", { name: /see more stories/i })).toBeNull();
  });

  it("hides the whole section when the articles read fails, and the rest of the page stays", async () => {
    vi.mocked(listArticles).mockRejectedValue(new Error("boom"));
    renderAt("/");
    await waitFor(() => expect(screen.queryAllByTestId("article-skeleton").length).toBe(0));
    expect(screen.queryByText("From the Blog")).toBeNull();
    expect(screen.getByRole("heading", { name: /where no one keeps the record/i })).not.toBeNull();
  });
});

describe("HomePage: signed in", () => {
  it("redirects to /community and makes no API request (Decision Log #152)", async () => {
    seedSession("header.payload.sig");
    renderAt("/");
    expect(screen.getByText("COMMUNITY FEED")).not.toBeNull();
    expect(screen.queryByText(/deserves a record/i)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(listFixtures).not.toHaveBeenCalled();
    expect(listArticles).not.toHaveBeenCalled();
  });
});
