// Community Groups -- Browse. Figma source: "Community Groups -- 1 Browse
// -- Desktop" (6450:18580) / "-- Mobile" (6455:18580), "-- 2 Browse (No
// Groups Match Filter)" (6452:18580 / 6456:18580), "-- 3 Browse (No
// Groups Yet for This City)" (6452:18692 / 6456:18667), "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6), from sprint-3/community-groups-design
// (Decision Log #281). Route: /groups. Closes the code half of Decision
// Log #281 -- the last remaining piece of Sprint 3's Community Groups
// feature.
//
// Real data only (Build Plan Sprint 3, CommunityGroupsService.listGroups):
//   - GET /community-groups, cursor-paginated "Load more"
//     (api/community-groups.ts), with 3 optional, combinable, SERVER-SIDE
//     exact-match equality filters (city / positionPlayed / careerTrack).
//
// The "Search groups by name" field is a CLIENT-SIDE substring filter over
// the pages already loaded -- GET /community-groups has NO name-search
// query param (only the 3 dimension filters), so this mirrors ClubsPage's
// own "Filter loaded clubs by name" discipline rather than implying a
// full-catalogue search.
//
// The 3 dimension filters are rendered as plain text inputs, NOT the
// "collapsed dropdown" the Figma frame shows: there is no endpoint that
// returns the distinct city / positionPlayed / careerTrack values in use,
// so a real dropdown would either be empty or fabricate an enumerated list
// the DTO itself explicitly does NOT enforce (create-community-group.dto.ts's
// own comment: "not validated against a fixed allow-list"). Each field
// re-queries the server (debounced 300ms), the same "real round trip, not
// a local filter" precedent GrassrootsPage's own city filter already set.
//
// Two Figma-designed empty states, both real, chosen by how many of the 3
// server-side dimension filters are ACTIVE:
//   - exactly one dimension active -> "No groups in {value} yet" / "No
//     groups match {dimension}" (frame 3), with a "Create the first
//     group" CTA pre-filled toward /groups/new.
//   - two or more dimensions active simultaneously -> "No groups match
//     those filters" (frame 2) -- the copy explains that a group is
//     designed to carry exactly one dimension in practice, so combining
//     filters is unlikely to match anything, and offers "Reset filters".
// A third, undesigned case (no dimension filter active at all, but the
// catalogue is genuinely empty) gets a plain "No groups yet." message,
// the same ClubsPage/GrassrootsPage precedent for a catalogue-empty state
// with no matching Figma frame. The client-side name filter matching
// nothing is a fourth, separate message ("No groups match that name.").
// All four are disclosed judgment calls, not silently picked -- see this
// PR's Decision Log entry.
//
// No-session handling mirrors ClubsPage.tsx / GrassrootsPage.tsx: a visit
// with no stored access token renders a "log in" prompt and never calls
// the API. GET /community-groups is JwtAuthGuard-only
// (community-groups.controller.ts).
//
// NOT here, and deliberately so: the design's own "· 248 groups" filter
// -summary count is omitted -- GET /community-groups has no total-count
// field (only items + nextCursor, Section 5.5 keyset discipline), so a
// true total isn't knowable without fetching every page. The filter chips
// still render; the count doesn't.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  listCommunityGroups,
  dimensionBadges,
  CommunityGroupsApiError,
  type CommunityGroup,
} from "../api/community-groups";
import { getStoredAccessToken } from "../lib/session";
import "./community-groups/CommunityGroupsPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

function initialFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

