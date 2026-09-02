// Shared Join / Leave control for the two persistent Club Pages
// (ClubsPage.tsx list rows and ClubFanPage.tsx). Figma source: the
// Join / Leave button on frames 5841:9240 / 5841:9365 (sprint-2/
// club-pages-design). Decision Log #155 (design + code) and #158
// (the leaveClub() client this needs).
//
// Same "act, then trust the real response" shape PostCard.tsx uses for
// like / save: the button starts from the club's real per-caller
// `joined` field (Decision Log #154, GET /clubs / GET /clubs/:id), and
// after a click it hands the endpoint's own returned state
// (`result.joined`, `result.memberCount`) back to the parent via
// onToggled so the surrounding list/page stays in sync. POST and DELETE
// /clubs/:id/join are both idempotent server-side (clubs.service.ts), so
// a redundant click is harmless.
import { useState } from "react";
import { joinClub, leaveClub, ClubsApiError } from "../../api/clubs";

interface ClubJoinButtonProps {
  accessToken: string;
  clubId: string;
  joined: boolean;
  /** Called with the endpoint's own resulting state after a successful toggle. */
  onToggled: (next: { joined: boolean; memberCount: number }) => void;
  className?: string;
}

export default function ClubJoinButton({ accessToken, clubId, joined, onToggled, className }: ClubJoinButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = joined ? await leaveClub(accessToken, clubId) : await joinClub(accessToken, clubId);
      onToggled({ joined: result.joined, memberCount: result.memberCount });
    } catch (err) {
      setError(
        err instanceof ClubsApiError ? err.message : joined ? "Couldn't leave that club." : "Couldn't join that club.",
      );
    } finally {
      setPending(false);
    }
  }

  const label = pending ? (joined ? "Leaving…" : "Joining…") : joined ? "Leave" : "Join";

  return (
    <div className={className ? `clubs-join ${className}` : "clubs-join"}>
      <button
        type="button"
        className={joined ? "clubs-join__button clubs-join__button--leave" : "clubs-join__button"}
        onClick={toggle}
        disabled={pending}
        aria-pressed={joined}
      >
        {label}
      </button>
      {error && (
        <p className="clubs-join__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
