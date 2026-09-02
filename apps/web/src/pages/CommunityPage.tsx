// Community -- the authenticated feed. This is the destination a
// logged-in user lands on (Decision Log #152 routes signed-in visitors
// here from "/"), and the screen Build Plan Section 6's Sprint 2
// done-when criterion is measured against: "a user can post, follow
// another user or club, like/comment, and save a post, all reflected
// correctly on refresh."
//
// Figma source: "Community Home Page Template" (COMPONENT_SET 1306:7149),
// variant "Desktop - 6" (1306:7148). The template is a three-column
// social layout. Only the CENTRE column (composer + feed) is wired to
// real data:
//   - Composer  -> POST /posts                     (api/feed.ts)
//   - Feed      -> GET  /posts/feed                 (api/feed.ts)
//   - per post  -> like/unlike, save/unsave,
//                  comments (GET/POST), follow author (api/feed.ts + api/users.ts)
//
// The left "Trends" rail and the right "Who to follow" / "Trending News"
// rails have NO backing endpoint anywhere in Build Plan Section 4 (no
// trending, fixtures, or suggested-users endpoint exists -- Section 4.2
// defines only follow / followers / following). They render illustrative
// sample content, clearly captioned "Sample", rather than being faked as
// live or wired to an invented algorithm -- the same discipline
// ProfilePage.tsx applies to its own unbacked Posts/Media tabs.
//
// No-session handling mirrors ProfilePage.tsx: a visit with no stored
// access token renders an explicit "log in to see your feed" prompt and
// never calls the API, rather than a blank page or a thrown error.
// Session is read directly via src/lib/session.ts (no AuthContext exists
// yet -- see that file's header comment).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { getFeed, FeedApiError, type FeedPost } from "../api/feed";
import { getUser, type UserProfile } from "../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import PostCard from "./community/PostCard";
import PostComposer from "./community/PostComposer";
import "./community/CommunityPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

// Hardcoded sample content for the side rails -- no endpoint backs any of
// it (see this file's header comment). Kept close to Figma frame
// 1306:7148's own placeholder content.
const SAMPLE_TRENDS = [
  { topic: "#ChelseaVsArsenal", meta: "2,500 posts" },
  { topic: "Manchester United", meta: "2,325 posts" },
  { topic: "Alex Ferguson", meta: "1,856 posts" },
  { topic: "#NPFL", meta: "1,213 posts" },
  { topic: "#Europa", meta: "998 posts" },
];

const SAMPLE_SUGGESTIONS = [
  { name: "Emeka John", handle: "@mekusa" },
  { name: "Abdul Yusuf", handle: "@naijamessi" },
  { name: "Chukwu James", handle: "@nicekidzz" },
];

const SAMPLE_NEWS = [
  "Kane joins the 250 club after heading Spurs past Wolves",
  "Arsenal's title push tested by a resurgent Newcastle",
  "Grassroots cup final draws a record crowd in Surulere",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function CommunityPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const loadFeed = useCallback(async () => {
    if (!token || !decoded) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const page = await getFeed(token);
      setPosts(page.items);
      setCursor(page.nextCursor);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
    // The composer needs the caller's display name for its avatar; a
    // failure here must not block the feed, so it's a separate, swallowed
    // call rather than part of the load path above.
    try {
      if (token && decoded) setProfile(await getUser(token, decoded.sub));
    } catch {
      /* non-fatal -- composer falls back to a generic avatar */
    }
  }, [token, decoded?.sub]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFeed(token, cursor);
      setPosts((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      // Keep what we have; surface nothing louder than a console note --
      // the "Load more" button stays and can be retried.
      if (!(err instanceof FeedApiError)) throw err;
    } finally {
      setLoadingMore(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="community-status" role="status">
        Log in to see your Community feed. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const leftRail = (
    <div className="community__left">
      <div className="community-aside">
        <p className="community-aside__title">Trends for you</p>
        <p className="community-aside__note">Sample &mdash; not yet personalised</p>
        {SAMPLE_TRENDS.map((t) => (
          <div key={t.topic} className="community-trend">
            <span className="community-trend__topic">{t.topic}</span>
            <span className="community-trend__meta">{t.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const rightRail = (
    <div className="community__right">
      <div className="community-aside">
        <p className="community-aside__title">Who to follow</p>
        <p className="community-aside__note">Sample &mdash; no suggestions endpoint yet</p>
        {SAMPLE_SUGGESTIONS.map((s) => (
          <div key={s.handle} className="community-suggest">
            <span className="community-suggest__avatar" aria-hidden="true">
              {initialsFor(s.name)}
            </span>
            <span className="community-suggest__text">
              <span className="community-suggest__name">{s.name}</span>
              <span className="community-suggest__handle">{s.handle}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="community-aside">
        <p className="community-aside__title">Trending News</p>
        <p className="community-aside__note">Sample &mdash; no news endpoint yet</p>
        {SAMPLE_NEWS.map((headline) => (
          <div key={headline} className="community-trend">
            <span className="community-trend__topic">{headline}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="community">
      {leftRail}

      <div className="community__center">
        {token && (
          <PostComposer
            accessToken={token}
            authorName={profile?.displayName ?? "You"}
            onCreated={(post) =>
              // POST /posts doesn't return the per-caller viewer-state
              // fields (Decision Log #153); for a post you just created
              // they're all deterministically false.
              setPosts((prev) => [
                { ...post, isLiked: false, isSaved: false, author: { ...post.author, isFollowing: false } },
                ...prev,
              ])
            }
          />
        )}

        {loadState === "loading" && (
          <div className="community-status" role="status">
            Loading your feed…
          </div>
        )}

        {loadState === "error" && (
          <div className="community-status community-status--error" role="alert">
            Couldn&rsquo;t load your feed. Please try again shortly.
          </div>
        )}

        {loadState === "loaded" && posts.length === 0 && (
          <div className="community-status" role="status">
            Your feed is quiet. Post something above, or follow players and clubs to see their posts here.
          </div>
        )}

        {loadState === "loaded" &&
          token &&
          decoded &&
          posts.map((post) => (
            <PostCard key={post.id} post={post} accessToken={token} currentUserId={decoded.sub} />
          ))}

        {cursor && loadState === "loaded" && (
          <button type="button" className="comments__more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more posts"}
          </button>
        )}
      </div>

      {rightRail}
    </div>
  );
}