export default function CommunityGroupsPage() {
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // What's typed into each dimension field, vs. what was ACTUALLY last
  // queried (activeCity/activePosition/activeCareer) -- the same
  // input-vs-active split GrassrootsPage.tsx uses for its own city filter,
  // extended to 3 combinable fields.
  const [cityInput, setCityInput] = useState("");
  const [positionInput, setPositionInput] = useState("");
  const [careerInput, setCareerInput] = useState("");
  const [activeCity, setActiveCity] = useState("");
  const [activePosition, setActivePosition] = useState("");
  const [activeCareer, setActiveCareer] = useState("");

  // Client-side name filter, over the currently loaded (server-filtered) page.
  const [nameFilter, setNameFilter] = useState("");

  const load = useCallback(
    async (city: string, positionPlayed: string, careerTrack: string) => {
      if (!token) {
        setLoadState("no-session");
        return;
      }
      setLoadState("loading");
      try {
        const trimmedCity = city.trim();
        const trimmedPosition = positionPlayed.trim();
        const trimmedCareer = careerTrack.trim();
        const page = await listCommunityGroups(token, {
          ...(trimmedCity ? { city: trimmedCity } : {}),
          ...(trimmedPosition ? { positionPlayed: trimmedPosition } : {}),
          ...(trimmedCareer ? { careerTrack: trimmedCareer } : {}),
        });
        setGroups(page.items);
        setCursor(page.nextCursor);
        setActiveCity(trimmedCity);
        setActivePosition(trimmedPosition);
        setActiveCareer(trimmedCareer);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    },
    [token],
  );

  // Initial load.
  useEffect(() => {
    load("", "", "");
  }, [load]);

  // Debounced re-query whenever any dimension input differs from what's
  // actually active.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token) return;
    const trimmedCity = cityInput.trim();
    const trimmedPosition = positionInput.trim();
    const trimmedCareer = careerInput.trim();
    if (trimmedCity === activeCity && trimmedPosition === activePosition && trimmedCareer === activeCareer) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(cityInput, positionInput, careerInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cityInput, positionInput, careerInput, activeCity, activePosition, activeCareer, token, load]);

  async function loadMore() {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listCommunityGroups(token, {
        cursor,
        ...(activeCity ? { city: activeCity } : {}),
        ...(activePosition ? { positionPlayed: activePosition } : {}),
        ...(activeCareer ? { careerTrack: activeCareer } : {}),
      });
      setGroups((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(err instanceof CommunityGroupsApiError ? err.message : "Couldn't load more groups.");
    } finally {
      setLoadingMore(false);
    }
  }

  function resetFilters() {
    // Clear both the input state AND the "active" state (which the
    // debounce effect below compares inputs against) in the same batch,
    // so that effect sees no mismatch and never schedules a redundant
    // second re-query on top of the direct load() call below.
    setCityInput("");
    setPositionInput("");
    setCareerInput("");
    setActiveCity("");
    setActivePosition("");
    setActiveCareer("");
    setNameFilter("");
    load("", "", "");
  }

  if (loadState === "no-session") {
    return (
      <div className="groups-status" role="status">
        Log in to browse Community Groups. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const activeDimensionCount = [activeCity, activePosition, activeCareer].filter(Boolean).length;
  const term = nameFilter.trim().toLowerCase();
  const visibleGroups = term ? groups.filter((g) => g.name.toLowerCase().includes(term)) : groups;

  return (
    <div className="groups-page">
      <header className="groups-page__header">
        <div className="groups-page__intro">
          <h1 className="groups-page__title">Community Groups</h1>
          <p className="groups-page__subtitle">
            Find people beyond your club — by the city you play in, the position you play, or the career you are
            building in the game.
          </p>
        </div>
        <Link to="/groups/new" className="groups-btn--create">
          + Create a group
        </Link>
      </header>

      <div className="groups-filterbar">
        <div className="groups-filterbar__search">
          <span className="groups-filterbar__search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="groups-filterbar__search-input"
            placeholder="Search groups by name"
            aria-label="Search groups by name"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>

        <div className="groups-filterbar__row">
          <div className="groups-filterbar__field">
            <label className="groups-filterbar__label" htmlFor="groups-filter-city">
              1 · City
            </label>
            <input
              id="groups-filter-city"
              type="text"
              className="groups-filterbar__input"
              placeholder="All cities"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
            />
          </div>
          <div className="groups-filterbar__field">
            <label className="groups-filterbar__label" htmlFor="groups-filter-position">
              2 · Position played
            </label>
            <input
              id="groups-filter-position"
              type="text"
              className="groups-filterbar__input"
              placeholder="All positions"
              value={positionInput}
              onChange={(e) => setPositionInput(e.target.value)}
            />
          </div>
          <div className="groups-filterbar__field">
            <label className="groups-filterbar__label" htmlFor="groups-filter-career">
              3 · Career track
            </label>
            <input
              id="groups-filter-career"
              type="text"
              className="groups-filterbar__input"
              placeholder="All career tracks"
              value={careerInput}
              onChange={(e) => setCareerInput(e.target.value)}
            />
          </div>
        </div>

        {(activeCity || activePosition || activeCareer) && (
          <div className="groups-filterbar__summary">
            <div className="groups-filterbar__chips">
              {activeCity && <span className="groups-chip">City · {activeCity}</span>}
              {activePosition && <span className="groups-chip">Position · {activePosition}</span>}
              {activeCareer && <span className="groups-chip">Career track · {activeCareer}</span>}
            </div>
            <button type="button" className="groups-filterbar__reset" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        )}
      </div>

      {loadState === "loading" && (
        <p className="groups-status" role="status">
          Loading groups…
        </p>
      )}

      {loadState === "error" && (
        <p className="groups-status groups-status--error" role="alert">
          Couldn&rsquo;t load groups. Please try again shortly.
        </p>
      )}

      {loadState === "loaded" && groups.length === 0 && activeDimensionCount >= 2 && (
        <div className="groups-empty">
          <span className="groups-empty__icon" aria-hidden="true">
            ◦
          </span>
          <p className="groups-empty__title">No groups match those filters</p>
          <p className="groups-empty__body">
            Community Groups can only be filtered on one dimension at a time in practice — a group belongs to City,
            Position played or Career track, never more than one. Try clearing a filter, or search by name instead.
          </p>
          <button type="button" className="groups-empty__action groups-empty__action--secondary" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}

      {loadState === "loaded" && groups.length === 0 && activeDimensionCount === 1 && (
        <div className="groups-empty">
          <span className="groups-empty__icon" aria-hidden="true">
            ◦
          </span>
          <p className="groups-empty__title">
            No groups in {activeCity || activePosition || activeCareer} yet
          </p>
          <p className="groups-empty__body">
            Nobody has started a Community Group for this yet. Groups are created by players and fans, not by
            Soccernity — so this fills up as people arrive.
          </p>
          <Link to="/groups/new" className="groups-empty__action groups-empty__action--primary">
            Create the first group
          </Link>
        </div>
      )}

      {loadState === "loaded" && groups.length === 0 && activeDimensionCount === 0 && (
        <p className="groups-status" role="status">
          No groups yet.
        </p>
      )}

      {loadState === "loaded" && groups.length > 0 && visibleGroups.length === 0 && (
        <p className="groups-status" role="status">
          No groups match that name.
        </p>
      )}

      {loadState === "loaded" && visibleGroups.length > 0 && (
        <div className="groups-grid">
          {visibleGroups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="groups-card">
              <div className="groups-card__row">
                <span className="groups-card__monogram" aria-hidden="true">
                  {initialFor(group.name)}
                </span>
                <span className="groups-card__name">{group.name}</span>
              </div>
              <div className="groups-card__badges">
                {dimensionBadges(group).map((badge) => (
                  <span key={badge} className="groups-chip">
                    {badge}
                  </span>
                ))}
              </div>
              <span className="groups-card__members">{memberLine(group.memberCount)}</span>
            </Link>
          ))}
        </div>
      )}

      {cursor && loadState === "loaded" && (
        <button type="button" className="groups-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {loadMoreError && (
        <p className="groups-status groups-status--error" role="alert">
          {loadMoreError}
        </p>
      )}
    </div>
  );
}
