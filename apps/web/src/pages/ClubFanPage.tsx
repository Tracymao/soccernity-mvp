// Club — Fan Page. Figma source: "Club — Fan Page — Desktop" (5841:9365)
// / "Club — Fan Page — Mobile" (5841:9431), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6). The header block is from
// sprint-2/club-pages-design (PR #142); the feed + members sections were
// added by sprint-2/club-fan-page-design (PR #176). Route: /clubs/:id.
//
// Real data (Build Plan Section 4.4):
//   - GET /clubs/:id          — badge, name, league • country, member
//     count, per-caller `joined` (Decision Log #154)     (api/clubs.ts)
//   - GET /clubs/:id/feed     — the club's posts, newest-first, keyset-
//     paginated; identical shape to GET /posts/feed (delegates to
//     FeedService server-side), so PostCard renders it verbatim with
//     real like / comment / save / follow (Decision Log #157 backend
//     half, sprint-2/club-fan-page-backend / PR #177)
//   - GET /clubs/:id/members  — the roster: { id, displayName } per
//     entry, alphabetical, keyset-paginated (Decision Log #217)
//   - one Join / Leave button                            (ClubJoinButton)
//   - per-member Follow / Following                       (ClubMemberRow)
//
// The old "Member posts and a full member list aren't part of club pages
// yet" scope note is GONE — both are now real (Decision Log #157 is
// resolved on both the design and backend sides). Feed + roster load
// independently of the club header and of each other: a failure in one
// shows a soft in-section message, never breaks the page.
//
// KNOWN GAPS (flagged, see this PR's report + Decision Log #157):
//   - GET /clubs/:id/members has no per-caller `isFollowing` field
//     (unlike GET /posts/feed's author), so a roster Follow button always
//     starts as "Follow" and only self-corrects for in-session actions.
//     Idempotent server-side, so harmless — same situation PostCard was
//     in before Decision Log #153.
//   - The Figma "View all members →" link has no destination screen (a
//     dedicated full-roster route isn't built). Rendered here as an
//     in-place "Load more members" instead — the honest functional
//     equivalent of the same affordance.
//   - No club-post composer — there is no club-scoped post-creation
//     endpoint (CreatePostDto accepts clubPageId, but the web composer
//     lives on Community and posting-to-a-club isn't a designed flow).
//
// A missing / 404 club renders an honest "Club not found" state with a
// link back to /clubs. GET /clubs/:id is JwtAuthGuard-only; a no-session
// visit shows a "log in" prompt and never calls the API.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getClubById,
  getClubFeed,
  getClubMembers,
  ClubsApiError,
  type ClubMember,
  type ClubSummary,
} from "../api/clubs";
import { type FeedPost } from "../api/feed";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import ClubJoinButton from "./clubs/ClubJoinButton";
import ClubMemberRow from "./clubs/ClubMemberRow";
import PostCard from "./community/PostCard";
import "./clubs/ClubsPage.css";
import "./community/CommunityPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";
type SectionState = "loading" | "loaded" | "error";

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
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [club, setClub] = useState<ClubSummary | null>(null);

  const [feedState, setFeedState] = useState<SectionState>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [membersState, setMembersState] = useState<SectionState>("loading");
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [membersCursor, setMembersCursor] = useState<string | null>(null);
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);

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

    let clubResult: ClubSummary;
    try {
      clubResult = await getClubById(token, id);
    } catch (err) {
      setLoadState(err instanceof ClubsApiError && err.status === 404 ? "not-found" : "error");
      return;
    }
    setClub(clubResult);
    setLoadState("loaded");

    // Feed + roster are independent of the header and of each other.
    await Promise.allSettled([
      (async () => {
        setFeedState("loading");
        try {
          const page = await getClubFeed(token, id);
          setPosts(page.items);
          setFeedCursor(page.nextCursor);
          setFeedState("loaded");
        } catch {
          setFeedState("error");
        }
      })(),
      (async () => {
        setMembersState("loading");
        try {
          const page = await getClubMembers(token, id);
          setMembers(page.items);
          setMembersCursor(page.nextCursor);
          setMembersState("loaded");
        } catch {
          setMembersState("error");
        }
      })(),
    ]);
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMorePosts() {
    if (!token || !id || !feedCursor || feedLoadingMore) return;
    setFeedLoadingMore(true);
    try {
      const page = await getClubFeed(token, id, feedCursor);
      setPosts((prev) => [...prev, ...page.items]);
      setFeedCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setFeedLoadingMore(false);
    }
  }

  async function loadMoreMembers() {
    if (!token || !id || !membersCursor || membersLoadingMore) return;
    setMembersLoadingMore(true);
    try {
      const page = await getClubMembers(token, id, membersCursor);
      setMembers((prev) => [...prev, ...page.items]);
      setMembersCursor(page.nextCursor);
    } catch {
      /* keep what we have */
    } finally {
      setMembersLoadingMore(false);
    }
  }

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
          onToggled={(next) =>
            setClub((prev) => (prev ? { ...prev, joined: next.joined, memberCount: next.memberCount } : prev))
          }
          className="clubs-join--block"
        />
      )}

      <hr className="clubs-fan__divider" />

      {/* --- Club feed ------------------------------------------------ */}
      <section className="clubs-fan__section" aria-labelledby="club-feed-title">
        <h2 id="club-feed-title" className="clubs-fan__section-title">
          Club feed
        </h2>

        {feedState === "loading" && (
          <p className="clubs-status" role="status">
            Loading posts…
          </p>
        )}
        {feedState === "error" && (
          <p className="clubs-status clubs-status--error" role="alert">
            Couldn&rsquo;t load this club&rsquo;s feed.
          </p>
        )}
        {feedState === "loaded" && posts.length === 0 && (
          <p className="clubs-status" role="status">
            No posts in this club&rsquo;s feed yet.
          </p>
        )}
        {feedState === "loaded" && token && (
          <div className="clubs-fan__feed">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} accessToken={token} currentUserId={decoded?.sub ?? ""} />
            ))}
          </div>
        )}
        {feedCursor && feedState === "loaded" && (
          <button type="button" className="clubs-load-more" onClick={loadMorePosts} disabled={feedLoadingMore}>
            {feedLoadingMore ? "Loading…" : "Load more posts"}
          </button>
        )}
      </section>

      <hr className="clubs-fan__divider" />

      {/* --- Members ------------------------------------------------- */}
      <section className="clubs-fan__section" aria-labelledby="club-members-title">
        <div className="clubs-fan__members-head">
          <h2 id="club-members-title" className="clubs-fan__section-title">
            Members
          </h2>
          <span className="clubs-fan__members-count">{memberLine(club.memberCount)}</span>
        </div>

        {membersState === "loading" && (
          <p className="clubs-status" role="status">
            Loading members…
          </p>
        )}
        {membersState === "error" && (
          <p className="clubs-status clubs-status--error" role="alert">
            Couldn&rsquo;t load this club&rsquo;s members.
          </p>
        )}
        {membersState === "loaded" && members.length === 0 && (
          <p className="clubs-status" role="status">
            No members to show yet.
          </p>
        )}
        {membersState === "loaded" && members.length > 0 && token && (
          <ul className="clubs-roster">
            {members.map((member) => (
              <ClubMemberRow
                key={member.id}
                member={member}
                accessToken={token}
                currentUserId={decoded?.sub}
              />
            ))}
          </ul>
        )}
        {membersCursor && membersState === "loaded" && (
          <button
            type="button"
            className="clubs-load-more"
            onClick={loadMoreMembers}
            disabled={membersLoadingMore}
          >
            {membersLoadingMore ? "Loading…" : "Load more members"}
          </button>
        )}
      </section>
    </div>
  );
}
