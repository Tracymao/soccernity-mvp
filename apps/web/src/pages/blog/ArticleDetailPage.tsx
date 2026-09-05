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
// BACKEND STATE: there is no blog/article/content module in
// services/api -- see ./blogData.ts's header comment. The article, its
// body, the comment thread and the "Login via" social options are all
// illustrative placeholder content. The comment composer is rendered
// disabled with an explanatory note (there is no comments endpoint, and
// no social-auth flow); the sample comments are captioned as such. This
// mirrors the "render it, but visibly disabled, never faked as working"
// discipline EditProfileModal.tsx applies to its unbacked fields.
import { useParams, Link } from "react-router";
import { findArticle, ARTICLES, SAMPLE_COMMENTS } from "./blogData";
import "./ArticleDetailPage.css";

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
  const article = articleId ? findArticle(articleId) : undefined;

  if (!article) {
    return (
      <div className="article-detail article-detail--missing">
        <h1 className="article-detail__title">Article not found</h1>
        <p className="article-detail__missing-copy">
          That article doesn&rsquo;t exist, or the link is wrong.
        </p>
        <Link to="/blog" className="article-detail__back">
          &larr; Back to Blog
        </Link>
      </div>
    );
  }

  const related = ARTICLES.filter((a) => a.id !== article.id).slice(0, 3);

  return (
    <div className="article-detail">
      <Link to="/blog" className="article-detail__back">
        &larr; Blog
      </Link>

      <h1 className="article-detail__title">{article.title}</h1>

      <p className="article-detail__meta">
        Posted by {article.author} &middot; {article.date} &middot; {article.time}
      </p>

      <div className="article-share" aria-hidden="true">
        <span>Share via:</span>
        <span className="article-share__icon">&#120143;</span>
        <span className="article-share__icon">&#128241;</span>
      </div>

      <div className="article-detail__hero" aria-hidden="true" />

      <div className="article-detail__body">
        {article.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <section className="article-comments" aria-labelledby="article-comments-title">
        <h2 id="article-comments-title" className="article-comments__title">
          Join the discussion
        </h2>
        <p className="article-comments__note">
          Comments aren&rsquo;t available yet &mdash; the blog has no backend (no comments endpoint, no social sign-in).
          The thread below is a sample.
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

      <section className="article-related">
        <h2 className="article-related__title">More Trending News</h2>
        <div className="article-related__grid">
          {related.map((a) => (
            <RelatedCard key={a.id} id={a.id} title={a.title} excerpt={a.excerpt} date={a.date} />
          ))}
        </div>
      </section>
    </div>
  );
}
