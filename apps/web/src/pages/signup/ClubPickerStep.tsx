// Club picker -- rendered from RegisterStep's success view, after a real
// account (and therefore a real access token) exists. See this branch's
// PR description for the full "why here, not inside the unauthenticated
// part of the signup flow" reasoning: GET /clubs is JwtAuthGuard-only
// (services/api/src/modules/clubs/clubs.controller.ts), and nothing
// before account creation has a JWT to call it with.
//
// Figma source (now real, merged): "Club Picker -- 1 Loaded List"
// (5146:6635), "-- 2 Club Joined" (5146:6648), "-- 3 Join Failed (Inline
// Error)" (5146:6661), "-- 4 No Clubs Match Filter" (5146:6674), "-- 5
// Load More Loading" (5146:6687), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6).
//
// SHELL DECISION (flagged, argued in full in this PR's report): the Figma
// frames are full-bleed dark and single-column -- structurally
// incompatible with the light two-panel SignupSplitScreen shell this
// component used to render inside (see RegisterStep.tsx's own comment).
// This component now renders its own self-contained full-bleed dark shell
// (the same negative-margin technique GuardianConsent.css /
// VerifyEmail.css already use), and RegisterStep.tsx renders it as a
// sibling/replacement instead of nesting it inside SignupSplitScreen.
// `confirmationMessage` is an OPTIONAL, additive prop for the "Account
// created" text that used to live in that nesting -- no existing caller
// passes it, so this is backward compatible.
//
// FIGMA-VS-SHIPPED-CODE CONFLICT #1 -- RESOLVED (Decision Log #40,
// sprint-2/verify-email-support-and-consent-view): the "Load more clubs"
// button now matches the Figma frame's "Load more" exactly.
//
// FIGMA-VS-SHIPPED-CODE CONFLICT #2 -- RESOLVED (Decision Log #40): the
// single "No clubs match that filter." string used to cover both "zero
// clubs total" and "filter matched nothing" -- now split into two
// distinct messages, matching the real Figma "Club Picker -- 6 No Clubs
// Available Yet" frame (built for Decision Log #137,
// sprint-2/decision-log-133-137-followup): "No clubs available yet."
// (verbatim per that frame's own copy, quoted directly in
// docs/sprint-2-decision-log-133-137-followup-report.md section 6 -- no
// dedicated node id was recorded in that report, so the exact wording was
// sourced from its quoted text rather than a fresh Figma read) for the
// catalogue-genuinely-empty case (`clubs.length === 0`, regardless of
// whether a filter is active), and the original "No clubs match that
// filter." kept for the filter-matched-nothing case (`clubs.length > 0`
// but `visibleClubs.length === 0`).
//
// RegisterDto.clubId's server-side "auto-join on signup" capability
// (sprint-2/auto-join-on-signup) is deliberately NOT used by this
// screen -- see CLAUDE.md's Sprint 2 status section for the direction
// (b) reasoning. This step calls the already-public-to-authenticated-
// users POST /clubs/:id/join itself, after account creation, using the
// access token RegisterResponse already returns.
import { useEffect, useState, type ReactNode } from "react";
import { joinClub, listClubs, ClubsApiError } from "../../api/clubs";
import type { ClubSummary } from "../../api/clubs";
import { darkClubPickerThemeVars } from "./clubPickerThemeVars";
import "./ClubPickerStep.css";

interface ClubPickerStepProps {
  accessToken: string;
  onDone: () => void;
  /**
   * Optional content rendered above the "Join a club" heading -- e.g.
   * RegisterStep's "Account created" / guardian-email confirmation copy.
   * Additive and optional: no existing caller/test passes this, so
   * omitting it leaves behavior identical to before this prop existed.
   */
  confirmationMessage?: ReactNode;
}

type JoinedState = Record<string, "idle" | "joining" | "joined" | "error">;

export default function ClubPickerStep({ accessToken, onDone, confirmationMessage }: ClubPickerStepProps) {
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
    <div className="club-picker-page" style={darkClubPickerThemeVars} data-testid="club-picker-page">
      <div className="club-picker-page__column">
        {confirmationMessage && <div className="club-picker__confirmation">{confirmationMessage}</div>}

        <div className="club-picker">
          <h1 className="club-picker__heading">Join a club</h1>
          <p className="club-picker__subheading">
            This step is optional. You can join clubs later from your profile at any time.
          </p>

          <div className="club-picker__search-bar">
            <span className="club-picker__search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              className="club-picker__search"
              placeholder="Filter loaded clubs by name"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter clubs by name"
              disabled={loading}
            />
          </div>

          {loading && <p className="club-picker__status">Loading clubs…</p>}

          {loadError && (
            <p className="club-picker__item-error" role="alert">
              {loadError}
            </p>
          )}

          {!loading && !loadError && visibleClubs.length === 0 && (
            <p className="club-picker__status">
              {clubs.length === 0 ? "No clubs available yet." : "No clubs match that filter."}
            </p>
          )}

          {!loading && visibleClubs.length > 0 && (
            <ul className="club-picker__list">
              {visibleClubs.map((club) => {
                // Seed from the API's real per-caller `joined` flag
                // (Decision Log #154) rather than always starting at
                // "idle" — the same way PostCard.tsx seeds its useState
                // from the feed response. In this component's one current
                // caller (RegisterStep's post-registration success view)
                // a brand-new account has joined nothing, so this is
                // `false` in practice today; it makes the component
                // correct by construction if ever reached again or
                // reused. `joinState` (in-session click-through) still
                // takes precedence once the user acts.
                const state = joinState[club.id] ?? (club.joined ? "joined" : "idle");
                const joinButtonClass =
                  state === "joined"
                    ? "club-picker__join-button club-picker__join-button--joined"
                    : state === "joining"
                      ? "club-picker__join-button club-picker__join-button--joining"
                      : "club-picker__join-button";

                return (
                  <li key={club.id} className="club-picker__item">
                    <div className="club-picker__item-row">
                      {club.logoUrl ? (
                        <img src={club.logoUrl} alt="" className="club-picker__logo" width={48} height={48} />
                      ) : (
                        <div
                          className="club-picker__logo club-picker__logo--placeholder"
                          aria-hidden="true"
                        />
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
                        className={joinButtonClass}
                        disabled={state === "joining" || state === "joined"}
                        onClick={() => handleJoin(club.id)}
                      >
                        {state === "joined" ? "Joined" : state === "joining" ? "Joining…" : "Join"}
                      </button>
                    </div>
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
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}

          {/* One action, not two redundant buttons doing the same thing: label
              reflects whether anything's actually been joined yet, but the
              click handler is identical either way -- a failed or in-flight
              join never disables this, so it's always a real, working skip. */}
          <button type="button" className="club-picker__continue" onClick={onDone}>
            {hasJoinedAny ? "Continue to Soccernity" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
