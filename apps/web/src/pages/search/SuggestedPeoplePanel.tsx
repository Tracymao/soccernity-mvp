// "Suggested" people card -- desktop-only left-rail region of Community --
// Search & Trending. Figma source: desktop "Search page with trending
// topics" (2876:4628) -- card "Group 293" (2876:4744): title 2876:4762,
// refresh icon 2876:4763, three rows (39px avatar 2876:4746-4748, name
// 12px SemiBold, "Follow" pill 51x21 2876:4765/4768/4771), row hairlines
// 2876:4749/4750, "See more" 2876:4751. The mobile frame (5780:8581) has
// no Suggested sidebar, so SearchTrendingPage.tsx only mounts this on
// desktop (nothing is fetched on mobile).
//
// Wired to the real GET /users/suggested (api/users.ts getSuggestedUsers)
// and the existing POST/DELETE /users/:id/follow (followUser /
// unfollowUser) -- no follow logic is reinvented here.
//
// The endpoint returns only { id, displayName }: the Figma frame's
// photo avatars and "@handle" line have no backing data (no avatar or
// username column on `User`, Decision Log #58), so rows render an
// initials avatar and no handle -- nothing is fabricated.
//
// The endpoint has no cursor (a fixed top-N panel), so "See more"
// re-requests a larger `limit`, the same approach TrendsForYou.tsx takes
// for GET /trending. Suggestions are never already-followed users, so each
// row starts as "Follow"; after a follow it stays on screen (as
// "Following", clickable to undo -- both endpoints are idempotent) until
// the next refresh drops it server-side. The caller's own account is
// excluded by the server; `currentUserId` is only a defensive guard
// against a self-follow (400).
import { useCallback, useEffect, useRef, useState } from "react";
import { followUser, getSuggestedUsers, unfollowUser, UsersApiError, type FollowUserSummary } from "../../api/users";
import refreshIcon from "../../assets/icons/trends-refresh.svg";

// Figma shows three rows; "See more" widens to a larger top-N (the server
// caps `limit` at 50).
const INITIAL_LIMIT = 3;
const EXPANDED_LIMIT = 10;

type LoadState = "loading" | "loaded" | "error";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

interface SuggestedRowProps {
  user: FollowUserSummary;
  accessToken: string;
}

function SuggestedRow({ user, accessToken }: SuggestedRowProps) {
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = following ? await unfollowUser(accessToken, user.id) : await followUser(accessToken, user.id);
      setFollowing(result.following);
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Couldn't update that follow.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="suggested-card__row">
      <span className="suggested-card__avatar" aria-hidden="true">
        {initialsFor(user.displayName)}
      </span>
      <span className="suggested-card__name">{user.displayName}</span>
      <button
        type="button"
        className={following ? "suggested-card__follow suggested-card__follow--following" : "suggested-card__follow"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        aria-label={`${following ? "Unfollow" : "Follow"} ${user.displayName}`}
      >
        {pending ? "…" : following ? "Following" : "Follow"}
      </button>
      {error && (
        <p className="suggested-card__row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

interface SuggestedPeoplePanelProps {
  accessToken: string;
  currentUserId?: string | null;
}

export default function SuggestedPeoplePanel({ accessToken, currentUserId }: SuggestedPeoplePanelProps) {
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [items, setItems] = useState<FollowUserSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower response overwriting a newer one
  // (rapid refresh clicks, or refresh racing "See more").
  const requestId = useRef(0);

  const load = useCallback(
    async (nextLimit: number) => {
      const id = ++requestId.current;
      setState((prev) => (prev === "loaded" ? prev : "loading"));
      setError(null);
      try {
        const result = await getSuggestedUsers(accessToken, nextLimit);
        if (id !== requestId.current) return;
        setItems(result.items.filter((u) => u.id !== currentUserId));
        setLimit(nextLimit);
        setState("loaded");
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof UsersApiError ? err.message : "Couldn't load suggestions right now.");
        setState("error");
      }
    },
    [accessToken, currentUserId],
  );

  useEffect(() => {
    load(INITIAL_LIMIT);
  }, [load]);

  // A full page means there may be more beyond it; fewer than requested
  // means the endpoint has already returned everything it will suggest.
  const canSeeMore = state === "loaded" && limit === INITIAL_LIMIT && items.length >= INITIAL_LIMIT;

  return (
    <section className="trends-card" aria-labelledby="suggested-people-title">
      <header className="trends-card__header">
        <h2 id="suggested-people-title" className="trends-card__title">
          Suggested
        </h2>
        <button
          type="button"
          className="trends-card__refresh"
          aria-label="Refresh suggestions"
          onClick={() => load(limit)}
        >
          <img src={refreshIcon} alt="" width={24} height={24} />
        </button>
      </header>

      {state === "loading" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          Loading suggestions…
        </p>
      )}

      {state === "error" && (
        <p className="trends-card__status trends-card__status--error" role="alert">
          {error}
        </p>
      )}

      {state === "loaded" && items.length === 0 && (
        <p className="trends-card__status" role="status">
          No suggestions right now.
        </p>
      )}

      {items.length > 0 && (
        <ul className="trends-card__list">
          {items.map((user) => (
            <SuggestedRow key={user.id} user={user} accessToken={accessToken} />
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
