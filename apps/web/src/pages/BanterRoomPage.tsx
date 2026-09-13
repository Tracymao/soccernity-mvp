// Banter Room -- a single room's feed + posting. Route: /banter/:roomId.
//
// NO Figma frame exists for this screen -- the Bants frames this file's
// sibling BanterPage.tsx converts (2256:6802 / 2448:2179) only ever show
// the room LIST, never a room's own feed. Built plain and flagged, same
// "no dedicated screen exists" precedent ClubFanPage.tsx / EditProfileModal
// established for their own unbacked corners -- necessary because
// join/leave and posting-in-a-room (BanterModule, Decision Log #275/#276)
// need somewhere to actually happen once api/banter.ts exists.
//
// Real data (Build Plan Section 4.4):
//   - GET /banter-rooms/:id        -- name, scope, member count, joined
//   - GET /banter-rooms/:id/posts  -- the room feed, identical
//     FeedPage/FeedPostWithViewerState shape to GET /posts/feed
//     (delegates server-side to FeedService.getBanterRoomFeed) -- rendered
//     with the same, reused PostCard.tsx as Community/Club Fan Page, real
//     like/comment/save/follow.
//   - one Join / Leave button      (BanterJoinButton)
//   - a plain composer -> POST /banter-rooms/:id/posts, contentText only.
//     REQUIRES membership -- a non-member gets a 403 ("You must join this
//     Banter Room before posting in it"), rendered as a "Join to post"
//     prompt instead of a broken form, not a raw error.
//
// Feed loads independently of the room header (a failure shows a soft
// in-section message, matching ClubFanPage.tsx). A missing / 404 room
// renders an honest "Room not found" state with a link back to /banter.
// GET /banter-rooms/:id is JwtAuthGuard-only; a no-session visit shows a
// "log in" prompt and never calls the API.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  getRoomById,
  getRoomFeed,
  postToRoom,
  BanterApiError,
  type BanterRoom,
  type BanterRoomScopeType,
} from "../api/banter";
import type { FeedPost } from "../api/feed";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import BanterJoinButton from "./banter/BanterJoinButton";
import PostCard from "./community/PostCard";
import "./banter/BanterPage.css";
import "./banter/BanterRoomPage.css";
import "./community/CommunityPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";
type SectionState = "loading" | "loaded" | "error";

const MAX_LENGTH = 3000;

const SCOPE_LABELS: Record<BanterRoomScopeType, string> = {
  club: "Club",
  league: "League",
  country: "Country",
  topic: "Topic",
};

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

export default function BanterRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [room, setRoom] = useState<BanterRoom | null>(null);

  const [feedState, setFeedState] = useState<SectionState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    if (!roomId) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");

    let roomResult: BanterRoom;
    try {
      roomResult = await getRoomById(token, roomId);
    } catch (err) {
      setLoadState(err instanceof BanterApiError && err.status === 404 ? "not-found" : "error");
      return;
    }
    setRoom(roomResult);
    setLoadState("loaded");

    setFeedState("loading");
    try {
      const page = await getRoomFeed(token, roomId);
      setPosts(page.items);
      setFeedCursor(page.nextCursor);
      setFeedState("loaded");
    } catch {
      setFeedState("error");
    }
  }, [token, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMorePosts() {
    if (!token || !roomId || !feedCursor || feedLoadingMore) return;
    setFeedLoadingMore(true);
    try {
      const page = await getRoomFeed(token, roomId, feedCursor);
      setPosts((prev) => [...prev, ...page.items]);
      setFeedCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setFeedLoadingMore(false);
    }
  }

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!token || !roomId || posting) return;
    const contentText = draft.trim();
    if (!contentText) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await postToRoom(token, roomId, { contentText });
      // POST /banter-rooms/:id/posts (like POST /posts) doesn't return the
      // per-caller viewer-state fields (Decision Log #153) -- for a post
      // you just created they're all deterministically false.
      setPosts((prev) => [
        { ...created, isLiked: false, isSaved: false, author: { ...created.author, isFollowing: false } },
        ...prev,
      ]);
      setDraft("");
    } catch (err) {
      setPostError(err instanceof BanterApiError ? err.message : "Couldn't post in this room.");
    } finally {
      setPosting(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="banter-status" role="status">
        Log in to view this room. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="banter-room-page">
        <p className="banter-status" role="status">
          Loading room…
        </p>
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="banter-room-page">
        <Link to="/banter" className="banter-room-page__back">
          ← Bants
        </Link>
        <p className="banter-status" role="status">
          Room not found. <Link to="/banter">Back to all rooms</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !room) {
    return (
      <div className="banter-room-page">
        <Link to="/banter" className="banter-room-page__back">
          ← Bants
        </Link>
        <p className="banter-status" role="alert">
          Couldn&rsquo;t load this room. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="banter-room-page">
      <Link to="/banter" className="banter-room-page__back">
        ← Bants
      </Link>

      <div className="banter-room-page__identity">
        <span className="banter-room-page__avatar" aria-hidden="true">
          {room.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="banter-room-page__text">
          <h1 className="banter-room-page__name">{room.name}</h1>
          <p className="banter-room-page__meta">
            {SCOPE_LABELS[room.scopeType]} &middot; {memberLine(room.memberCount)}
          </p>
        </div>
      </div>

      <BanterJoinButton
        accessToken={token!}
        roomId={room.id}
        joined={room.joined}
        onToggled={(next) => setRoom((prev) => (prev ? { ...prev, joined: next.joined, memberCount: next.memberCount } : prev))}
        className="banter-join--block"
      />

      <hr className="banter-room-page__divider" />

      <section className="banter-room-page__section" aria-labelledby="banter-room-feed-title">
        <h2 id="banter-room-feed-title" className="banter-room-page__section-title">
          Room feed
        </h2>

        {room.joined ? (
          <form className="banter-room-composer" onSubmit={handlePost}>
            <textarea
              className="banter-room-composer__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Say something to ${room.name}…`}
              maxLength={MAX_LENGTH}
              rows={3}
            />
            <div className="banter-room-composer__row">
              <button
                type="button"
                className="banter-room-composer__attach"
                disabled
                title="Attaching photos or videos isn't wired up yet"
              >
                Attach photo/video
              </button>
              <button type="submit" className="banter-room-composer__submit" disabled={posting || !draft.trim()}>
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
            {postError && (
              <p className="banter-room-composer__error" role="alert">
                {postError}
              </p>
            )}
          </form>
        ) : (
          <p className="banter-status banter-status--inline" role="status">
            Join this room to post in it.
          </p>
        )}

        {feedState === "loading" && (
          <p className="banter-status" role="status">
            Loading posts…
          </p>
        )}
        {feedState === "error" && (
          <p className="banter-status" role="alert">
            Couldn&rsquo;t load this room&rsquo;s posts.
          </p>
        )}
        {feedState === "loaded" && posts.length === 0 && (
          <p className="banter-status" role="status">
            No posts in this room yet.
          </p>
        )}
        {feedState === "loaded" && token && decoded && (
          <div className="banter-room-page__feed">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} accessToken={token} currentUserId={decoded.sub} />
            ))}
          </div>
        )}
        {feedCursor && feedState === "loaded" && (
          <button type="button" className="banter-load-more" onClick={loadMorePosts} disabled={feedLoadingMore}>
            {feedLoadingMore ? "Loading…" : "Load more posts"}
          </button>
        )}
      </section>
    </div>
  );
}
