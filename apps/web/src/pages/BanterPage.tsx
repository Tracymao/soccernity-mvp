// Banter ("Bants"). Figma source: "Bants homepage - All feed" (2256:6802)
// + "Bants - search result" (2448:2179), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). Route: /banter (nav label "Bants" -- Decision
// Log #163).
//
// LOGIN REQUIRED. Decision Log #152 establishes site-wide login-gating
// for the Community/Bants family of screens; this mirrors
// CommunityPage.tsx's no-session handling exactly -- a visit with no
// stored access token renders a "log in" prompt and never calls
// anything.
//
// BACKEND STATE, confirmed live before writing this: services/api/src/
// modules/banter/README.md is a placeholder only ("Sprint 3... Not yet
// implemented") -- there is no room list, post, or search endpoint. The
// room list, trending topics, fixtures and suggested-follows below are
// all illustrative dummy content (see ./banter/banterData.ts), the same
// discipline CommunityPage.tsx applies to its own unbacked side rails.
// The ONE real piece of data is the caller's own profile card (name),
// fetched via GET /users/:id the same way CommunityPage.tsx's composer
// does.
//
// The search box filters the dummy room list client-side only -- there
// is no search endpoint to call (Decision Log matches the "Bants - search
// result" frame's own "Result showing for X" pattern, reproduced with
// real client-side matching against illustrative data rather than a real
// query). A category filter (All / My Bants) is included per the mobile
// categories-view already built in Figma (Decision Log #144) -- "My
// Bants" has no membership data to filter by (no live room-membership
// endpoint), so it renders the same illustrative list with a disclosure
// note rather than fabricating a membership computation.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getUser, type UserProfile } from "../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import { ROOMS, TRENDS, FIXTURES, SUGGESTED } from "./banter/banterData";
import "./banter/BanterPage.css";

type Category = "all" | "mine";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function BanterPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");

  useEffect(() => {
    if (!token || !decoded) return;
    let cancelled = false;
    getUser(token, decoded.sub)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* non-fatal -- the identity card falls back to a generic label */
      });
    return () => {
      cancelled = true;
    };
  }, [token, decoded?.sub]);

  if (!token || !decoded) {
    return (
      <div className="banter-status" role="status">
        Log in to join the conversation on Bants. <Link to="/login">Log in</Link>
      </div>
    );
  }

  const term = query.trim().toLowerCase();
  const visibleRooms = term ? ROOMS.filter((r) => r.name.toLowerCase().includes(term)) : ROOMS;
  const displayName = profile?.displayName ?? "You";

  return (
    <div className="banter">
      <div className="banter__left">
        <div className="banter-card banter-profile">
          <span className="banter-profile__avatar" aria-hidden="true">
            {initialsFor(displayName)}
          </span>
          <p className="banter-profile__name">{displayName}</p>
          <p className="banter-profile__handle">Bants profile</p>
          <div className="banter-profile__stats">
            <span>
              <strong>—</strong> Followers
            </span>
            <span>
              <strong>—</strong> Posts
            </span>
            <span>
              <strong>—</strong> Following
            </span>
          </div>
          <Link to="/profile" className="banter-profile__link">
            View profile
          </Link>
          <p className="banter-profile__note">Follower/post counts aren&rsquo;t part of Bants yet.</p>
        </div>

        <div className="banter-card">
          <p className="banter-card__title">Trending News</p>
          <p className="banter-card__note">Sample &mdash; no news endpoint yet</p>
          {TRENDS.slice(0, 3).map((t) => (
            <div key={t.topic} className="banter-trend">
              <span>{t.topic}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="banter__center">
        <div className="banter-hero">
          <h1 className="banter-hero__title">Banter Rooms</h1>
          <p className="banter-hero__lede">
            Have fun, create and engage in conversations around your favourite teams, events and players.
          </p>
          <button type="button" className="banter-hero__cta" disabled>
            Create a room
          </button>
          <p className="banter-hero__note">Room creation isn&rsquo;t wired up yet — Sprint 3 backend scope.</p>
        </div>

        <div className="banter-search">
          <span className="banter-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="banter-search__input"
            placeholder="Search club, league, country, etc."
            aria-label="Search Bants rooms"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {term && (
          <p className="banter-search-result">
            Result showing for &ldquo;{query}&rdquo; ({visibleRooms.length})
          </p>
        )}

        <div className="banter-categories" role="tablist" aria-label="Bants categories">
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={category === "all" ? "banter-category banter-category--active" : "banter-category"}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={category === "mine"}
            className={category === "mine" ? "banter-category banter-category--active" : "banter-category"}
            onClick={() => setCategory("mine")}
          >
            My Bants
          </button>
        </div>

        {category === "mine" && (
          <p className="banter-status banter-status--inline" role="status">
            Room membership isn&rsquo;t tracked yet — showing all rooms.
          </p>
        )}

        <ul className="banter-room-list">
          {visibleRooms.length === 0 && <li className="banter-empty">No rooms match that search.</li>}
          {visibleRooms.map((room) => (
            <li key={room.id} className="banter-room">
              <span className="banter-room__avatar" aria-hidden="true">
                {initialsFor(room.name)}
              </span>
              <span className="banter-room__text">
                <span className="banter-room__name">{room.name}</span>
                <span className="banter-room__meta">
                  {room.scope} &middot; {room.memberCount.toLocaleString("en-GB")} members
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="banter__right">
        <div className="banter-card">
          <p className="banter-card__title">Fixtures</p>
          <p className="banter-card__note">Sample &mdash; no fixtures endpoint yet (Decision Log #6)</p>
          {FIXTURES.map((f, i) => (
            <div key={`${f.home}-${f.away}-${i}`} className="banter-fixture">
              <span>{f.home}</span>
              <span className="banter-fixture__time">{f.kickoff}</span>
              <span>{f.away}</span>
            </div>
          ))}
        </div>

        <div className="banter-card">
          <p className="banter-card__title">Suggested</p>
          <p className="banter-card__note">Sample &mdash; no suggestions endpoint yet</p>
          {SUGGESTED.map((s) => (
            <div key={s.handle} className="banter-suggest">
              <span className="banter-suggest__avatar" aria-hidden="true">
                {initialsFor(s.name)}
              </span>
              <span className="banter-suggest__text">
                <span className="banter-suggest__name">{s.name}</span>
                <span className="banter-suggest__handle">{s.handle}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
