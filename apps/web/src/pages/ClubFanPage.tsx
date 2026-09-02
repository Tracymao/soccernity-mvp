// Club — Fan Page. Figma source: "Club — Fan Page — Desktop" (5841:9365) /
// "Club — Fan Page — Mobile" (5841:9431), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6), from sprint-2/club-pages-design (PR #142).
// Route: /clubs/:id. Closes the code half of Decision Log #155 alongside
// ClubsPage.tsx.
//
// Real data only (Build Plan Section 4.4, ClubsService.getClubById):
//   - GET /clubs/:id — badge, name, league • country, member count,
//     per-caller `joined` (Decision Log #154)
//   - one Join / Leave button                              (ClubJoinButton)
//
// The page is DELIBERATELY sparse. There is no club feed, member list, or
// composer anywhere on it, because there is no endpoint to back any of
// that: GET /posts/feed is scoped to the caller's own posts + follows and
// never reads Post.clubPageId (Decision Log #157, still open). The muted
// scope note below is reproduced verbatim from the design for that exact
// reason — it is not the design being cautious, the capability genuinely
// does not exist server-side. Same discipline ProfilePage.tsx applies to
// its own unbacked Posts/Media tabs.
//
// A missing / 404 club renders an honest "Club not found" state with a
// link back to /clubs — never a crash or a blank page. GET /clubs/:id is
// JwtAuthGuard-only (clubs.controller.ts); a no-session visit shows a
// "log in" prompt and never calls the API.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getClubById, ClubsApiError, type ClubSummary } from "../api/clubs";
import { getStoredAccessToken } from "../lib/session";
import ClubJoinButton from "./clubs/ClubJoinButton";
import "./clubs/ClubsPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";

function initialFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function metaLine(club: ClubSummary): string {
  const place = [club.league, club.country].filter(Boolean).join(" • ");
  return place || "Independent";
}

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

export default function ClubFanPage() {
  const { id } = useParams<{ id: string }>();
  const token = getStoredAccessToken();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [club, setClub] = useState<ClubSummary | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    if (!id) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");
    try {
      const result = await getClubById(token, id);
      setClub(result);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(err instanceof ClubsApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadState === "no-session") {
    return (
      <div className="clubs-status" role="status">
        Log in to view this club. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="clubs-status" role="status">
        Loading club…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="clubs-fan">
        <Link to="/clubs" className="clubs-back">
          ← Clubs
        </Link>
        <p className="clubs-status" role="status">
          Club not found. <Link to="/clubs">Back to all clubs</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !club) {
    return (
      <div className="clubs-fan">
        <Link to="/clubs" className="clubs-back">
          ← Clubs
        </Link>
        <p className="clubs-status clubs-status--error" role="alert">
          Couldn&rsquo;t load this club. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="clubs-fan">
      <Link to="/clubs" className="clubs-back">
        ← Clubs
      </Link>

      <div className="clubs-fan__identity">
        {club.logoUrl ? (
          <img src={club.logoUrl} alt="" className="clubs-fan__badge" width={88} height={88} />
        ) : (
          <span className="clubs-fan__badge clubs-fan__badge--initial" aria-hidden="true">
            {initialFor(club.name)}
          </span>
        )}
        <div className="clubs-fan__text">
          <h1 className="clubs-fan__name">{club.name}</h1>
          <p className="clubs-fan__place">{metaLine(club)}</p>
          <p className="clubs-fan__members">{memberLine(club.memberCount)}</p>
        </div>
      </div>

      {token && (
        <ClubJoinButton
          accessToken={token}
          clubId={club.id}
          joined={club.joined}
          onToggled={(next) => setClub((prev) => (prev ? { ...prev, joined: next.joined, memberCount: next.memberCount } : prev))}
          className="clubs-join--block"
        />
      )}

      <hr className="clubs-fan__divider" />
      <p className="clubs-fan__note">Member posts and a full member list aren&rsquo;t part of club pages yet.</p>
    </div>
  );
}
