// B-058: the Remove account dialog on the Roles list (Decision Log #472: "Delete Role" is a SOFT remove -- the account and its
// history are kept and it can no longer sign in). Figma: Confirm 6991:56553, Removing 6991:56752, Could not remove 6991:56951,
// Blocked: your own account 6991:57150, Blocked: last active super admin 6991:57349 (Done 6991:57548 is the banner and the dimmed
// row on the list page, not a dialog).
//
// "Remove account" is the existing deactivate action relabelled: PATCH /admin/staff/:id/status { status: "deactivated" } ends every
// session of the target and answers 409 for the last active super admin. There is no new status and no DELETE route.
//
// Own account: the frame says an admin cannot remove their own account and the dialog is shown WITHOUT calling the server. That is a
// client rule, not a server rule: the server today lets a super admin deactivate themselves while another super admin is active.
//
// Keyboard and focus reuse the shared dialog hook (focus moves in, Tab stays inside, Escape closes -- not while removing -- and focus
// returns to the control that opened it).
import { type ReactNode, useId, useRef, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import { updateAdminStatus, type AdminStaffListItem } from "../../api/adminStaff";
import { useDialogFocus } from "../moderation/HoldDialog";
import "./removeAccount.css";

export type RemoveDialogKind = "own" | "confirm";

type Phase = "confirm" | "removing" | "error" | "last-super-admin";

interface Props {
  admin: AdminStaffListItem;
  kind: RemoveDialogKind;
  /** The account was removed (the server answered 200). The page shows the Done banner and dims the row. */
  onRemoved: (admin: AdminStaffListItem) => void;
  onClose: () => void;
}

export default function RemoveAccountDialog({ admin, kind, onRemoved, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const removing = phase === "removing";

  useDialogFocus(dialogRef, () => {
    if (!removing) onClose();
  });

  async function remove() {
    if (removing) return;
    setPhase("removing");
    try {
      const updated = await updateAdminStatus(admin.id, "deactivated");
      onRemoved(updated);
    } catch (err) {
      // 409 is the server's last-active-super-admin refusal (nothing else on this route answers 409). Anything else
      // leaves the account unchanged and may be tried again.
      setPhase(err instanceof AdminApiError && err.status === 409 ? "last-super-admin" : "error");
    }
  }

  let title: string;
  let body: string;
  let actions: ReactNode;

  if (kind === "own") {
    title = "You can’t remove your own account";
    body = "Ask another super admin to remove it.";
    actions = (
      <button type="button" className="rm-btn rm-btn--primary" onClick={onClose} data-autofocus>
        OK
      </button>
    );
  } else if (phase === "last-super-admin") {
    title = "This is the last active super admin";
    body =
      "At least one active super admin is needed to manage staff. Give another account the Super Admin role first, then remove this one.";
    actions = (
      <button type="button" className="rm-btn rm-btn--primary" onClick={onClose} data-autofocus>
        OK
      </button>
    );
  } else if (phase === "error") {
    title = "Couldn’t remove the account";
    body = `${admin.fullName}’s account hasn’t changed. Check the connection and try again.`;
    actions = (
      <>
        <button type="button" className="rm-btn rm-btn--neutral" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="rm-btn rm-btn--primary" onClick={remove} data-autofocus>
          Try again
        </button>
      </>
    );
  } else {
    title = "Remove this account?";
    body = `${admin.fullName}’s account and history are kept, but they can no longer sign in.`;
    actions = (
      <>
        <button type="button" className="rm-btn rm-btn--neutral" onClick={onClose} disabled={removing} data-autofocus>
          Cancel
        </button>
        <button type="button" className="rm-btn rm-btn--primary" onClick={remove} disabled={removing}>
          {removing ? "Removing…" : "Remove account"}
        </button>
      </>
    );
  }

  return (
    <div className="rm-scrim" role="presentation">
      <div ref={dialogRef} className="rm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="rm-dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="rm-dialog__close" aria-label="Close" onClick={onClose} disabled={removing}>
            ✕
          </button>
        </div>
        <div className="rm-dialog__body">
          <p className="rm-dialog__text">{body}</p>
        </div>
        <div className="rm-dialog__actions">{actions}</div>
      </div>
    </div>
  );
}
