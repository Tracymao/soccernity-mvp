// Edit admin (superadmin): "Reset two-factor" for ANOTHER admin (B-271; Figma 6902:33251 to 6902:33820).
//   POST /admin/staff/:id/two-factor/reset
//     200 { id, twoFactorEnabled: false }   the target is signed out of every session
//     409 two_factor_not_enabled            nothing to reset
//     403 cannot_reset_own_two_factor       your own account: another superadmin must do it
//
// The staff list item now carries twoFactorEnabled (backend/two-factor-api-codes), so the card shows On or Off
// and Reset is DISABLED with a reason when the admin has no two-factor (Figma 6907:34127 on, 6908:34249 off). A
// 409 two_factor_not_enabled can still come back from a stale list and is shown as "nothing to reset" (Figma
// 6902:33532). Without the prop (twoFactorEnabled undefined) the card behaves as it did in PR #577: always
// offered. Your own id comes from the in-memory access token, not from the auth context, so the card has no
// provider dependency.
import { useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  CANNOT_RESET_OWN_TWO_FACTOR_CODE,
  TWO_FACTOR_NOT_ENABLED_CODE,
  errorCode,
  resetAdminTwoFactor,
} from "../../api/adminTwoFactor";
import { decodeAdminToken, getAdminAccessToken } from "../../lib/adminSession";
import TwoFactorDialog from "./TwoFactorDialog";
import * as copy from "./twoFactorCopy";
import "./twoFactor.css";

type Outcome = "done" | "nothing" | "own" | null;

function ownAdminId(): string | null {
  const token = getAdminAccessToken();
  return token ? (decodeAdminToken(token)?.sub ?? null) : null;
}

interface Props {
  adminId: string;
  adminName: string;
  /** From the staff item. Undefined = unknown (the card then behaves as before: Reset always offered). */
  twoFactorEnabled?: boolean;
  /** Called when this admin's two-factor is now off (after a reset, or after a 409 from a stale list). */
  onTwoFactorOff?: () => void;
}

export default function ResetTwoFactorCard({ adminId, adminName, twoFactorEnabled, onTwoFactorOff }: Props) {
  const known = twoFactorEnabled !== undefined;
  const enabled = twoFactorEnabled !== false;
  const isOwn = ownAdminId() === adminId;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(isOwn ? "own" : null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setDialogError(null);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      await resetAdminTwoFactor(adminId);
      setOpen(false);
      setOutcome("done");
      onTwoFactorOff?.();
    } catch (err) {
      const code = errorCode(err);
      if (err instanceof AdminApiError && err.status === 409 && code === TWO_FACTOR_NOT_ENABLED_CODE) {
        setOpen(false);
        setOutcome("nothing");
        onTwoFactorOff?.();
      } else if (err instanceof AdminApiError && err.status === 403 && code === CANNOT_RESET_OWN_TWO_FACTOR_CODE) {
        setOpen(false);
        setOutcome("own");
      } else {
        setDialogError(copy.RESET_FAILED);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tf-profile-card" aria-labelledby="tf-reset-title">
      <div className="tf-profile-card__head">
        <h2 id="tf-reset-title" className="tf-profile-card__title">
          {copy.CARD_TITLE}
        </h2>
        {known ? (
          <span className={`tf-pill${enabled ? "" : " tf-pill--off"}`}>{enabled ? copy.STATUS_ON : copy.STATUS_OFF}</span>
        ) : null}
      </div>
      {known ? <p className="tf-text">{enabled ? copy.RESET_ON_BODY : copy.RESET_OFF_BODY}</p> : null}
      <p className="tf-text">{enabled ? copy.RESET_CARD_BODY : copy.RESET_UNAVAILABLE}</p>

      {outcome === "done" ? (
        <div className="tf-banner tf-banner--info" role="status">
          <span className="tf-banner__bar" aria-hidden />
          <div>
            <p className="tf-banner__title">{copy.RESET_DONE_TITLE}</p>
            <p className="tf-banner__body">{copy.resetDoneBody(adminName)}</p>
          </div>
        </div>
      ) : null}
      {outcome === "nothing" ? (
        <div className="tf-banner tf-banner--info" role="status">
          <span className="tf-banner__bar" aria-hidden />
          <p className="tf-banner__body">{copy.RESET_NOTHING}</p>
        </div>
      ) : null}
      {outcome === "own" ? (
        <div className="tf-banner tf-banner--info" role="status">
          <span className="tf-banner__bar" aria-hidden />
          <p className="tf-banner__body">{copy.RESET_OWN_ACCOUNT}</p>
        </div>
      ) : null}

      <button
        type="button"
        className="tf-btn tf-btn--outline"
        disabled={outcome === "own" || !enabled}
        onClick={() => setOpen(true)}
      >
        {copy.RESET_BUTTON}
      </button>

      {open ? (
        <TwoFactorDialog
          titleId="tf-reset-dialog-title"
          title={copy.resetDialogTitle(adminName)}
          onClose={close}
          locked={busy}
        >
          <p className="tf-text">{copy.RESET_DIALOG_BODY}</p>
          <div className="tf-banner tf-banner--alert">
            <span className="tf-banner__bar" aria-hidden />
            <div>
              <p className="tf-banner__title">{copy.RESET_ALERT_TITLE}</p>
              <p className="tf-banner__body">{copy.RESET_ALERT_BODY}</p>
            </div>
          </div>
          {dialogError ? (
            <p className="tf-error" role="alert">
              {dialogError}
            </p>
          ) : null}
          <div className="tf-actions">
            <button type="button" className="tf-btn tf-btn--outline" onClick={close} disabled={busy}>
              {copy.CANCEL}
            </button>
            <button type="button" className="tf-btn tf-btn--primary" onClick={() => void confirm()} disabled={busy}>
              {busy ? copy.WORKING : copy.RESET_CONFIRM_BUTTON}
            </button>
          </div>
        </TwoFactorDialog>
      ) : null}
    </section>
  );
}
