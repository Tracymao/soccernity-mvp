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
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  addComment,
  FeedApiError,
  getComments,
  likePost,
  recordViewHeartbeat,
  savePost,
  setCommentHidden,
  unlikePost,
  unsavePost,
  type CommentPermission,
  type FeedComment,
  type FeedPost,
} from "../../api/feed";
import { followUser, unfollowUser, UsersApiError } from "../../api/users";
import PostMedia from "./PostMedia";
import { useViewHeartbeat } from "../../lib/useViewHeartbeat";
import OwnPostMenu from "./OwnPostMenu";
import ReportAction from "./ReportAction";

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
  /** Called after the author hard-deletes the post. The card also removes itself. */
  onDeleted?: (postId: string) => void;
  /**
   * A final contest entry before the reveal: all engagement is locked (the server refuses a like,
   * comment or save with `contest_final_locked`, even from the author), so the controls are drawn
   * disabled, the counts are hidden and a note says why (Decision Log #404 item 15; Figma 6707:26727
   * / 6709:26922). The server stays the source of truth; this only stops offering what it refuses.
   */
  engagementLocked?: boolean;
  /** The standalone entry page opens the comment thread straight away (Figma 6836:29397). */
  initialCommentsOpen?: boolean;
  /** Show video media as a player instead of a bare link (the standalone entry page). */
  playVideo?: boolean;
}

export default function PostCard({
  post,
  accessToken,
  currentUserId,
  onDeleted,
  engagementLocked = false,
  initialCommentsOpen = false,
  playVideo = false,
}: PostCardProps) {
  const [deleted, setDeleted] = useState(false);
  const [commentPermission, setCommentPermission] = useState<CommentPermission>(post.commentPermission ?? "everyone");
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
  const autoOpened = useRef(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentRestricted, setCommentRestricted] = useState(false);

  // The post author hides/unhides individual comments. A hidden comment
  // stays in their list (dimmed) and stops counting toward the total.
  async function toggleHidden(c: FeedComment) {
    setCommentError(null);
    try {
      const next = !c.hidden;
      await setCommentHidden(accessToken, post.id, c.id, next);
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, hidden: next } : x)));
      setCommentCount((n) => Math.max(0, n + (next ? -1 : 1)));
    } catch (err) {
      setCommentError(err instanceof FeedApiError ? err.message : "Couldn't update that comment.");
    }
  }

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
      if (err instanceof FeedApiError && err.status === 403 && /guardian consent/i.test(err.message)) {
        setCommentRestricted(true);
      } else {
        setCommentError(err instanceof FeedApiError ? err.message : "Couldn't add that comment.");
      }
    } finally {
      setCommentSubmitting(false);
    }
  }

  useEffect(() => {
    if (initialCommentsOpen && !engagementLocked && !autoOpened.current) {
      autoOpened.current = true;
      void openComments();
    }
    // openComments is stable enough for a one-shot open on mount.
  }, [initialCommentsOpen, engagementLocked]);

  // View qualification (B-093): while this post is on screen the client reports that it is active, and
  // the server decides what counts. Not for the viewer's own post (self-engagement earns nothing) or a
  // locked final entry; and only a real player counts for a video (see lib/useViewHeartbeat).
  useViewHeartbeat(articleRef, {
    enabled: !deleted && !isOwnPost && !engagementLocked,
    hasVideo: post.media.some((m) => m.kind === "video"),
    send: (beat) => recordViewHeartbeat(accessToken, post.id, beat),
  });

  if (deleted) return null;

  return (
    <article className="post" ref={articleRef}>
      <div className="post__head">
        <div className="post__avatar" aria-hidden="true">
          {initialsFor(post.author.publicName)}
        </div>
        <div className="post__identity">
          {isOwnPost ? (
            <span className="post__author">{post.author.publicName}</span>
          ) : (
            // Opens their profile (B-082). A viewer a Block hides this author from
            // never sees the post at all, so the link never leads to a surprise.
            <Link to={`/users/${post.authorId}`} className="post__author post__author--link">
              {post.author.publicName}
            </Link>
          )}
          <span className="post__time">{relativeTime(post.createdAt)}</span>
          {post.contest && (
            <span className="post__contest-label" title="This post is a Contest entry">
              {post.contest.label}
            </span>
          )}
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
        {isOwnPost && (
          <div className="post__report">
            <OwnPostMenu
              accessToken={accessToken}
              postId={post.id}
              commentPermission={commentPermission}
              onCommentPermissionChange={setCommentPermission}
              onDeleted={() => {
                setDeleted(true);
                onDeleted?.(post.id);
              }}
            />
          </div>
        )}
        {!isOwnPost && (
          <div className="post__report">
            <ReportAction
              accessToken={accessToken}
              triggerLabel="Report"
              targets={[
                { label: "Report post", targetType: "post", targetId: post.id },
                { label: "Report user", targetType: "user", targetId: post.authorId },
              ]}
            />
          </div>
        )}
      </div>

      <p className="post__body">{post.contentText}</p>

      <PostMedia media={post.media} urls={post.mediaUrls} accessToken={accessToken} isOwn={isOwnPost} playVideo={playVideo} />

      {post.clubPageId && <p className="post__context">Posted to a club page</p>}
      {post.banterRoomId && <p className="post__context">Posted in a Banter Room</p>}

      {engagementLocked ? (
        <>
          <p className="post__locked" role="status" data-testid="engagement-locked">
            Engagement is locked until the reveal. Only you can see this entry until then. [COPY PENDING LEGAL REVIEW]
          </p>
          <div className="post__actions post__actions--locked">
            <button type="button" className="post__action" disabled aria-label="Comments (locked until the reveal)">
              &#128172;
            </button>
            <button type="button" className="post__action" disabled aria-label="Like (locked until the reveal)">
              &#9829;
            </button>
            <button type="button" className="post__action" disabled aria-label="Save (locked until the reveal)">
              &#128278;
            </button>
          </div>
        </>
      ) : (
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
      )}

      {actionError && (
        <p className="post__error" role="alert">
          {actionError}
        </p>
      )}

      {commentsOpen && (
        <div className="comments">
          {comments.map((c) => (
            <div key={c.id} className={c.hidden ? "comment comment--hidden" : "comment"} style={c.hidden ? { opacity: 0.6 } : undefined}>
              <span className="comment__author">
                {c.author.publicName}
                <span className="comment__time">{relativeTime(c.createdAt)}</span>
              </span>
              <p className="comment__body">{c.contentText}</p>
              {c.hidden && (
                <p className="composer__note">
                  {isOwnPost ? "Hidden — only you and the commenter can see this." : "Hidden by the post author — only you can see this."}
                </p>
              )}
              {isOwnPost && (
                <button type="button" className="report-action__trigger" onClick={() => toggleHidden(c)}>
                  {c.hidden ? "Unhide" : "Hide"}
                </button>
              )}
              {c.authorId !== currentUserId && (
                <ReportAction
                  accessToken={accessToken}
                  targets={[{ label: "Report comment", targetType: "comment", targetId: c.id }]}
                  triggerLabel="Report"
                />
              )}
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
          {commentPermission === "off" && (
            <p className="composer__note">Comments are turned off for this post.</p>
          )}
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
