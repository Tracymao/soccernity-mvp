// Staff reactivation of a Bants room (backend/room-staff-reactivation). Shown on the report detail of a
// "banter_room" report: the room's current status, and, when the SERVER says this admin may reactivate it now
// (`reportedRoom.staffMayReactivate`), a Reactivate Room button next to where Deactivate Room was recorded.
//
// No Figma frame exists for this action. It reuses the existing action control (`mod-btn mod-btn--primary`) and, like
// Deactivate Room, asks for no confirmation and no note (the route accepts an optional note; this screen does not
// offer one). Wording is plain and a default for the founder to veto.
//
// The page decides nothing: visibility is the server's `staffMayReactivate`, and every refusal is told apart by the
// server's stable code, never by its message text.
import { useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  BANTER_ROOM_ALREADY_ACTIVE_CODE,
  BANTER_ROOM_NOT_STAFF_DEACTIVATED_CODE,
  errorCodeOf,
  isChildSafetyVettingRequiredError,
  reactivateRoom,
  type ReportedRoom,
} from "../../api/moderation";
import { VettingRestrictedNotice } from "./moderationShared";

export const ROOM_ALREADY_ACTIVE_LINE = "This room is already active.";
export const ROOM_NOT_STAFF_DEACTIVATED_LINE =
  "This room wasn’t deactivated by staff, so staff can’t reactivate it.";
export const ROOM_ROLE_REFUSED_LINE = "Your role can’t reactivate a room.";
export const ROOM_REACTIVATE_FAILED_LINE = "Couldn’t reactivate the room. Please try again.";
export const ROOM_REACTIVATED_LINE = "Room reactivated.";

interface Props {
  room: ReportedRoom | null | undefined;
  onChanged: (next: ReportedRoom) => void;
}

export default function ReportedRoomCard({ room, onChanged }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [done, setDone] = useState(false);

  // The queue row carries no `reportedRoom`: until the single-report read answers there is nothing to say yet.
  if (room === undefined) return null;
  if (room === null) {
    return (
      <div className="mod-card">
        <h2 className="mod-card__title">Bants room</h2>
        <p className="mod-note">This room no longer exists.</p>
      </div>
    );
  }

  async function reactivate() {
    if (!room || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reactivateRoom(room.id);
      setDone(true);
      onChanged({ id: room.id, status: "active", staffMayReactivate: false });
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setRestricted(true);
      } else {
        const code = errorCodeOf(err);
        if (code === BANTER_ROOM_ALREADY_ACTIVE_CODE) {
          // The page was stale: the room is active, so nothing is left to do.
          setError(ROOM_ALREADY_ACTIVE_LINE);
          onChanged({ id: room.id, status: "active", staffMayReactivate: false });
        } else if (code === BANTER_ROOM_NOT_STAFF_DEACTIVATED_CODE) {
          setError(ROOM_NOT_STAFF_DEACTIVATED_LINE);
          onChanged({ ...room, staffMayReactivate: false });
        } else if (err instanceof AdminApiError && err.status === 403) {
          setError(ROOM_ROLE_REFUSED_LINE);
        } else {
          setError(ROOM_REACTIVATE_FAILED_LINE);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const active = room.status === "active";

  return (
    <div className="mod-card">
      <h2 className="mod-card__title">Bants room</h2>
      <div className="mod-field">
        <span className="mod-field__label">Room status</span>
        <span className="mod-field__value">
          <span className={`mod-pill mod-pill--plain ${active ? "mod-pill--outline" : "mod-pill--strong"}`}>
            {active ? "Active" : "Inactive"}
          </span>
        </span>
      </div>
      {done ? (
        <p className="mod-note" role="status">
          {ROOM_REACTIVATED_LINE}
        </p>
      ) : null}
      {error ? (
        <p className="mod-error" role="alert">
          {error}
        </p>
      ) : null}
      {restricted ? <VettingRestrictedNotice /> : null}
      {room.staffMayReactivate && !restricted ? (
        <div className="mod-action-row">
          <button type="button" className="mod-btn mod-btn--primary" onClick={reactivate} disabled={submitting}>
            {submitting ? "Saving…" : "Reactivate Room"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
