// Community Group Page. Figma source: "Community Groups -- 4 Group Page
// (Not Joined) -- Desktop" (6453:18580) / "Mobile" (6457:18580), "-- 5
// Group Page (Joined) -- Desktop" (6454:18580) / "Mobile" (6458:18580),
// "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), from
// sprint-3/community-groups-design (Decision Log #281). Route:
// /groups/:groupId.
//
// Real data (Build Plan Sprint 3, CommunityGroupsService):
//   - GET /community-groups/:id  -- badge(s), name, member count,
//     per-caller `joined` (Decision Log #154/#275)  (api/community-groups.ts)
//   - GET /community-groups/:id/members -- the roster: { id, displayName }
//     per entry, alphabetical, keyset-paginated
//   - one Join / Leave button                          (GroupJoinButton)
//   - per-member Follow / Following                     (GroupMemberRow)
//
// DELIBERATELY NOT BUILT -- a real, disclosed conflict between the Figma
// frames and this task's own instruction, not a silent omission: both
// frame 4 and frame 5 render a "Group feed" section with two illustrative
// posts. Community Groups has NO backing feed/composer capability at all
// -- unlike Club -- Fan Page (whose "no-composer state" still has a real
// GET /clubs/:id/feed reading real Post rows via Post.clubPageId),
// CommunityGroupMember has no relation to Post whatsoever, and
// community-groups.controller.ts's own header comment states this is
// deliberate ("no group-post-composer or group-feed endpoint... mirroring
// Club -- Fan Page's own no-composer state" -- a comparison that only
// holds for the composer half, not the feed-reading half). No feed
// section is rendered here at all, on either the Not-Joined or the
// Joined state -- see this PR's Decision Log entry for the full
// disclosure.
//
// A missing / 404 group renders an honest "Group not found" state with a
// link back to /groups. GET /community-groups/:id is JwtAuthGuard-only; a
// no-session visit shows a "log in" prompt and never calls the API.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getCommunityGroupById,
  getCommunityGroupMembers,
  dimensionBadges,
  CommunityGroupsApiError,
  type CommunityGroup,
  type CommunityGroupMember,
} from "../api/community-groups";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import GroupJoinButton from "./community-groups/GroupJoinButton";
import GroupMemberRow from "./community-groups/GroupMemberRow";
import "./community-groups/CommunityGroupsPage.css";

type LoadState = "loading" | "loaded" | "error" | "not-found" | "no-session";
type SectionState = "loading" | "loaded" | "error";

function initialFor(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function memberLine(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "member" : "members"}`;
}

export default function CommunityGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [group, setGroup] = useState<CommunityGroup | null>(null);

  const [membersState, setMembersState] = useState<SectionState>("loading");
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [membersCursor, setMembersCursor] = useState<string | null>(null);
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadState("no-session");
      return;
    }
    if (!groupId) {
      setLoadState("not-found");
      return;
    }
    setLoadState("loading");

    let groupResult: CommunityGroup;
    try {
      groupResult = await getCommunityGroupById(token, groupId);
    } catch (err) {
      setLoadState(err instanceof CommunityGroupsApiError && err.status === 404 ? "not-found" : "error");
      return;
    }
    setGroup(groupResult);
    setLoadState("loaded");

    setMembersState("loading");
    try {
      const page = await getCommunityGroupMembers(token, groupId);
      setMembers(page.items);
      setMembersCursor(page.nextCursor);
      setMembersState("loaded");
    } catch {
      setMembersState("error");
    }
  }, [token, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMoreMembers() {
    if (!token || !groupId || !membersCursor || membersLoadingMore) return;
    setMembersLoadingMore(true);
    try {
      const page = await getCommunityGroupMembers(token, groupId, membersCursor);
      setMembers((prev) => [...prev, ...page.items]);
      setMembersCursor(page.nextCursor);
    } catch {
      /* keep what we have; the button stays and can be retried */
    } finally {
      setMembersLoadingMore(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="groups-status" role="status">
        Log in to view this group. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="groups-status" role="status">
        Loading group…
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="groups-detail">
        <Link to="/groups" className="groups-back">
          ← Community Groups
        </Link>
        <p className="groups-status" role="status">
          Group not found. <Link to="/groups">Back to all groups</Link>
        </p>
      </div>
    );
  }

  if (loadState === "error" || !group) {
    return (
      <div className="groups-detail">
        <Link to="/groups" className="groups-back">
          ← Community Groups
        </Link>
        <p className="groups-status groups-status--error" role="alert">
          Couldn&rsquo;t load this group. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="groups-detail">
      <Link to="/groups" className="groups-back">
        ← Community Groups
      </Link>

      <div className="groups-detail__identity">
        <span className="groups-detail__monogram" aria-hidden="true">
          {initialFor(group.name)}
        </span>
        <div className="groups-detail__text">
          <h1 className="groups-detail__name">{group.name}</h1>
          <div className="groups-detail__badgerow">
            {dimensionBadges(group).map((badge) => (
              <span key={badge} className="groups-badge">
                {badge}
              </span>
            ))}
            <span className="groups-detail__members">{memberLine(group.memberCount)}</span>
            {group.joined && <span className="groups-detail__joined-pill">✓ Joined</span>}
          </div>
        </div>
      </div>

      {token && (
        <GroupJoinButton
          accessToken={token}
          groupId={group.id}
          joined={group.joined}
          onToggled={(next) =>
            setGroup((prev) => (prev ? { ...prev, joined: next.joined, memberCount: next.memberCount } : prev))
          }
        />
      )}

      <hr className="groups-detail__divider" />

      {/* --- Members ------------------------------------------------- */}
      <section className="groups-section" aria-labelledby="group-members-title">
        <div className="groups-section__head">
          <h2 id="group-members-title" className="groups-section__title">
            Members
          </h2>
          <span className="groups-section__count">{memberLine(group.memberCount)}</span>
        </div>

        {membersState === "loading" && (
          <p className="groups-status" role="status">
            Loading members…
          </p>
        )}
        {membersState === "error" && (
          <p className="groups-status groups-status--error" role="alert">
            Couldn&rsquo;t load this group&rsquo;s members.
          </p>
        )}
        {membersState === "loaded" && members.length === 0 && (
          <p className="groups-status" role="status">
            No members to show yet.
          </p>
        )}
        {membersState === "loaded" && members.length > 0 && token && (
          <ul className="groups-roster">
            {members.map((member) => (
              <GroupMemberRow key={member.id} member={member} accessToken={token} currentUserId={decoded?.sub} />
            ))}
          </ul>
        )}
        {membersCursor && membersState === "loaded" && (
          <button
            type="button"
            className="groups-load-more"
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
