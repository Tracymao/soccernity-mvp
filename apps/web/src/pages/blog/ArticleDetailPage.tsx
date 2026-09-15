// Blog -- Article Detail. Figma source: "Blog -- Article Detail Desktop
// -- Logged In" (5997:10905) / "-- Logged Out" (5997:11224) and their
// mobile counterparts (6000:11346 / 6000:11377), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /blog/:articleId. Frame names confirmed
// against the founder's live Figma rename (Decision Log #197 -- the frames
// are "Blog -- Article Detail ...", not "Articles Page ...").
//
// NO LOGIN REQUIRED -- same reasoning as BlogPage: both a Logged In and a
// Logged Out canonical frame exist with identical body content, and the
// shared Header renders the right chrome either way.
//
// REAL DATA (sprint-4/public-blog-articles-feed, services/api/src/
// modules/blog/): GET /articles/:id, no Authorization header. A draft
// article and a genuinely non-existent id both 404 identically -- see
// ../../api/blog.ts's own comment -- so this page cannot distinguish "no
// such article" from "a real but unpublished draft," and renders the
// same not-found state for both. The "More Trending News" strip is a
// small, non-critical fetch of GET /articles' own first page, filtered
// client-side to exclude the current article -- there is no
// exclude-id/related-articles param on that endpoint.
//
// STILL PLACEHOLDER: the article's own body, its title and its category
// are all real; the hero image stays a non-functional placeholder box (no
// Article-to-MediaAsset relation -- see modules/blog/README.md), and the
// comment composer is rendered disabled with an explanatory note (there is
// no comments endpoint anywhere in Section 4, and no social-auth flow) --
// the sample comments are captioned as such. This mirrors the "render it,
// but visibly disabled, never faked as working" discipline
// EditProfileModal.tsx applies to its own unbacked fields.
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { getArticleById, listArticles, BlogApiError, type Article, type ArticleSummary } from "../../api/blog";
import { SAMPLE_COMMENTS } from "./blogData";
import "./ArticleDetailPage.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function bodyParagraphs(body: string): string[] {
  return body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function RelatedCard({ id, title, excerpt, date }: { id: string; title: string; excerpt: string; date: string }) {
  return (
    <Link to={`/blog/${id}`} className="article-related-card">
      <span className="article-related-card__media" aria-hidden="true" />
      <h3 className="article-related-card__title">{title}</h3>
      <p className="article-related-card__excerpt">{excerpt}</p>
      <span className="article-related-card__date">
        <span aria-hidden="true">&#128337;</span>
        {date}
      </span>
    </Link>
  );
}

export default function ArticleDetailPage() {
  const { articleId } = useParams();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<ArticleSummary[]>([]);

  useEffect(() => {
    if (!articleId) {
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    setLoadState("loading");
    setArticle(null);
    setRelated([]);

    (async () => {
      try {
        const result = await getArticleById(articleId);
        if (cancelled) return;
        setArticle(result);
        setLoadState("loaded");

        // Related strip is non-critical -- a failure here never blocks
        // the article itself from rendering.
        try {
          const page = await listArticles();
          if (!cancelled) {
            setRelated(page.items.filter((a) => a.id !== result.id).slice(0, 3));
          }
        } catch {
          // ignore -- the related section simply stays empty
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BlogApiError && err.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loadState === "loading") {
    return (
      <p className="article-detail" role="status">
        Loading article&hellip;
      </p>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="article-detail article-detail--missing">
        <h1 className="article-detail__title">Article not found</h1>
        <p className="article-detail__missing-copy">
          That article doesn&rsquo;t exist, isn&rsquo;t published, or the link is wrong.
        </p>
        <Link to="/blog" className="article-detail__back">
          &larr; Back to Blog
        </Link>
      </div>
    );
  }

  if (loadState === "error" || !article) {
    return (
      <p className="article-detail" role="alert">
        Couldn&rsquo;t load this article. Please try again shortly.
      </p>
    );
  }

  return (
    <div className="article-detail">
      <Link to="/blog" className="article-detail__back">
        &larr; Blog
      </Link>

      <h1 className="article-detail__title">{article.title}</h1>

      <p className="article-detail__meta">
        Posted by {article.author} &middot; {formatDate(article.publishedAt)} &middot; {formatTime(article.publishedAt)}
      </p>

      <div className="article-share" aria-hidden="true">
        <span>Share via:</span>
        <span className="article-share__icon">&#120143;</span>
        <span className="article-share__icon">&#128241;</span>
      </div>

      <div className="article-detail__hero" aria-hidden="true" />

      <div className="article-detail__body">
        {bodyParagraphs(article.body).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <section className="article-comments" aria-labelledby="article-comments-title">
        <h2 id="article-comments-title" className="article-comments__title">
          Join the discussion
        </h2>
        <p className="article-comments__note">
          Comments aren&rsquo;t available yet &mdash; the blog has no comments endpoint or social sign-in flow. The
          thread below is a sample.
        </p>

        <form className="article-comment-form" onSubmit={(e) => e.preventDefault()}>
          <label className="article-comment-form__label" htmlFor="comment-name">
            Name
          </label>
          <input id="comment-name" type="text" disabled />
          <label className="article-comment-form__label" htmlFor="comment-body">
            Comment
          </label>
          <textarea id="comment-body" rows={4} disabled />
          <button type="submit" className="article-comment-form__submit" disabled>
            Comment
          </button>
        </form>

        <ul className="article-comment-list">
          {SAMPLE_COMMENTS.map((c) => (
            <li key={c.id} className="article-comment">
              <span className="article-comment__avatar" aria-hidden="true" />
              <div className="article-comment__body">
                <p className="article-comment__head">
                  <span className="article-comment__author">{c.author}</span>
                  <span className="article-comment__time">&middot; {c.timeAgo}</span>
                </p>
                <p className="article-comment__text">{c.body}</p>
                <p className="article-comment__actions" aria-hidden="true">
                  <span>{c.likes}</span>
                  <span>Like</span>
                  <span>Reply</span>
                  <span>Share</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="article-comments__sample-caption">Sample &mdash; not real comments</p>
      </section>

      {related.length > 0 && (
        <section className="article-related">
          <h2 className="article-related__title">More Trending News</h2>
          <div className="article-related__grid">
            {related.map((a) => (
              <RelatedCard key={a.id} id={a.id} title={a.title} excerpt={a.excerpt} date={formatDate(a.publishedAt)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
