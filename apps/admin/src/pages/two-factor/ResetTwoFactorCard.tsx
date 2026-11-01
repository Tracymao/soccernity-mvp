// Edit admin (superadmin): "Reset two-factor" for ANOTHER admin (B-271; Figma 6902:33251 to 6902:33820).
//   POST /admin/staff/:id/two-factor/reset
//     200 { id, twoFactorEnabled: false }   the target is signed out of every session
//     409 two_factor_not_enabled            nothing to reset
//     403 cannot_reset_own_two_factor       your own account: another superadmin must do it
//
// The staff list returns no two-factor status, so the card (and Reset) is always shown and a 409
// explains "nothing to reset". Your own id comes from the in-memory access token, not from the auth
// context, so the card has no provider dependency.
import { useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  CANNOT_RESET_OWN_TWO_FACTOR_CODE,
  TWO_FACTOR_NOT_ENABLED_CODE,
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

function bodyCode(err: AdminApiError): string | null {
  const body = err.body;
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export default function ResetTwoFactorCard({ adminId, adminName }: { adminId: string; adminName: string }) {
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
    } catch (err) {
      const code = err instanceof AdminApiError ? bodyCode(err) : null;
      if (err instanceof AdminApiError && err.status === 409 && code === TWO_FACTOR_NOT_ENABLED_CODE) {
        setOpen(false);
        setOutcome("nothing");
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
      <h2 id="tf-reset-title" className="tf-profile-card__title">
        {copy.CARD_TITLE}
      </h2>
      <p className="tf-text">{copy.RESET_CARD_BODY}</p>

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
        disabled={outcome === "own"}
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
