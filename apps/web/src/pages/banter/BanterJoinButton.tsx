// Shared Join / Leave control for Banter Rooms (BanterPage.tsx list rows
// and BanterRoomPage.tsx). Mirrors clubs/ClubJoinButton.tsx's exact
// shape -- the same "act, then trust the real response" pattern
// PostCard.tsx uses for like/save: the button starts from the room's
// real per-caller `joined` field (BanterService's Decision Log #154
// pattern), and after a click hands the endpoint's own returned state
// (`result.joined`, `result.memberCount`) back to the parent via
// onToggled. POST/DELETE /banter-rooms/:id/join are both idempotent
// server-side, so a redundant click is harmless.
//
// Unlike ClubJoinButton, a 403 here can mean the caller is a
// restricted-pending minor (GuardianConsentGuard is on both routes,
// Section 5.7/8.3 name "joining a Banter Room" literally) -- surfaced
// verbatim via BanterApiError's message rather than a generic fallback,
// same as PostComposer.tsx's consent-guard handling.
import { useState } from "react";
import { joinRoom, leaveRoom, BanterApiError } from "../../api/banter";

interface BanterJoinButtonProps {
  accessToken: string;
  roomId: string;
  joined: boolean;
  onToggled: (next: { joined: boolean; memberCount: number }) => void;
  className?: string;
}

export default function BanterJoinButton({
  accessToken,
  roomId,
  joined,
  onToggled,
  className,
}: BanterJoinButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = joined ? await leaveRoom(accessToken, roomId) : await joinRoom(accessToken, roomId);
      onToggled({ joined: result.joined, memberCount: result.memberCount });
    } catch (err) {
      setError(
        err instanceof BanterApiError
          ? err.message
          : joined
            ? "Couldn't leave that room."
            : "Couldn't join that room.",
      );
    } finally {
      setPending(false);
    }
  }

  const label = pending ? (joined ? "Leaving…" : "Joining…") : joined ? "Leave" : "Join";

  return (
    <div className={className ? `banter-join ${className}` : "banter-join"}>
      <button
        type="button"
        className={joined ? "banter-join__button banter-join__button--leave" : "banter-join__button"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={joined}
      >
        {label}
      </button>
      {error && (
        <p className="banter-join__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
