// BlogPage -- real data (sprint-4/public-blog-articles-feed). Mocks
// src/api/blog.ts, following ClubsPage.test.tsx's convention. No session
// is required or seeded -- this page never checks for one.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import BlogPage from "./BlogPage";
import type { ArticleSummary, Category } from "../api/blog";

vi.mock("../api/blog", async () => {
  const actual = await vi.importActual<typeof import("../api/blog")>("../api/blog");
  return {
    ...actual,
    listArticles: vi.fn(),
    listCategories: vi.fn(),
  };
});

import { listArticles, listCategories } from "../api/blog";

const PREMIER_LEAGUE: Category = { id: "cat-pl", name: "Premier League", slug: "premier-league" };
const LA_LIGA: Category = { id: "cat-ll", name: "La Liga", slug: "la-liga" };

const ZAHA: ArticleSummary = {
  id: "zaha-double-crystal-palace",
  title: "Zaha double helps Crystal Palace ease past Villa for first PL win",
  excerpt: "A double from Wilfried Zaha helped Crystal Palace to a 3-1 win against Aston Villa.",
  publishedAt: "2026-08-08T09:28:00.000Z",
  category: { id: "cat-pl", name: "Premier League", slug: "premier-league" },
  author: "Jane Editor",
};

const GIRONA: ArticleSummary = {
  id: "girona-surprise-package",
  title: "Girona are the surprise package no one wants to face",
  excerpt: "Sharp on the counter and organised at the back, Girona have quietly climbed the table.",
  publishedAt: "2026-08-05T11:50:00.000Z",
  category: { id: "cat-ll", name: "La Liga", slug: "la-liga" },
  author: "Jane Editor",
};

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(listArticles).mockReset();
  vi.mocked(listCategories).mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/blog"]}>
      <BlogPage />
    </MemoryRouter>,
  );
}

describe("BlogPage", () => {
  it("calls GET /articles and GET /categories with no Authorization header required -- no session gate", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [PREMIER_LEAGUE], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [ZAHA], nextCursor: null });

    window.sessionStorage.clear();
    window.localStorage.clear();
    renderPage();

    expect(screen.getByText(/Feel The Passion/i)).not.toBeNull();
    // With only one category loaded, "Trending Topics" and its
    // per-category section both render the same article -- same
    // duplication the original dummy-data design already had.
    expect((await screen.findAllByText(ZAHA.title)).length).toBeGreaterThan(0);
    expect(listArticles).toHaveBeenCalledWith();
  });

  it("shows a loading state, then the Trending Topics + per-category sections on the All tab", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [PREMIER_LEAGUE, LA_LIGA], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [ZAHA, GIRONA], nextCursor: null });

    renderPage();

    expect(screen.getByText(/loading articles/i)).not.toBeNull();

    await screen.findByRole("heading", { name: "Trending Topics" });
    expect(screen.getByRole("heading", { name: "Premier League" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "La Liga" })).not.toBeNull();
  });

  it("links each article card to its detail route", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [ZAHA], nextCursor: null });

    renderPage();

    const link = (await screen.findAllByRole("link", { name: new RegExp(ZAHA.title, "i") }))[0];
    expect(link.getAttribute("href")).toBe(`/blog/${ZAHA.id}`);
  });

  it("re-queries GET /articles by categorySlug when a category tab is selected", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [PREMIER_LEAGUE, LA_LIGA], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [ZAHA, GIRONA], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [GIRONA], nextCursor: null });

    renderPage();
    await screen.findByRole("heading", { name: "Trending Topics" });

    fireEvent.click(screen.getByRole("tab", { name: "La Liga" }));

    await waitFor(() => expect(listArticles).toHaveBeenCalledWith({ categorySlug: "la-liga" }));
    expect(screen.queryByRole("heading", { name: "Trending Topics" })).toBeNull();
    expect(await screen.findByText(GIRONA.title)).not.toBeNull();
  });

  it("filters by the search box over the currently loaded articles and shows an empty state when nothing matches", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [PREMIER_LEAGUE, LA_LIGA], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [ZAHA, GIRONA], nextCursor: null });

    renderPage();
    await screen.findByRole("heading", { name: "Trending Topics" });

    fireEvent.change(screen.getByLabelText(/search topics/i), { target: { value: "Girona" } });
    const results = screen.getByRole("heading", { name: /Results for/i }).parentElement as HTMLElement;
    expect(within(results).getByText(GIRONA.title)).not.toBeNull();
    expect(within(results).queryByText(ZAHA.title)).toBeNull();

    fireEvent.change(screen.getByLabelText(/search topics/i), { target: { value: "zzzznomatch" } });
    expect(screen.getByText(/no articles match that search/i)).not.toBeNull();
    // Client-side only -- no extra GET /articles call for a search term.
    expect(listArticles).toHaveBeenCalledTimes(1);
  });

  it("shows a load error without crashing", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(listArticles).mockRejectedValueOnce(new Error("boom"));

    renderPage();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load articles/i);
  });

  it("renders the image-placeholder disclosure note", async () => {
    vi.mocked(listCategories).mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText(/article images aren.t available yet/i)).not.toBeNull();
  });
});
