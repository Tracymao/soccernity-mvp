// Shared Join / Leave control for the Community Group page
// (CommunityGroupPage.tsx). Figma source: "Action -- Join (primary, not
// joined)" / "Action -- Leave (secondary, joined)" on frames
// 6453:18580 / 6454:18580 (sprint-3/community-groups-design).
//
// Same "act, then trust the real response" shape ClubJoinButton.tsx uses:
// the button starts from the group's real per-caller `joined` field
// (Decision Log #154/#275 pattern), and after a click it hands the
// endpoint's own returned state (`result.joined`, `result.memberCount`)
// back to the parent via onToggled. POST and DELETE
// /community-groups/:id/join are both idempotent server-side, so a
// redundant click is harmless.
//
// UNLIKE ClubJoinButton, both POST and DELETE here are GuardianConsentGuard
// -gated (Decision Log #281 -- Section 5.7 names "joining a ... Community
// Group" literally, and leaving is argued as the reverse of that same
// action -- see community-groups.controller.ts's own guard comments), so a
// restricted-pending minor's click can 403. Surfaced with a link to
// /guardian-consent, matching PostComposer.tsx / GrassrootsRegisterTeamPage.tsx.
import { useState } from "react";
import { Link } from "react-router";
import { joinCommunityGroup, leaveCommunityGroup, CommunityGroupsApiError } from "../../api/community-groups";
import { isAwaitingConsent } from "./errors";

interface GroupJoinButtonProps {
  accessToken: string;
  groupId: string;
  joined: boolean;
  /** Called with the endpoint's own resulting state after a successful toggle. */
  onToggled: (next: { joined: boolean; memberCount: number }) => void;
  className?: string;
}

export default function GroupJoinButton({ accessToken, groupId, joined, onToggled, className }: GroupJoinButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConsent, setAwaitingConsent] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    setAwaitingConsent(false);
    try {
      const result = joined
        ? await leaveCommunityGroup(accessToken, groupId)
        : await joinCommunityGroup(accessToken, groupId);
      onToggled({ joined: result.joined, memberCount: result.memberCount });
    } catch (err) {
      if (isAwaitingConsent(err)) {
        setAwaitingConsent(true);
      } else {
        setError(
          err instanceof CommunityGroupsApiError
            ? err.message
            : joined
              ? "Couldn't leave that group."
              : "Couldn't join that group.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  const label = pending ? (joined ? "Leaving…" : "Joining…") : joined ? "Leave group" : "Join group";

  return (
    <div className={className ? `groups-join ${className}` : "groups-join"}>
      <button
        type="button"
        className={joined ? "groups-join__button groups-join__button--leave" : "groups-join__button"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={joined}
      >
        {label}
      </button>
      {awaitingConsent && (
        <p className="groups-join__error" role="alert">
          Your account is awaiting guardian consent, so you can&rsquo;t {joined ? "leave" : "join"} a group yet.{" "}
          <Link to="/guardian-consent">Check your consent status</Link>.
        </p>
      )}
      {error && (
        <p className="groups-join__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
