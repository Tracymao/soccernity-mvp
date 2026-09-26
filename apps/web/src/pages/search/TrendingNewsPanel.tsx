// "Trending News" card -- desktop-only left-rail region of Community --
// Search & Trending. Figma source: desktop "Search page with trending
// topics" (2876:4628) -- card 2876:4634 region, title 2876:4712, refresh
// icon 2876:4713, rows 2876:4715-4729 (thumbnail / headline / blurb /
// date + clock icon 2876:4638). The mobile frame (5780:8581) has no news
// sidebar, so SearchTrendingPage.tsx only mounts this on desktop (nothing
// is fetched on mobile).
//
// Wired to the existing public GET /articles (api/blog.ts, the Blog
// module) -- no new endpoint.
//
// SIMPLIFICATION, disclosed: "trending" here means RECENCY -- the most
// recently published articles, newest first, exactly the order GET
// /articles already returns. No view/engagement tracking exists on
// articles anywhere in the schema or API (Decision Log #306: no
// page-view tracking), so there is nothing to rank by popularity and no
// popularity is fabricated. GET /articles has no `limit` param either, so
// the first page is fetched and cut to the top TRENDING_NEWS_COUNT
// client-side (the Figma frame shows three rows).
//
// Article has no image field (Decision Log #334, deferred), so the Figma
// thumbnail slot renders a plain typographic tile (category initial)
// rather than a fabricated image. The blurb is the server-computed
// `excerpt` (Decision Log #333). Dates use the app's absolute en-GB
// format rather than the frame's illustrative "08/08/2022" literal.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BlogApiError, listArticles, type ArticleSummary } from "../../api/blog";
import refreshIcon from "../../assets/icons/trends-refresh.svg";
import timeIcon from "../../assets/icons/news-time.svg";

export const TRENDING_NEWS_COUNT = 3;

type LoadState = "loading" | "loaded" | "error";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function TrendingNewsPanel() {
  const [items, setItems] = useState<ArticleSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower response overwriting a newer one
  // (rapid refresh clicks).
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => (prev === "loaded" ? prev : "loading"));
    setError(null);
    try {
      const page = await listArticles();
      if (id !== requestId.current) return;
      setItems(page.items.slice(0, TRENDING_NEWS_COUNT));
      setState("loaded");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof BlogApiError ? err.message : "Couldn't load news right now.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="trends-card" aria-labelledby="trending-news-title">
      <header className="trends-card__header">
        <h2 id="trending-news-title" className="trends-card__title">
          Trending News
        </h2>
        <button type="button" className="trends-card__refresh" aria-label="Refresh news" onClick={load}>
          <img src={refreshIcon} alt="" width={24} height={24} />
        </button>
      </header>

      {state === "loading" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          Loading news…
        </p>
      )}

      {state === "error" && (
        <p className="trends-card__status trends-card__status--error" role="alert">
          {error}
        </p>
      )}

      {state === "loaded" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          No news yet.
        </p>
      )}

      {items.length > 0 && (
        <ul className="trends-card__list">
          {items.map((article) => (
            <li key={article.id} className="news-card__row">
              <Link to={`/blog/${article.id}`} className="news-card__link">
                <span className="news-card__thumb" aria-hidden="true">
                  {article.category.name.trim()[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="news-card__text">
                  <span className="news-card__headline">{article.title}</span>
                  <span className="news-card__blurb">{article.excerpt}</span>
                  <span className="news-card__date">
                    <img src={timeIcon} alt="" width={12} height={12} />
                    {DATE_FMT.format(new Date(article.publishedAt))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
