// Club picker -- rendered from RegisterStep's success view, after a real
// account (and therefore a real access token) exists. See this branch's
// PR description for the full "why here, not inside the unauthenticated
// part of the signup flow" reasoning: GET /clubs is JwtAuthGuard-only
// (services/api/src/modules/clubs/clubs.controller.ts), and nothing
// before account creation has a JWT to call it with.
//
// No dedicated Figma screen exists for this step -- flagged as a real
// design gap, not something to invent design language for unilaterally.
// Built plain, matching SignupSplitScreen's existing light-theme visual
// style (same --signup-* tokens, same signup-form-ish spacing) rather
// than a divergent one-off look.
//
// RegisterDto.clubId's server-side "auto-join on signup" capability
// (sprint-2/auto-join-on-signup) is deliberately NOT used by this
// screen -- see CLAUDE.md's Sprint 2 status section for the direction
// (b) reasoning. This step calls the already-public-to-authenticated-
// users POST /clubs/:id/join itself, after account creation, using the
// access token RegisterResponse already returns.
import { useEffect, useState } from "react";
import { joinClub, listClubs, ClubsApiError } from "../../api/clubs";
import type { ClubSummary } from "../../api/clubs";
import "./ClubPickerStep.css";

interface ClubPickerStepProps {
  accessToken: string;
  onDone: () => void;
}

type JoinedState = Record<string, "idle" | "joining" | "joined" | "error">;

export default function ClubPickerStep({ accessToken, onDone }: ClubPickerStepProps) {
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [joinState, setJoinState] = useState<JoinedState>({});

  useEffect(() => {
    let cancelled = false;

    async function loadFirstPage() {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await listClubs(accessToken);
        if (cancelled) return;
        setClubs(result.items);
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ClubsApiError ? err.message : "Couldn't load clubs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await listClubs(accessToken, nextCursor);
      setClubs((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setLoadError(err instanceof ClubsApiError ? err.message : "Couldn't load more clubs.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleJoin(clubId: string) {
    setJoinState((prev) => ({ ...prev, [clubId]: "joining" }));
    try {
      await joinClub(accessToken, clubId);
      setJoinState((prev) => ({ ...prev, [clubId]: "joined" }));
    } catch {
      // A failed join attempt must not block proceeding to the app --
      // the "Continue" action below is always available regardless of
      // this state.
      setJoinState((prev) => ({ ...prev, [clubId]: "error" }));
    }
  }

  // Client-side substring filter over whatever page(s) have already been
  // fetched -- GET /clubs has no text-search parameter (only league/
  // country equality filters), so this is a filter over loaded results,
  // not a real search across the full catalog. Flagged here rather than
  // implied as more than it is.
  const visibleClubs = filter.trim()
    ? clubs.filter((club) => club.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : clubs;

  const hasJoinedAny = Object.values(joinState).some((state) => state === "joined");

  return (
    <div className="club-picker">
      <h1 className="signup-split__heading">Join a club</h1>
      <p className="signup-split__subheading">
        Follow your local club&rsquo;s fan page. You can always join one later from your profile -- this step is
        optional.
      </p>

      <input
        type="search"
        className="club-picker__search"
        placeholder="Filter loaded clubs by name"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        aria-label="Filter clubs by name"
        disabled={loading}
      />

      {loading && <p className="club-picker__status">Loading clubs…</p>}

      {loadError && (
        <p className="signup-form-error" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && visibleClubs.length === 0 && (
        <p className="club-picker__status">No clubs match that filter.</p>
      )}

      {!loading && visibleClubs.length > 0 && (
        <ul className="club-picker__list">
          {visibleClubs.map((club) => {
            const state = joinState[club.id] ?? "idle";
            return (
              <li key={club.id} className="club-picker__item">
                {club.logoUrl ? (
                  <img src={club.logoUrl} alt="" className="club-picker__logo" width={40} height={40} />
                ) : (
                  <div className="club-picker__logo club-picker__logo--placeholder" aria-hidden="true" />
                )}
                <div className="club-picker__meta">
                  <span className="club-picker__name">{club.name}</span>
                  <span className="club-picker__secondary">
                    {[club.league, club.country].filter(Boolean).join(" • ") || "Independent"} ·{" "}
                    {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                <button
                  type="button"
                  className="club-picker__join-button"
                  disabled={state === "joining" || state === "joined"}
                  onClick={() => handleJoin(club.id)}
                >
                  {state === "joined" ? "Joined" : state === "joining" ? "Joining…" : "Join"}
                </button>
                {state === "error" && (
                  <p className="club-picker__item-error" role="alert">
                    Couldn&rsquo;t join. Try again, or continue without joining.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && !loading && (
        <button
          type="button"
          className="club-picker__load-more"
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more clubs"}
        </button>
      )}

      {/* One action, not two redundant buttons doing the same thing: label
          reflects whether anything's actually been joined yet, but the
          click handler is identical either way -- a failed or in-flight
          join never disables this, so it's always a real, working skip. */}
      <button type="button" className="signup-button club-picker__continue" onClick={onDone}>
        {hasJoinedAny ? "Continue to Soccernity" : "Skip for now"}
      </button>
    </div>
  );
}
