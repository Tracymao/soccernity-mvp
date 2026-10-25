// Settings > Privacy > Blocked users (build register B-108; Decision Log #396,
// #402 item 4, #404 item 8, #411 item 5). Route: /settings/privacy/blocked.
// Figma: list 6705:26172 (desktop) / 6706:26580 (mobile), empty 6705:26427 /
// 6706:26650, Unblock confirmation 6705:26659 / 6706:26697.
//
// Data: GET /users/:id/blocks (the caller's own list, newest first, keyset
// paginated): { id, publicName, reason }. There is NO date (#404 item 8) and
// the reason is the blocker's own private note, shown only here. Unblock is
// DELETE /users/:id/block behind a confirmation; it does NOT restore the
// follows the block removed. Both calls need authentication only (a
// restricted-pending or unverified account can still manage its blocks).
//
// The Figma rows also show an @handle; the endpoint returns only the public
// name (username, else display name), so no second line is drawn.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { UsersApiError, getBlockedUsers, unblockUser, type BlockedUserEntry } from "../../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../../lib/session";
import { initialsFor } from "../profile/profileFields";
import "./BlockedUsersPage.css";

export default function BlockedUsersPage() {
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : undefined;

  const [items, setItems] = useState<BlockedUserEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BlockedUserEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (after?: string) => {
      if (!token || !myId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const page = await getBlockedUsers(token, myId, after);
        setItems((prev) => (after ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (err) {
        setLoadError(err instanceof UsersApiError ? err.message : "Couldn't load your blocked users.");
      } finally {
        setLoading(false);
      }
    },
    [token, myId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || !myId) {
    return (
      <p className="settings-status" role="status">
        Log in to manage blocked users. <Link to="/login">Log in</Link>
      </p>
    );
  }

  async function confirmUnblock() {
    if (!confirming || !token) return;
    setBusy(true);
    setActionError(null);
    try {
      await unblockUser(token, confirming.id);
      setItems((prev) => prev.filter((entry) => entry.id !== confirming.id));
      setConfirming(null);
    } catch (err) {
      setActionError(err instanceof UsersApiError ? err.message : "Couldn't unblock that user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page blocked-users">
      <Link to="/settings/privacy" className="blocked-users__back">
        <span aria-hidden="true">&lsaquo;</span> Privacy
      </Link>

      <div>
        <h2 className="settings-page__title">Blocked users</h2>
        <p className="settings-page__lead">
          You can unblock someone at any time. Unblocking does not restore follows. [COPY PENDING LEGAL REVIEW]
        </p>
      </div>

      {loadError && (
        <p className="settings-status" role="alert">
          {loadError}
        </p>
      )}

      {!loadError && loading && items.length === 0 && (
        <p className="settings-status" role="status">
          Loading your blocked users…
        </p>
      )}

      {!loadError && !loading && items.length === 0 && (
        <div className="blocked-users__empty">
          <p className="blocked-users__empty-title">No blocked users</p>
          <p className="blocked-users__empty-body">
            When you block someone, they will appear here so you can unblock them.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="blocked-users__list">
          {items.map((entry) => (
            <li key={entry.id} className="blocked-users__row">
              <span className="blocked-users__avatar" aria-hidden="true">
                {initialsFor(entry.publicName)}
              </span>
              <div className="blocked-users__identity">
                <p className="blocked-users__name">{entry.publicName}</p>
                {entry.reason && <p className="blocked-users__reason">Reason: {entry.reason}</p>}
              </div>
              <button
                type="button"
                className="blocked-users__unblock"
                onClick={() => {
                  setActionError(null);
                  setConfirming(entry);
                }}
                aria-label={`Unblock ${entry.publicName}`}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}

      {cursor && !loading && (
        <button type="button" className="blocked-users__more" onClick={() => void load(cursor)}>
          Load more
        </button>
      )}

      {confirming && (
        <div className="blocked-users__scrim" onClick={() => !busy && setConfirming(null)}>
          <div
            className="blocked-users__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unblock-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="unblock-title" className="blocked-users__dialog-title">
              Unblock {confirming.publicName}?
            </h3>
            <p className="blocked-users__dialog-body">
              They will be able to see your posts again, and you will see theirs. Follows that were removed when you
              blocked them are not restored. [COPY PENDING LEGAL REVIEW]
            </p>
            {actionError && (
              <p className="settings-status" role="alert">
                {actionError}
              </p>
            )}
            <div className="blocked-users__dialog-actions">
              <button type="button" className="blocked-users__unblock" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="blocked-users__unblock blocked-users__unblock--primary"
                onClick={() => void confirmUnblock()}
                disabled={busy}
              >
                {busy ? "Unblocking…" : "Unblock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
