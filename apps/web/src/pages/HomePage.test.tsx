// Following AgeGateStep.test.tsx / ProfilePage.test.tsx's established
// pattern -- plain DOM assertions, no @testing-library/jest-dom. Session
// seeded directly into the in-memory session store. The two public reads the
// page makes (api/sports, api/blog) are mocked, as SportsHubPage.test.tsx
// and BlogPage.test.tsx do.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { ArticleSummary } from "../api/blog";
import type { MatchListItem } from "../api/sports";
import HomePage, { sortFixtures } from "./HomePage";

vi.mock("../api/sports", async () => {
  const actual = await vi.importActual<typeof import("../api/sports")>("../api/sports");
  return { ...actual, listFixtures: vi.fn() };
});
vi.mock("../api/blog", async () => {
  const actual = await vi.importActual<typeof import("../api/blog")>("../api/blog");
  return { ...actual, listArticles: vi.fn() };
});

import { listFixtures } from "../api/sports";
import { listArticles } from "../api/blog";
import { seedSession, clearSession } from "../test/session";

function team(id: string, name: string, logo: string | null = null) {
  return { id, name, logo };
}

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: "m1",
    competition: "Premier League",
    league: { id: "39", name: "Premier League", season: "2026", round: "Matchday 5" },
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
  vi.mocked(listFixtures).mockReset().mockResolvedValue(page<MatchListItem>([]));
  vi.mocked(listArticles).mockReset().mockResolvedValue(page<ArticleSummary>([]));
});

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
    expect(screen.getByRole("heading", { name: /start the record you should/i })).not.toBeNull();
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

  it("makes both reads once on mount", async () => {
    renderAt("/");
    await waitFor(() => expect(listFixtures).toHaveBeenCalledTimes(1));
    expect(listArticles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFixtures).mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

describe("HomePage: fixtures", () => {
  it("shows the first live match in the hero card, linked to its match page", async () => {
    vi.mocked(listFixtures).mockResolvedValue(
      page([
        match({ id: "sched", status: "scheduled", statusDetail: null, homeScore: null, awayScore: null, kickoffTime: "2026-09-16T18:00:00.000Z" }),
        match({ id: "live1", status: "live", venue: "Anfield" }),
      ]),
    );
    renderAt("/");
    const card = await waitFor(() => {
      const el = document.querySelector("a.home-hero__card");
      if (!el) throw new Error("no hero card yet");
      return el as HTMLElement;
    });
    expect(card.getAttribute("href")).toBe("/sports-hub/matches/live1");
    expect(within(card).getByText("Premier League")).not.toBeNull();
    expect(within(card).getByText("Second half")).not.toBeNull();
    expect(within(card).getByText("Liverpool")).not.toBeNull();
    expect(within(card).getByText("Chelsea")).not.toBeNull();
    expect(within(card).getByText("1")).not.toBeNull();
    expect(within(card).getByText("3")).not.toBeNull();
    expect(within(card).getByText("Anfield")).not.toBeNull();
    expect(card.getAttribute("aria-hidden")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).toBeNull();
  });

  it("sorts live, then scheduled by kickoff ascending, then finished latest first, then postponed and cancelled", () => {
    const items = [
      match({ id: "cancelled", status: "cancelled", kickoffTime: "2026-09-16T12:00:00.000Z" }),
      match({ id: "fin-early", status: "finished", kickoffTime: "2026-09-16T10:00:00.000Z" }),
      match({ id: "sched-late", status: "scheduled", kickoffTime: "2026-09-16T20:00:00.000Z" }),
      match({ id: "postponed", status: "postponed", kickoffTime: "2026-09-16T11:00:00.000Z" }),
      match({ id: "fin-late", status: "finished", kickoffTime: "2026-09-16T13:00:00.000Z" }),
      match({ id: "live", status: "live", kickoffTime: "2026-09-16T14:00:00.000Z" }),
      match({ id: "sched-soon", status: "scheduled", kickoffTime: "2026-09-16T16:00:00.000Z" }),
    ];
    expect(sortFixtures(items).map((m) => m.id)).toEqual([
      "live",
      "sched-soon",
      "sched-late",
      "fin-late",
      "fin-early",
      "postponed",
      "cancelled",
    ]);
  });

  it("renders the strip in that order and shows at most 4 cards", async () => {
    vi.mocked(listFixtures).mockResolvedValue(
      page([
        match({ id: "f1", status: "finished", kickoffTime: "2026-09-16T09:00:00.000Z", homeTeam: team("1", "Finished FC") }),
        match({ id: "s1", status: "scheduled", statusDetail: null, homeScore: null, awayScore: null, kickoffTime: "2026-09-16T17:00:00.000Z", homeTeam: team("2", "Sched Town") }),
        match({ id: "l1", status: "live", homeTeam: team("3", "Live United") }),
        match({ id: "s2", status: "scheduled", statusDetail: null, homeScore: null, awayScore: null, kickoffTime: "2026-09-16T19:00:00.000Z", homeTeam: team("4", "Later City") }),
        match({ id: "p1", status: "postponed", statusDetail: null, homeScore: null, awayScore: null, homeTeam: team("5", "Postponed Rovers") }),
      ]),
    );
    renderAt("/");
    await screen.findByText("Matches today");
    await waitFor(() => expect(document.querySelectorAll("a.home-fixture").length).toBe(4));
    const hrefs = Array.from(document.querySelectorAll("a.home-fixture")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/sports-hub/matches/l1",
      "/sports-hub/matches/s1",
      "/sports-hub/matches/s2",
      "/sports-hub/matches/f1",
    ]);
    expect(screen.queryByText("Postponed Rovers")).toBeNull();
  });

  it("never uses a postponed or cancelled match for the hero card", async () => {
    vi.mocked(listFixtures).mockResolvedValue(
      page([match({ id: "p1", status: "postponed", statusDetail: null, homeScore: null, awayScore: null })]),
    );
    renderAt("/");
    await screen.findByText("Matches today");
    expect(document.querySelector("a.home-hero__card")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
    expect(document.querySelectorAll("a.home-fixture").length).toBe(1);
  });

  it("links View all fixtures to /sports-hub", async () => {
    vi.mocked(listFixtures).mockResolvedValue(page([match()]));
    renderAt("/");
    await screen.findByText("Matches today");
    expect(hrefOf(/view all fixtures/i)).toBe("/sports-hub");
  });

  it("shows the first letter of a club with no logo, and a dash for a missing score", async () => {
    vi.mocked(listFixtures).mockResolvedValue(
      page([
        match({
          id: "nolog",
          status: "scheduled",
          statusDetail: null,
          homeScore: null,
          awayScore: null,
          homeTeam: team("1", "Arsenal", null),
          awayTeam: team("2", "Brighton", null),
          kickoffTime: "2026-09-16T15:00:00.000Z",
          venue: null,
        }),
      ]),
    );
    renderAt("/");
    const card = await waitFor(() => {
      const el = document.querySelector("a.home-hero__card");
      if (!el) throw new Error("no hero card yet");
      return el as HTMLElement;
    });
    const badges = Array.from(card.querySelectorAll(".home-badge")).map((b) => b.textContent);
    expect(badges).toEqual(["A", "B"]);
    expect(card.querySelectorAll("img").length).toBe(0);
    expect(card.querySelectorAll(".home-team-row__score")[0].textContent).toBe("–");
    expect(within(card).getByText(/^Kickoff \d{2}:\d{2}$/)).not.toBeNull();
  });

  it("shows Full time on a finished match with no venue", async () => {
    vi.mocked(listFixtures).mockResolvedValue(page([match({ status: "finished", statusDetail: null, venue: null })]));
    renderAt("/");
    const card = await waitFor(() => {
      const el = document.querySelector("a.home-hero__card");
      if (!el) throw new Error("no hero card yet");
      return el as HTMLElement;
    });
    expect(within(card).getByText("FT")).not.toBeNull();
    expect(within(card).getByText("Full time")).not.toBeNull();
  });

  it("shows 4 skeleton cards while loading and no hero card", async () => {
    vi.mocked(listFixtures).mockReturnValue(new Promise(() => {}));
    renderAt("/");
    expect(screen.getAllByTestId("fixture-skeleton").length).toBe(4);
    const grid = screen.getAllByTestId("fixture-skeleton")[0].parentElement as HTMLElement;
    expect(grid.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("a.home-hero__card")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
  });

  it("shows the empty sentence with a link to Sports Hub when there are no matches today", async () => {
    renderAt("/");
    const text = await screen.findByText(/no matches today\./i);
    expect(text.textContent).toBe("No matches today. See all fixtures on Sports Hub.");
    expect(hrefOf(/all fixtures on sports hub/i)).toBe("/sports-hub");
    expect(document.querySelector("a.home-hero__card")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
  });

  it("hides the whole strip and the hero card when the fixtures read fails", async () => {
    vi.mocked(listFixtures).mockRejectedValue(new Error("boom"));
    renderAt("/");
    await waitFor(() => expect(screen.queryByText("Matches today")).toBeNull());
    await waitFor(() => expect(screen.queryAllByTestId("fixture-skeleton").length).toBe(0));
    expect(screen.queryByText("TODAY'S FIXTURES")).toBeNull();
    expect(screen.queryByRole("link", { name: /view all fixtures/i })).toBeNull();
    expect(document.querySelector("a.home-hero__card")).toBeNull();
    expect(document.querySelector(".home-hero--solo")).not.toBeNull();
    expect(screen.getByText(/deserves a record/i)).not.toBeNull();
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
