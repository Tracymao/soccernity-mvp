// The Block confirmation dialog (B-039 / B-218; Figma 6655:27355, 6655:29600),
// shared by the other-user profile page and the messaging surfaces (B-067).
// Extracted from OtherProfilePage.tsx with no change in behaviour or look:
// the same wording, the optional private note, and only "Block" calls the API.
// The styles live in pages/profile/OtherProfilePage.css.
//
// The dialog owns its own busy and error state. A failure shows the server's
// own message inside the dialog and keeps it open.
import { useState } from "react";
import { UsersApiError, blockUser } from "../../api/users";
import "../../pages/profile/ProfilePage.css";
import "../../pages/profile/OtherProfilePage.css";

export interface BlockUserDialogProps {
  accessToken: string;
  userId: string;
  name: string;
  onClose: () => void;
  onBlocked: () => void;
}

export default function BlockUserDialog({ accessToken, userId, name, onClose, onBlocked }: BlockUserDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await blockUser(accessToken, userId, reason);
      setReason("");
      onBlocked();
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Couldn't block that user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="other-profile__scrim" onClick={() => !busy && onClose()}>
      <div
        className="other-profile__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="block-dialog-title" className="other-profile__dialog-title">
          Block {name}?
        </h2>
        <p className="other-profile__dialog-body">Blocking {name}:</p>
        <ul className="other-profile__dialog-list">
          <li>hides their posts, comments, likes and search results from you, and yours from them</li>
          <li>stops messages in both directions</li>
          <li>removes follows in both directions</li>
        </ul>
        <p className="other-profile__dialog-body">
          You can undo it at any time in Settings; unblocking does not restore follows. They are not told.
          [COPY PENDING LEGAL REVIEW]
        </p>
        <label className="other-profile__dialog-label" htmlFor="block-reason">
          Reason (optional)
        </label>
        <input
          id="block-reason"
          className="other-profile__dialog-input"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Add a note for yourself"
        />
        {error && (
          <p className="profile-status-message profile-status-message--error" role="alert">
            {error}
          </p>
        )}
        <div className="other-profile__dialog-actions">
          <button type="button" className="profile-load-more" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="profile-edit-button" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
