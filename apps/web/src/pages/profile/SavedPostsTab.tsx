// The "Saved" tab of the OWN profile (build-register B-064, Decision Log #378 and #22; Figma
// 6747:29445 desktop / 5778:8567 mobile, which replace the archived 1460:8940). It lists the posts the
// signed-in person saved, most recently saved first, as the same post cards the feed uses.
//
// Data: GET /users/:id/saved-posts, which the server only answers for the caller's own id (403
// otherwise), so ProfilePage is the only place this is mounted and other people's profiles never
// show the tab. The server already leaves out a post that was deleted, hidden or blocked since it
// was saved, so a page never contains a broken card.
//
// Frame vs endpoint, reported not worked around: the saved-posts payload carries no per-caller
// `isLiked` and no `author.isFollowing` (Decision Log #153 enriched only GET /posts/feed and GET
// /posts/:id). `isSaved` is true by definition. The other two start as "not liked" and "not
// followed" here, so a post the person already liked shows the Like button un-pressed until they act
// (both calls are idempotent and the like count always comes from the server). A server change
// would fix it; it is out of scope for this tab.
//
// States the frames do not draw (they show only a filled list) are plain text in the profile's
// existing empty-state style: loading, empty, load error with a retry, and a load-more error that
// keeps the list on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { getSavedPosts, type FeedPost, type SavedPostEntry } from "../../api/feed";
import PostCard from "../community/PostCard";
import "../community/CommunityPage.css";

type LoadState = "loading" | "loaded" | "error";

interface Props {
  accessToken: string;
  userId: string;
}

function toFeedPost(entry: SavedPostEntry): FeedPost {
  const { post } = entry;
  return {
    ...post,
    isSaved: true,
    isLiked: false,
    author: { ...post.author, isFollowing: false },
  };
}

export default function SavedPostsTab({ accessToken, userId }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Ignores an answer that arrives after the tab was left or a newer request started.
  const requestId = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current;
    setState("loading");
    setMoreError(null);
    try {
      const page = await getSavedPosts(accessToken, userId);
      if (id !== requestId.current) return;
      setPosts(page.items.map(toFeedPost));
      setCursor(page.nextCursor);
      setState("loaded");
    } catch {
      if (id !== requestId.current) return;
      setState("error");
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      requestId.current++;
    };
  }, [loadFirstPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await getSavedPosts(accessToken, userId, cursor);
      if (id !== requestId.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.map(toFeedPost).filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      if (id !== requestId.current) return;
      setMoreError("Couldn’t load more saved posts.");
    } finally {
      setLoadingMore(false);
    }
  }

  function removePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  if (state === "loading") {
    return (
      <p className="profile-empty-state" role="status">
        Loading your saved posts…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div className="profile-empty-state" role="alert">
        <p>Couldn&rsquo;t load your saved posts.</p>
        <button type="button" className="profile-load-more" onClick={() => void loadFirstPage()}>
          Try again
        </button>
      </div>
    );
  }

  if (posts.length === 0 && !cursor) {
    return (
      <p className="profile-empty-state" role="status">
        You haven&rsquo;t saved any posts yet. Use Save on a post to keep it here.
      </p>
    );
  }

  return (
    <div className="profile-saved">
      <div className="profile-saved__list">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            accessToken={accessToken}
            currentUserId={userId}
            onDeleted={removePost}
            onSavedChange={(postId, saved) => {
              if (!saved) removePost(postId);
            }}
          />
        ))}
      </div>
      {moreError && (
        <p className="profile-status-message profile-status-message--error" role="alert">
          {moreError}
        </p>
      )}
      {cursor && (
        <button type="button" className="profile-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
