// A single feed post, with its real like / comment / save / follow
// actions wired to Build Plan Section 4.3 (Feed) and 4.2 (Follow).
//
// The like / save / follow controls initialise from the real per-caller
// viewer-state the API returns on every post -- post.isLiked,
// post.isSaved, post.author.isFollowing (Decision Log #153, services/api
// PR #136). After the user acts in-session, the toggle endpoint's
// response (or, for follow, the known resulting state) keeps local
// component state in sync. The like/save endpoints are idempotent
// (feed.service.ts), so a redundant "re-like" is harmless; likeCount is
// always taken fresh from the server response, never re-derived
// client-side.
//
// (Historical note: PR #135 shipped this component before #136 existed,
// with these three hardcoded to false on mount and a documented
// session-local workaround. This is the follow-up #153 called out as
// "the separate follow-up this unblocks".)
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  addComment,
  FeedApiError,
  getComments,
  likePost,
  savePost,
  unlikePost,
  unsavePost,
  type FeedComment,
  type FeedPost,
} from "../../api/feed";
import { followUser, unfollowUser, UsersApiError } from "../../api/users";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface PostCardProps {
  post: FeedPost;
  accessToken: string;
  currentUserId: string;
}

export default function PostCard({ post, accessToken, currentUserId }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.isSaved);
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isOwnPost = post.authorId === currentUserId;
  const [following, setFollowing] = useState(post.author.isFollowing);
  const [followPending, setFollowPending] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentRestricted, setCommentRestricted] = useState(false);

  async function toggleLike() {
    if (likePending) return;
    setLikePending(true);
    setActionError(null);
    try {
      const result = liked ? await unlikePost(accessToken, post.id) : await likePost(accessToken, post.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (err) {
      setActionError(err instanceof FeedApiError ? err.message : "Something went wrong.");
    } finally {
      setLikePending(false);
    }
  }

  async function toggleSave() {
    if (savePending) return;
    setSavePending(true);
    setActionError(null);
    try {
      const result = saved ? await unsavePost(accessToken, post.id) : await savePost(accessToken, post.id);
      setSaved(result.saved);
    } catch (err) {
      setActionError(err instanceof FeedApiError ? err.message : "Something went wrong.");
    } finally {
      setSavePending(false);
    }
  }

  async function toggleFollow() {
    if (followPending) return;
    setFollowPending(true);
    setActionError(null);
    try {
      const result = following
        ? await unfollowUser(accessToken, post.authorId)
        : await followUser(accessToken, post.authorId);
      setFollowing(result.following);
    } catch (err) {
      setActionError(err instanceof UsersApiError ? err.message : "Something went wrong.");
    } finally {
      setFollowPending(false);
    }
  }

  async function openComments() {
    setCommentsOpen(true);
    if (comments.length > 0 || commentsLoading) return;
    setCommentsLoading(true);
    try {
      const page = await getComments(accessToken, post.id);
      setComments(page.items);
      setCommentCursor(page.nextCursor);
    } catch (err) {
      setCommentError(err instanceof FeedApiError ? err.message : "Couldn't load comments.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function loadMoreComments() {
    if (!commentCursor || commentsLoading) return;
    setCommentsLoading(true);
    try {
      const page = await getComments(accessToken, post.id, commentCursor);
      setComments((prev) => [...prev, ...page.items]);
      setCommentCursor(page.nextCursor);
    } catch (err) {
      setCommentError(err instanceof FeedApiError ? err.message : "Couldn't load more comments.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body || commentSubmitting) return;
    setCommentSubmitting(true);
    setCommentError(null);
    setCommentRestricted(false);
    try {
      const created = await addComment(accessToken, post.id, body);
      // GET /posts/:id/comments is oldest-first, so a new comment appends.
      setComments((prev) => [...prev, created]);
      setCommentCount((n) => n + 1);
      setCommentText("");
    } catch (err) {
      if (err instanceof FeedApiError && err.status === 403) {
        setCommentRestricted(true);
      } else {
        setCommentError(err instanceof FeedApiError ? err.message : "Couldn't add that comment.");
      }
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <article className="post">
      <div className="post__head">
        <div className="post__avatar" aria-hidden="true">
          {initialsFor(post.author.displayName)}
        </div>
        <div className="post__identity">
          <span className="post__author">{post.author.displayName}</span>
          <span className="post__time">{relativeTime(post.createdAt)}</span>
        </div>
        {!isOwnPost && (
          <button
            type="button"
            className={following ? "post__follow post__follow--following" : "post__follow"}
            onClick={toggleFollow}
            disabled={followPending}
          >
            {following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      <p className="post__body">{post.contentText}</p>

      {post.mediaUrls.length > 0 && (
        <div className="post__media">
          {post.mediaUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener">
              {url}
            </a>
          ))}
        </div>
      )}

      {post.clubPageId && <p className="post__context">Posted to a club page</p>}
      {post.banterRoomId && <p className="post__context">Posted in a Banter Room</p>}

      <div className="post__actions">
        <button
          type="button"
          className={liked ? "post__action post__action--active" : "post__action"}
          onClick={toggleLike}
          disabled={likePending}
          aria-pressed={liked}
        >
          &#9829; {likeCount} {likeCount === 1 ? "like" : "likes"}
        </button>
        <button
          type="button"
          className="post__action"
          onClick={() => (commentsOpen ? setCommentsOpen(false) : openComments())}
          aria-expanded={commentsOpen}
        >
          &#128172; {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </button>
        <button
          type="button"
          className={saved ? "post__action post__action--active" : "post__action"}
          onClick={toggleSave}
          disabled={savePending}
          aria-pressed={saved}
        >
          &#128278; {saved ? "Saved" : "Save"}
        </button>
      </div>

      {actionError && (
        <p className="post__error" role="alert">
          {actionError}
        </p>
      )}

      {commentsOpen && (
        <div className="comments">
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <span className="comment__author">
                {c.author.displayName}
                <span className="comment__time">{relativeTime(c.createdAt)}</span>
              </span>
              <p className="comment__body">{c.contentText}</p>
            </div>
          ))}
          {commentsLoading && <p className="community-status">Loading comments…</p>}
          {!commentsLoading && comments.length === 0 && !commentError && (
            <p className="composer__note">No comments yet. Be the first.</p>
          )}
          {commentCursor && !commentsLoading && (
            <button type="button" className="comments__more" onClick={loadMoreComments}>
              Load more comments
            </button>
          )}
          {commentError && (
            <p className="post__error" role="alert">
              {commentError}
            </p>
          )}

          <form className="comment-form" onSubmit={submitComment}>
            <input
              className="comment-form__input"
              placeholder="Write a comment…"
              aria-label="Write a comment"
              value={commentText}
              maxLength={3000}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button type="submit" className="comment-form__submit" disabled={!commentText.trim() || commentSubmitting}>
              {commentSubmitting ? "…" : "Reply"}
            </button>
          </form>
          {commentRestricted && (
            <p className="post__error" role="alert">
              Your account is restricted pending guardian consent, so you can&rsquo;t comment yet.{" "}
              <Link to="/guardian-consent">Check your consent status</Link>.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
