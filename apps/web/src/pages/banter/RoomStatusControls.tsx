// The room menu (kebab) and the Deactivate confirmation, creator only
// (B-071; Figma M3 to M10 on mobile, D2 to D8 on desktop).
//
// Deactivate asks first (a dialog), Reactivate does not (it is reversible and
// low risk, Figma notes section 5). The status call is PATCH
// /banter-rooms/:id/status. A failure in the dialog shows the frame's banner
// and the confirm button becomes "Try again"; a failed Reactivate shows the
// same banner wording under the room header with its own "Try again".
import { useEffect, useId, useRef, useState } from "react";
import { BanterApiError, updateRoomStatus, type BanterRoom, type BanterRoomStatus } from "../../api/banter";
import { useIsMobile } from "../../layout/useIsMobile";
import BanterModal from "./BanterModal";

const STATUS_ERROR = "Couldn’t change the room status. Check your connection and try again.";

// A 4xx the server explains itself (consent, not the creator, ...) is shown as
// the server wrote it; a network failure or a 5xx gets the frame's wording.
export function statusErrorMessage(err: unknown): string {
  if (err instanceof BanterApiError && err.status !== undefined && err.status >= 400 && err.status < 500) {
    return err.message;
  }
  return STATUS_ERROR;
}

interface RoomStatusControlsProps {
  accessToken: string;
  roomId: string;
  status: BanterRoomStatus;
  onChanged: (room: BanterRoom) => void;
}

export default function RoomStatusControls({ accessToken, roomId, status, onChanged }: RoomStatusControlsProps) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const kebabRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setMenuOpen(false);
        kebabRef.current?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      if (busy) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen, busy]);

  async function change(next: BanterRoomStatus): Promise<boolean> {
    setBusy(true);
    try {
      const room = await updateRoomStatus(accessToken, roomId, next);
      onChanged(room);
      return true;
    } catch (err) {
      const message = statusErrorMessage(err);
      if (next === "inactive") setDialogError(message);
      else setReactivateError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (busy) return;
    setDialogError(null);
    if (await change("inactive")) setConfirming(false);
  }

  async function reactivate() {
    if (busy) return;
    setReactivateError(null);
    await change("active");
    setMenuOpen(false);
  }

  const inactive = status === "inactive";

  return (
    <>
      <div className="banter-room-menu" ref={wrapRef}>
        <button
          ref={kebabRef}
          type="button"
          className="banter-room-menu__kebab"
          aria-label="Room menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">&#8942;</span>
        </button>
        {menuOpen && (
          <div className="banter-room-menu__list" role="menu">
            {inactive ? (
              <button
                type="button"
                role="menuitem"
                className="banter-room-menu__item"
                disabled={busy}
                onClick={() => void reactivate()}
              >
                {busy ? "Reactivating…" : "Reactivate room"}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="banter-room-menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  setDialogError(null);
                  setConfirming(true);
                }}
              >
                Deactivate room
              </button>
            )}
          </div>
        )}
      </div>

      {reactivateError && inactive && (
        <div className="banter-room-alert" role="alert">
          <span>{reactivateError}</span>
          <button type="button" className="banter-room-alert__retry" onClick={() => void reactivate()} disabled={busy}>
            Try again
          </button>
        </div>
      )}

      {confirming && (
        <BanterModal
          titleId={titleId}
          variant="dialog"
          busy={busy}
          onClose={() => {
            setConfirming(false);
            setDialogError(null);
          }}
        >
          <h2 id={titleId} className="banter-modal__title">
            Deactivate this room?
          </h2>
          <p className="banter-modal__body">
            People can still read the room. It shows as inactive in the list until you reactivate it.
          </p>
          {dialogError && (
            <p className="banter-modal__error" role="alert">
              {dialogError}
            </p>
          )}
          <div className={`banter-modal__actions${isMobile ? " banter-modal__actions--stack" : ""}`}>
            <button
              type="button"
              className="banter-modal__primary"
              data-autofocus
              onClick={() => void confirmDeactivate()}
              disabled={busy}
            >
              {busy ? "Deactivating…" : dialogError ? "Try again" : "Deactivate room"}
            </button>
            <button
              type="button"
              className="banter-modal__secondary"
              onClick={() => {
                setConfirming(false);
                setDialogError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </BanterModal>
      )}
    </>
  );
}
