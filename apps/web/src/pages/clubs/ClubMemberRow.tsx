// A single club-roster row: avatar (initials) + display name + a
// Follow / Following toggle. Figma source: the "Member Row" pattern on
// frames 5841:9365 / 5841:9431 (sprint-2/club-fan-page-design), adapted
// from the Community post-card author block.
//
// The Follow / Following state seeds from the server's per-caller
// `isFollowing` flag on the roster entry (Decision Log #224), and then
// follows POST/DELETE /users/:id/follow's own response for in-session
// actions. The current user's own row renders without a Follow button
// (self-follow is a 400 -- users.service.ts), matching PostCard's
// isOwnPost handling.
import { useState } from "react";
import { followUser, unfollowUser, UsersApiError } from "../../api/users";
import type { ClubMember } from "../../api/clubs";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

interface ClubMemberRowProps {
  member: ClubMember;
  accessToken: string;
  /** Omit / null when there is no signed-in user id to compare against. */
  currentUserId?: string | null;
}

export default function ClubMemberRow({ member, accessToken, currentUserId }: ClubMemberRowProps) {
  const [following, setFollowing] = useState(member.isFollowing);
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
    <li className="clubs-roster__row">
      <div className="clubs-roster__identity">
        <span className="clubs-roster__avatar" aria-hidden="true">
          {initialsFor(member.publicName)}
        </span>
        <span className="clubs-roster__name">{member.publicName}</span>
      </div>
      {!isSelf && (
        <button
          type="button"
          className={
            following ? "clubs-roster__follow clubs-roster__follow--following" : "clubs-roster__follow"
          }
          onClick={toggle}
          disabled={pending}
          aria-pressed={following}
        >
          {pending ? "…" : following ? "Following" : "Follow"}
        </button>
      )}
      {error && (
        <p className="clubs-join__error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
