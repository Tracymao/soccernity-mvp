// "Videos from Leaderboard" carousel -- desktop-only region of Community —
// Search & Trending. Figma source: desktop "Search page with trending
// topics" (2876:4628), frame 2896:4770 (title 2896:4719, subtitle 2896:4720,
// 121x175 tiles 2896:4726.., play-circle 2896:4722, views pill 2896:4725).
// SearchTrendingPage.tsx only mounts this on desktop (nothing is fetched on
// mobile -- the mobile frame 5780:8581 has no carousel).
//
// DATA SOURCE (disclosed simplification): no endpoint returns "posts from
// leaderboard users", and GET /search's post results carry no mediaUrls. The
// only web-reachable endpoint that returns Post.mediaUrls is GET
// /posts/feed (the caller's own + followed users' posts), so that is what
// is paged here -- up to MAX_PAGES pages, keeping posts whose mediaUrls
// contain a video (lib/media.ts's extension heuristic). The Figma title is
// kept, but the videos are NOT curated from the Leaderboard; a real
// leaderboard-scoped videos endpoint is a backend follow-up.
//
// VIEW COUNTS ARE REAL: the count shown is Post.viewCount from the server
// (0 renders as "0 views"). A view is recorded ONLY on click-to-play, via
// POST /posts/:id/view -- never on scroll/impression -- and the pill then
// shows the count the server returns. If that call fails the pill keeps the
// last real value; nothing is guessed or incremented locally.
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedApiError, getFeed, recordPostView, type FeedPost } from "../../api/feed";
import { firstVideoUrl } from "../../lib/media";
import { getStoredAccessToken } from "../../lib/session";
import playIcon from "../../assets/icons/play-circle.svg";
import "./VideosCarousel.css";

const MAX_PAGES = 5;
const MAX_VIDEOS = 12;

interface VideoItem {
  postId: string;
  url: string;
  viewCount: number;
  authorName: string;
  caption: string;
}

type LoadState = "loading" | "loaded" | "error";

function viewsLabel(count: number): string {
  return `${count} ${count === 1 ? "view" : "views"}`;
}

function toVideoItem(post: FeedPost): VideoItem | null {
  const url = firstVideoUrl(post.mediaUrls);
  if (!url) return null;
  return {
    postId: post.id,
    url,
    viewCount: post.viewCount,
    authorName: post.author.displayName,
    caption: post.contentText,
  };
}

export default function VideosCarousel() {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<VideoItem | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setItems([]);
      setState("loaded");
      return;
    }
    const id = ++requestId.current;
    setState("loading");
    setError(null);
    try {
      const found: VideoItem[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES && found.length < MAX_VIDEOS; page += 1) {
        const result = await getFeed(token, cursor);
        if (id !== requestId.current) return;
        for (const post of result.items) {
          const item = toVideoItem(post);
          if (item) found.push(item);
        }
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      setItems(found.slice(0, MAX_VIDEOS));
      setState("loaded");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof FeedApiError ? err.message : "Couldn't load videos right now.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback(() => setActive(null), []);

  async function play(item: VideoItem) {
    setActive(item);
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const view = await recordPostView(token, item.postId);
      setItems((prev) => prev.map((v) => (v.postId === view.postId ? { ...v, viewCount: view.viewCount } : v)));
      setActive((prev) => (prev && prev.postId === view.postId ? { ...prev, viewCount: view.viewCount } : prev));
    } catch {
      // Keep the last real count; a failed view call must not invent one.
    }
  }

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  return (
    <section className="videos-card" aria-labelledby="videos-card-title">
      <div className="videos-card__header">
        <h2 id="videos-card-title" className="videos-card__title">
          Videos from Leaderboard
        </h2>
        <p className="videos-card__subtitle">Check out these trending videos</p>
      </div>

      {state === "loading" && (
        <p className="videos-card__status" role="status">
          Loading videos…
        </p>
      )}
      {state === "error" && (
        <p className="videos-card__status" role="alert">
          {error}{" "}
          <button type="button" className="videos-card__retry" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {state === "loaded" && items.length === 0 && (
        <p className="videos-card__status" role="status">
          No videos in your feed yet.
        </p>
      )}

      {state === "loaded" && items.length > 0 && (
        <ul className="videos-card__track">
          {items.map((item) => (
            <li key={item.postId} className="videos-card__item">
              <button
                type="button"
                className="videos-card__tile"
                onClick={() => void play(item)}
                aria-label={`Play video by ${item.authorName}`}
              >
                <video
                  className="videos-card__thumb"
                  src={`${item.url}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  tabIndex={-1}
                />
                <img className="videos-card__play" src={playIcon} alt="" />
                <span className="videos-card__views">{viewsLabel(item.viewCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {active && (
        <div className="videos-modal" onClick={close}>
          <div
            className="videos-modal__card"
            role="dialog"
            aria-modal="true"
            aria-label={`Video by ${active.authorName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="videos-modal__close" onClick={close} aria-label="Close video">
              ×
            </button>
            <video className="videos-modal__video" src={active.url} controls autoPlay playsInline />
            <p className="videos-modal__meta">
              <strong>{active.authorName}</strong> · {viewsLabel(active.viewCount)}
            </p>
            {active.caption && <p className="videos-modal__caption">{active.caption}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
