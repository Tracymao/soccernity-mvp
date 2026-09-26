// "Trends for you" sidebar card -- desktop-only right-rail region of
// Community — Search & Trending. Figma source: desktop "Search page with
// trending topics" (2876:4628) -- title 2876:4652, rows 2876:4654-4667,
// refresh icon 2876:4668, three-dots icons 2876:4730-4742, "See more"
// 2876:4711, card background 2876:4647. The mobile frame (5780:8581) has
// no trends sidebar, so SearchTrendingPage.tsx only mounts this on
// desktop (nothing is fetched on mobile).
//
// Wired to the real, public GET /trending (api/trending.ts). The endpoint
// returns hashtags only ({ tag, postCount, score }), so each row is
// "#tag" + "N Posts" -- the Figma frame's non-hashtag sample rows
// ("Ronaldo", "Manchester United") have no backing data and are not
// fabricated.
//
// Controls that DO have backing behaviour are live: the refresh icon
// re-fetches, and "See more" re-requests a larger top-N (GET /trending has
// no cursor -- see api/trending.ts). The per-row three-dots icon has no
// backing action anywhere (no mute/hide-hashtag endpoint exists, per
// search/README.md), so it renders visibly disabled rather than as a
// working menu -- the same "shown, disabled, never faked" discipline
// PrivacySettingsPage.tsx and EditProfileModal.tsx use.
import { useCallback, useEffect, useRef, useState } from "react";
import { getTrending, TrendingApiError, type TrendingHashtag } from "../../api/trending";
import refreshIcon from "../../assets/icons/trends-refresh.svg";
import moreIcon from "../../assets/icons/trends-more.svg";

// Figma shows seven rows; "See more" widens to a larger top-N (the server
// caps `limit` at 50).
const INITIAL_LIMIT = 7;
const EXPANDED_LIMIT = 20;

type LoadState = "loading" | "loaded" | "error";

function postsLabel(count: number): string {
  return `${count} ${count === 1 ? "Post" : "Posts"}`;
}

export default function TrendsForYou() {
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [items, setItems] = useState<TrendingHashtag[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower response overwriting a newer one
  // (rapid refresh clicks, or refresh racing "See more").
  const requestId = useRef(0);

  const load = useCallback(async (nextLimit: number) => {
    const id = ++requestId.current;
    setState((prev) => (prev === "loaded" ? prev : "loading"));
    setError(null);
    try {
      const result = await getTrending(nextLimit);
      if (id !== requestId.current) return;
      setItems(result.items);
      setLimit(nextLimit);
      setState("loaded");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof TrendingApiError ? err.message : "Couldn't load trends right now.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(INITIAL_LIMIT);
  }, [load]);

  // A full page means there may be more beyond it; fewer than requested
  // means the endpoint has already returned everything in the window.
  const canSeeMore = state === "loaded" && limit === INITIAL_LIMIT && items.length >= INITIAL_LIMIT;

  return (
    <section className="trends-card" aria-labelledby="trends-for-you-title">
      <header className="trends-card__header">
        <h2 id="trends-for-you-title" className="trends-card__title">
          Trends for you
        </h2>
        <button
          type="button"
          className="trends-card__refresh"
          aria-label="Refresh trends"
          onClick={() => load(limit)}
        >
          <img src={refreshIcon} alt="" width={24} height={24} />
        </button>
      </header>

      {state === "loading" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          Loading trends…
        </p>
      )}

      {state === "error" && (
        <p className="trends-card__status trends-card__status--error" role="alert">
          {error}
        </p>
      )}

      {state === "loaded" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          No trends yet.
        </p>
      )}

      {items.length > 0 && (
        <ul className="trends-card__list">
          {items.map((item) => (
            <li key={item.tag} className="trends-card__row">
              <div className="trends-card__row-text">
                <span className="trends-card__name">#{item.tag}</span>
                <span className="trends-card__count">{postsLabel(item.postCount)}</span>
              </div>
              <button
                type="button"
                className="trends-card__more"
                disabled
                aria-label={`More options for #${item.tag} (not available yet)`}
                title="Not available yet"
              >
                <img src={moreIcon} alt="" width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canSeeMore && (
        <button type="button" className="trends-card__see-more" onClick={() => load(EXPANDED_LIMIT)}>
          See more
        </button>
      )}
    </section>
  );
}
