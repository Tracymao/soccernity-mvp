// Blog -- the general write-up / editorial section (Decision Log #165:
// "Blog" is the label AND the internal identifier; it is not
// news-specific, it covers every content type including sponsored
// articles). Figma source: "Blog Page Desktop -- Logged In" (5953:10771)
// / "-- Logged Out" (5953:11364) and their mobile counterparts
// (5956:10960 / 5956:11331), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /blog. The Figma frames themselves
// needed no redesign for this pass -- backend-plus-wiring only.
//
// NO LOGIN REQUIRED. Like SportsHubPage, the Blog section has both a
// Logged In and a Logged Out canonical Figma frame with identical body
// content -- the only difference is the navbar variant, and the shared
// Header already renders the correct logged-in/out chrome. This page's
// own content is the same either way.
//
// REAL DATA (sprint-4/public-blog-articles-feed, services/api/src/
// modules/blog/): GET /articles and GET /categories, both genuinely
// public -- no Authorization header is ever sent (see ../api/blog.ts).
// The category tabs come from GET /categories (active only); selecting
// a specific tab re-queries GET /articles?categorySlug= for that
// category's own published articles rather than filtering client-side,
// since a category can have articles beyond the "All" tab's own single
// loaded page. The "All" tab's Trending Topics + per-category grouping
// below IS a client-side grouping over that one loaded page -- Section
// 4's own page-size convention (default 20) caps how many articles this
// view can group per visit; the Figma design has no "Load more"
// affordance for Blog, so this is a disclosed, deliberate limitation for
// now, not a bug.
//
// Article images stay non-functional placeholder boxes -- there is no
// Article-to-MediaAsset relation (deferred, see modules/blog/README.md's
// Decision Log candidate #2), so nothing here has a real image URL to
// render.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { listArticles, listCategories, type ArticleSummary, type Category } from "../api/blog";
import "./blog/BlogPage.css";

type LoadState = "loading" | "loaded" | "error";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ArticleTimestamp({ publishedAt }: { publishedAt: string }) {
  return (
    <span className="blog-card__date">
      <span aria-hidden="true">&#128337;</span>
      {formatDate(publishedAt)}
    </span>
  );
}

function FeaturedCard({ article }: { article: ArticleSummary }) {
  return (
    <Link to={`/blog/${article.id}`} className="blog-featured">
      <span className="blog-featured__media" aria-hidden="true" />
      <div className="blog-featured__body">
        <span className="blog-badge">{article.category.name}</span>
        <h3 className="blog-featured__title">{article.title}</h3>
        <p className="blog-featured__excerpt">{article.excerpt}</p>
        <ArticleTimestamp publishedAt={article.publishedAt} />
      </div>
    </Link>
  );
}

function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <Link to={`/blog/${article.id}`} className="blog-card">
      <span className="blog-card__media" aria-hidden="true" />
      <div className="blog-card__body">
        <h3 className="blog-card__title">{article.title}</h3>
        <p className="blog-card__excerpt">{article.excerpt}</p>
        <ArticleTimestamp publishedAt={article.publishedAt} />
      </div>
    </Link>
  );
}

const SECONDARY_PER_SECTION = 6;

