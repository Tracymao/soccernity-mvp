// Blog -- the general write-up / editorial section (Decision Log #165:
// "Blog" is the label AND the internal identifier; it is not
// news-specific, it covers every content type including sponsored
// articles). Figma source: "Blog Page Desktop -- Logged In" (5953:10771)
// / "-- Logged Out" (5953:11364) and their mobile counterparts
// (5956:10960 / 5956:11331), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /blog.
//
// NO LOGIN REQUIRED. Like SportsHubPage, the Blog section has both a
// Logged In and a Logged Out canonical Figma frame with identical body
// content -- the only difference is the navbar variant, and the shared
// Header already renders the correct logged-in/out chrome. This page's
// own content is the same either way.
//
// BACKEND STATE, confirmed live before writing this: there is NO blog /
// article / content module anywhere in services/api/src/modules, and
// Build Plan Section 4 defines no blog endpoint. The `Article` entity
// exists in prisma/schema.prisma but has zero reads/writes. Every
// article, category and date rendered here is illustrative dummy content
// (see ./blog/blogData.ts) -- the same discipline SportsHubPage.tsx
// applies for the identical reason. The category tabs and the search box
// filter that dummy list client-side only; there is no real query.
//
// NOTE on the task brief's "pinned-post badge says 'Pinned post'"
// (Decision Log #173): that badge lives on the *Community* home-feed
// frames (2565:3951 / 5956:12797), not on any Blog Page frame -- see this
// PR's Decision Log entry. The Blog frames use a "Trending Topics"
// featured card with a category badge ("Premier League"), which is what
// is reproduced below.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ARTICLES, CATEGORIES, articlesByCategory, type Article } from "./blog/blogData";
import "./blog/BlogPage.css";

function ArticleTimestamp({ date }: { date: string }) {
  return (
    <span className="blog-card__date">
      <span aria-hidden="true">&#128337;</span>
      {date}
    </span>
  );
}

function FeaturedCard({ article }: { article: Article }) {
  return (
    <Link to={`/blog/${article.id}`} className="blog-featured">
      <span className="blog-featured__media" aria-hidden="true" />
      <div className="blog-featured__body">
        <span className="blog-badge">{article.categoryLabel}</span>
        <h3 className="blog-featured__title">{article.title}</h3>
        <p className="blog-featured__excerpt">{article.excerpt}</p>
        <ArticleTimestamp date={article.date} />
      </div>
    </Link>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link to={`/blog/${article.id}`} className="blog-card">
      <span className="blog-card__media" aria-hidden="true" />
      <div className="blog-card__body">
        <h3 className="blog-card__title">{article.title}</h3>
        <p className="blog-card__excerpt">{article.excerpt}</p>
        <ArticleTimestamp date={article.date} />
      </div>
    </Link>
  );
}

const SECONDARY_PER_SECTION = 6;

function CategorySection({ heading, articles }: { heading: string; articles: Article[] }) {
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

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!term) return null;
    const base = articlesByCategory(activeCategory);
    return base.filter(
      (a) => a.title.toLowerCase().includes(term) || a.excerpt.toLowerCase().includes(term),
    );
  }, [term, activeCategory]);

  // Category sections shown when browsing (not searching). "all" shows a
  // "Trending Topics" block plus one section per league; a specific tab
  // shows just that league's section.
  const sections = useMemo(() => {
    if (activeCategory === "all") {
      const trending: { heading: string; articles: Article[] } = {
        heading: "Trending Topics",
        articles: ARTICLES,
      };
      const perCategory = CATEGORIES.filter((c) => c.id !== "all")
        .map((c) => ({ heading: c.label, articles: articlesByCategory(c.id) }))
        .filter((s) => s.articles.length > 0);
      return [trending, ...perCategory];
    }
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    return [{ heading: cat?.label ?? "Articles", articles: articlesByCategory(activeCategory) }];
  }, [activeCategory]);

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
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === c.id}
            className={activeCategory === c.id ? "blog-tab blog-tab--active" : "blog-tab"}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {searchResults ? (
        <section className="blog-section">
          <h2 className="blog-section__title">Results for &ldquo;{search.trim()}&rdquo;</h2>
          {searchResults.length === 0 ? (
            <p className="blog-empty">No articles match that search.</p>
          ) : (
            <div className="blog-grid">
              {searchResults.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </section>
      ) : (
        sections.map((s) => <CategorySection key={s.heading} heading={s.heading} articles={s.articles} />)
      )}

      <p className="blog-disclosure">
        Articles are illustrative &mdash; the blog does not have a content backend yet (no article endpoint exists in
        Build Plan Section 4).
      </p>
    </div>
  );
}
