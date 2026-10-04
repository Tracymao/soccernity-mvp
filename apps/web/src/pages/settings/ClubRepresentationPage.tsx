// "Which club do you represent?" selector. Figma: "Which Club Do I
// Represent — Selector" 5570:7813 (desktop) / 5570:7887 (mobile), from
// Decision Log #74. Entry point: the "Club representation" row on the
// Settings Account page (Figma "Settings — Account" 2905:4798). The
// selector frame has no back-link of its own, so the back link here
// returns to that Account page.
//
// The frame is a standalone flow screen (its own top bar, no Settings
// rail), so the route sits directly under AppShell, not SettingsLayout.
// Like ClubsPage.tsx, the shared site Header is rendered by AppShell.
//
// Real data only:
//   - the caller's joined clubs: GET /clubs (joined === true), walked to
//     the end of the cursor so the list is complete      (api/clubs.ts)
//   - the currently represented club: GET /users/:id      (api/users.ts)
//   - save: PATCH /users/:id/represented-club             (api/users.ts)
//
// The server rejects any club the caller hasn't joined, so only joined
// clubs are offered. There is no "clear" control: the frame has none, and
// unrepresenting (null) is a backend capability not yet surfaced in UI.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { listClubs, type ClubSummary } from "../../api/clubs";
import { getUser, setRepresentedClub, UsersApiError } from "../../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../../lib/session";
import "./ClubRepresentationPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";

// Upper bound on cursor pages walked to collect every joined club, so a
// runaway cursor response can't loop forever.
const MAX_CLUB_PAGES = 20;

function metaLine(club: ClubSummary): string {
  const place = [club.league, club.country].filter(Boolean).join(" • ");
  return place || "Independent";
}

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

function initialFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

async function loadAllJoinedClubs(token: string): Promise<ClubSummary[]> {
  const joined: ClubSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_CLUB_PAGES; page++) {
    const result = await listClubs(token, cursor);
    joined.push(...result.items.filter((c) => c.joined));
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return joined;
}

export default function ClubRepresentationPage() {
  const token = getStoredAccessToken();
  const myUserId = token ? (decodeAccessToken(token)?.sub ?? null) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  // savedClubId is what the server holds; selectedClubId is what the radio
  // group shows. They differ only between a click and a successful save.
  const [savedClubId, setSavedClubId] = useState<string | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !myUserId) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const [joined, profile] = await Promise.all([loadAllJoinedClubs(token), getUser(token, myUserId)]);
      const current = profile.representedClub?.id ?? null;
      setClubs(joined);
      setSavedClubId(current);
      setSelectedClubId(current);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token, myUserId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!token || !myUserId || !selectedClubId || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const result = await setRepresentedClub(token, myUserId, selectedClubId);
      const nextId = result.representedClub?.id ?? null;
      setSavedClubId(nextId);
      setSelectedClubId(nextId);
      const name = result.representedClub?.name;
      setSavedMessage(name ? `Saved. You now represent ${name}.` : "Saved.");
    } catch (err) {
      setSaveError(err instanceof UsersApiError ? err.message : "Couldn't save your represented club. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <p className="club-rep__status" role="status">
        Log in to choose your represented club. <Link to="/login">Log in</Link>
      </p>
    );
  }

  if (loadState === "loading") {
    return (
      <p className="club-rep__status" role="status">
        Loading your clubs…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <p className="club-rep__status club-rep__status--error" role="alert">
        Couldn't load your clubs.{" "}
        <button type="button" className="club-rep__retry" onClick={load}>
          Try again
        </button>
      </p>
    );
  }

  const dirty = selectedClubId !== savedClubId;

  return (
    <div className="club-rep">
      <Link to="/settings/account" className="club-rep__back">
        ← Settings
      </Link>

      <div className="club-rep__header">
        <h2 className="club-rep__title">Which club do you represent?</h2>
        {clubs.length === 0 ? (
          <p className="club-rep__lead">
            You haven't joined any club pages yet. Join one to choose it as the club you represent.
          </p>
        ) : (
          <p className="club-rep__lead">
            You’ve joined more than one club page. Pick the one club you represent — its leaderboard is the one you
            appear on and earn points for. You can change this any time from Settings.
          </p>
        )}
      </div>

      {clubs.length === 0 ? (
        <Link to="/clubs" className="club-rep__cta club-rep__cta--link">
          Browse clubs
        </Link>
      ) : (
        <>
          <div className="club-rep__note" role="note">
            <span className="club-rep__note-dot" aria-hidden="true" />
            <span>
              Only one represented club counts for points. Joining or leaving other club pages doesn’t change this — only
              this choice does.
            </span>
          </div>

          <div role="radiogroup" aria-label="Clubs you have joined" className="club-rep__list">
            {clubs.map((club) => {
              const checked = club.id === selectedClubId;
              const isSaved = club.id === savedClubId;
              return (
                <label key={club.id} className={checked ? "club-rep__card club-rep__card--selected" : "club-rep__card"}>
                  <span className="club-rep__logo" aria-hidden="true">
                    {initialFor(club.name)}
                  </span>
                  <span className="club-rep__info">
                    <span className="club-rep__name">
                      {club.name}
                      {isSaved && <span className="club-rep__current"> · Represented</span>}
                    </span>
                    <span className="club-rep__meta">{metaLine(club)}</span>
                    <span className="club-rep__meta">{memberLine(club.memberCount)}</span>
                  </span>
                  <input
                    type="radio"
                    name="represented-club"
                    className="club-rep__radio"
                    value={club.id}
                    checked={checked}
                    onChange={() => {
                      setSelectedClubId(club.id);
                      setSavedMessage(null);
                      setSaveError(null);
                    }}
                  />
                </label>
              );
            })}
          </div>

          <div className="club-rep__footer">
            <button
              type="button"
              className="club-rep__cta"
              onClick={save}
              disabled={!dirty || !selectedClubId || saving}
            >
              {saving ? "Saving…" : "Save represented club"}
            </button>
            {saveError && (
              <p className="club-rep__feedback club-rep__feedback--error" role="alert">
                {saveError}
              </p>
            )}
            {savedMessage && !dirty && (
              <p className="club-rep__feedback" role="status">
                {savedMessage}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
