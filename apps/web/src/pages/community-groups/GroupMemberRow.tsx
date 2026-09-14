// A single Community Group roster row: avatar (initials) + display name +
// a Follow / Following toggle. Figma source: the "Member Row" pattern on
// frames 6453:18580 / 6454:18580 (sprint-3/community-groups-design),
// adapted from ClubMemberRow.tsx (identical roster shape).
//
// GET /community-groups/:id/members returns only { id, displayName } per
// entry (services/api CommunityGroupMemberView) -- no @handle (no such
// `User` column, Decision Log #58) and no per-caller `isFollowing` flag
// (unlike GET /posts/feed's author, Decision Log #153). So the button
// always starts as "Follow" and self-corrects for in-session actions:
// POST/DELETE /users/:id/follow are idempotent (users.service.ts), so a
// redundant follow is harmless -- the same known gap ClubMemberRow.tsx's
// own comment already flags for the identical reason.
//
// The current user's own row renders without a Follow button (self-follow
// is a 400 -- users.service.ts), matching ClubMemberRow / PostCard.
import { useState } from "react";
import { followUser, unfollowUser, UsersApiError } from "../../api/users";
import type { CommunityGroupMember } from "../../api/community-groups";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

interface GroupMemberRowProps {
  member: CommunityGroupMember;
  accessToken: string;
  /** Omit / null when there is no signed-in user id to compare against. */
  currentUserId?: string | null;
}

export default function GroupMemberRow({ member, accessToken, currentUserId }: GroupMemberRowProps) {
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = currentUserId != null && member.id === currentUserId;

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = following
        ? await unfollowUser(accessToken, member.id)
        : await followUser(accessToken, member.id);
      setFollowing(result.following);
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Couldn't update that follow.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="groups-roster__row">
      <div className="groups-roster__identity">
        <span className="groups-roster__avatar" aria-hidden="true">
          {initialsFor(member.displayName)}
        </span>
        <span className="groups-roster__name">{member.displayName}</span>
      </div>
      {!isSelf && (
        <button
          type="button"
          className={following ? "groups-roster__follow groups-roster__follow--following" : "groups-roster__follow"}
          onClick={toggle}
          disabled={pending}
          aria-pressed={following}
        >
          {pending ? "…" : following ? "Following" : "Follow"}
        </button>
      )}
      {error && (
        <p className="groups-join__error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
