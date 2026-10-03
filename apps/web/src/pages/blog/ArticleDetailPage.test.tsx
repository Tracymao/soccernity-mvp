// ArticleDetailPage -- real data (sprint-4/public-blog-articles-feed).
// Mocks ../../api/blog.ts, following BlogPage.test.tsx / ClubFanPage.test.tsx.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import ArticleDetailPage from "./ArticleDetailPage";
import { BlogApiError, type Article, type ArticleSummary } from "../../api/blog";

vi.mock("../../api/blog", async () => {
  const actual = await vi.importActual<typeof import("../../api/blog")>("../../api/blog");
  return {
    ...actual,
    getArticleById: vi.fn(),
    listArticles: vi.fn(),
  };
});

import { getArticleById, listArticles } from "../../api/blog";

const ZAHA: Article = {
  id: "zaha-double-crystal-palace",
  title: "Zaha double helps Crystal Palace ease past Villa for first PL win",
  excerpt: "A double from Wilfried Zaha helped Crystal Palace to a 3-1 win against Aston Villa.",
  publishedAt: "2026-08-08T09:28:00.000Z",
  category: { id: "cat-pl", name: "Premier League", slug: "premier-league" },
  author: "Jane Editor",
  body: "First paragraph of the article.\n\nSecond paragraph, with more detail.",
  coverImage: null,
};

const KANE: ArticleSummary = {
  id: "kane-250-club-spurs",
  title: "Kane joins 250 club after heading Spurs past Wolves",
  excerpt: "Harry Kane scored his 250th goal for Tottenham.",
  publishedAt: "2026-08-08T10:02:00.000Z",
  category: { id: "cat-pl", name: "Premier League", slug: "premier-league" },
  author: "Jane Editor",
  coverImage: null,
};

afterEach(cleanup);
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.mocked(getArticleById).mockReset();
  vi.mocked(listArticles).mockReset();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog/:articleId" element={<ArticleDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ArticleDetailPage", () => {
  it("renders a real article's title, meta and body paragraphs with no session", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [KANE, ZAHA], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);

    expect(
      await screen.findByRole("heading", { name: /Zaha double helps Crystal Palace/i, level: 1 }),
    ).not.toBeNull();
    expect(screen.getByText(/Posted by Jane Editor/i)).not.toBeNull();
    expect(screen.getByText("First paragraph of the article.")).not.toBeNull();
    expect(screen.getByText("Second paragraph, with more detail.")).not.toBeNull();
    expect(getArticleById).toHaveBeenCalledWith(ZAHA.id);
  });

  it("renders a not-found state for a 404 (missing OR draft), with a link back to /blog", async () => {
    vi.mocked(getArticleById).mockRejectedValueOnce(new BlogApiError("Not found", { status: 404 }));

    renderAt("/blog/does-not-exist");

    expect(await screen.findByRole("heading", { name: /article not found/i })).not.toBeNull();
    expect(screen.getByRole("link", { name: /back to blog/i }).getAttribute("href")).toBe("/blog");
  });

  it("renders a generic error state for a non-404 failure, distinct from not-found", async () => {
    vi.mocked(getArticleById).mockRejectedValueOnce(new BlogApiError("Server error", { status: 500 }));

    renderAt(`/blog/${ZAHA.id}`);

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /article not found/i })).toBeNull();
  });

  it("renders the comment composer disabled with an explanatory note", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByText(/comments aren.t available yet/i)).not.toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Comment" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists 'More Trending News' cards from GET /articles, excluding the current article", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [KANE, ZAHA], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);

    const section = (await screen.findByRole("heading", { name: "More Trending News" })).parentElement as HTMLElement;
    const links = section.querySelectorAll("a");
    expect(links.length).toBe(1);
    links.forEach((a) => {
      expect(a.getAttribute("href")).not.toBe(`/blog/${ZAHA.id}`);
      expect(a.getAttribute("href")).toMatch(/^\/blog\//);
    });
  });

  it("omits the 'More Trending News' section entirely when the related fetch fails", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockRejectedValueOnce(new Error("boom"));

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByRole("heading", { name: "More Trending News" })).toBeNull();
  });

  it("shows the article's cover image in the hero slot when one is set", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce({
      ...ZAHA,
      coverImage: { url: "https://media.example.com/zaha-cover.jpg", type: "image" },
    });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { level: 1 });

    const img = document.querySelector(".article-detail__hero img.cover-media__img");
    expect(img?.getAttribute("src")).toBe("https://media.example.com/zaha-cover.jpg");
  });

  it("keeps the hero placeholder box, with no image, when the cover is null", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { level: 1 });

    expect(document.querySelectorAll(".article-detail__hero").length).toBe(1);
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  it("shows a related article's cover on its card", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce(ZAHA);
    vi.mocked(listArticles).mockResolvedValueOnce({
      items: [{ ...KANE, coverImage: { url: "https://media.example.com/kane.jpg", type: "image" } }],
      nextCursor: null,
    });

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { name: "More Trending News" });

    const img = document.querySelector(".article-related-card__media img.cover-media__img");
    expect(img?.getAttribute("src")).toBe("https://media.example.com/kane.jpg");
  });

  it("does not render a non-image cover, keeping the placeholder", async () => {
    vi.mocked(getArticleById).mockResolvedValueOnce({
      ...ZAHA,
      coverImage: { url: "https://media.example.com/clip.mp4", type: "video" },
    });
    vi.mocked(listArticles).mockResolvedValueOnce({ items: [], nextCursor: null });

    renderAt(`/blog/${ZAHA.id}`);
    await screen.findByRole("heading", { level: 1 });

    expect(document.querySelectorAll("img").length).toBe(0);
    expect(document.querySelectorAll(".article-detail__hero").length).toBe(1);
  });
});