function CategorySection({ heading, articles }: { heading: string; articles: ArticleSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const visible = expanded ? rest : rest.slice(0, SECONDARY_PER_SECTION);

  return (
    <section className="blog-section">
      <h2 className="blog-section__title">{heading}</h2>
      <FeaturedCard article={featured} />
      {visible.length > 0 && (
        <div className="blog-grid">
          {visible.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
      {rest.length > SECONDARY_PER_SECTION && (
        <button type="button" className="blog-see-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "See More"}
        </button>
      )}
    </section>
  );
}

const ALL_CATEGORY_ID = "all";

export default function BlogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY_ID);
  const [search, setSearch] = useState("");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [allArticles, setAllArticles] = useState<ArticleSummary[]>([]);

  const [categoryLoadState, setCategoryLoadState] = useState<LoadState>("loaded");
  const [categoryArticles, setCategoryArticles] = useState<ArticleSummary[]>([]);

  // Categories + the "All" tab's first page load once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    (async () => {
      try {
        const [categoryPage, articlePage] = await Promise.all([listCategories(), listArticles()]);
        if (cancelled) return;
        setCategories(categoryPage.items);
        setAllArticles(articlePage.items);
        setLoadState("loaded");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Selecting a specific category tab re-queries GET
  // /articles?categorySlug= for that category's own published articles
  // (Section 4's "filterable by categoryId/category slug") rather than
  // filtering the "All" tab's single loaded page client-side.
  useEffect(() => {
    if (activeCategory === ALL_CATEGORY_ID) return;
    const category = categories.find((c) => c.id === activeCategory);
    if (!category) return;

    let cancelled = false;
    setCategoryLoadState("loading");
    (async () => {
      try {
        const page = await listArticles({ categorySlug: category.slug });
        if (!cancelled) {
          setCategoryArticles(page.items);
          setCategoryLoadState("loaded");
        }
      } catch {
        if (!cancelled) setCategoryLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, categories]);

  const term = search.trim().toLowerCase();
  const currentArticles = activeCategory === ALL_CATEGORY_ID ? allArticles : categoryArticles;

  const searchResults = useMemo(() => {
    if (!term) return null;
    return currentArticles.filter(
      (a) => a.title.toLowerCase().includes(term) || a.excerpt.toLowerCase().includes(term),
    );
  }, [term, currentArticles]);

  // Category sections shown when browsing (not searching). "all" shows a
  // "Trending Topics" block (the loaded page, unfiltered) plus one
  // section per category, grouped client-side from that same page; a
  // specific tab shows just that category's own server-filtered section.
  const sections = useMemo(() => {
    if (activeCategory === ALL_CATEGORY_ID) {
      const trending = { heading: "Trending Topics", articles: allArticles };
      const perCategory = categories
        .map((c) => ({ heading: c.name, articles: allArticles.filter((a) => a.category.id === c.id) }))
        .filter((s) => s.articles.length > 0);
      return [trending, ...perCategory];
    }
    const category = categories.find((c) => c.id === activeCategory);
    return [{ heading: category?.name ?? "Articles", articles: categoryArticles }];
  }, [activeCategory, allArticles, categories, categoryArticles]);

  const isSpecificCategoryLoading = activeCategory !== ALL_CATEGORY_ID && categoryLoadState === "loading";
  const isSpecificCategoryError = activeCategory !== ALL_CATEGORY_ID && categoryLoadState === "error";

  return (
    <div className="blog">
      <div className="blog-hero">
        <p className="blog-hero__title">
          Feel The Passion,
          <br />
          Enjoy the Game.
        </p>
      </div>

      <div className="blog-search">
        <span aria-hidden="true">&#9906;</span>
        <input
          type="search"
          placeholder="Search Topics"
          aria-label="Search topics"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="blog-tabs" role="tablist" aria-label="Article categories">
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === ALL_CATEGORY_ID}
          className={activeCategory === ALL_CATEGORY_ID ? "blog-tab blog-tab--active" : "blog-tab"}
          onClick={() => setActiveCategory(ALL_CATEGORY_ID)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === c.id}
            className={activeCategory === c.id ? "blog-tab blog-tab--active" : "blog-tab"}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loadState === "loading" && (
        <p className="blog-empty" role="status">
          Loading articles&hellip;
        </p>
      )}

      {loadState === "error" && (
        <p className="blog-empty" role="alert">
          Couldn&rsquo;t load articles. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" &&
        (searchResults ? (
          <section className="blog-section">
            <h2 className="blog-section__title">Results for &ldquo;{search.trim()}&rdquo;</h2>
            {isSpecificCategoryLoading ? (
              <p className="blog-empty" role="status">
                Loading articles&hellip;
              </p>
            ) : searchResults.length === 0 ? (
              <p className="blog-empty">No articles match that search.</p>
            ) : (
              <div className="blog-grid">
                {searchResults.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            )}
          </section>
        ) : isSpecificCategoryLoading ? (
          <p className="blog-empty" role="status">
            Loading articles&hellip;
          </p>
        ) : isSpecificCategoryError ? (
          <p className="blog-empty" role="alert">
            Couldn&rsquo;t load articles for this category. Please try again shortly.
          </p>
        ) : (
          sections.map((s) => <CategorySection key={s.heading} heading={s.heading} articles={s.articles} />)
        ))}

      <p className="blog-disclosure">
        Article images aren&rsquo;t available yet &mdash; the Blog has no image upload/storage wiring for articles.
      </p>
    </div>
  );
}
