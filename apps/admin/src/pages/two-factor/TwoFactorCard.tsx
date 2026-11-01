// Admin Profile: the two-factor card (B-271; Figma 6902:32565 to 6902:33104).
//   GET  /admin/auth/two-factor/status                      -> { enabled, backupCodesRemaining }
//   POST /admin/auth/two-factor/backup-codes/regenerate     { password } -> { backupCodes } (shown once)
//
// There is deliberately NO "Turn off" control: while ADMIN_2FA_ENFORCED is on the API refuses it
// (403 admin_two_factor_required), and the status answer does not say whether enforcement is on
// (report section 6, point 2), so the card does not offer an action it may not be allowed to do.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  getAdminTwoFactorStatus,
  regenerateAdminBackupCodes,
  type AdminTwoFactorStatus,
} from "../../api/adminTwoFactor";
import BackupCodesPanel from "./BackupCodesPanel";
import TwoFactorDialog from "./TwoFactorDialog";
import * as copy from "./twoFactorCopy";
import "./twoFactor.css";

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; status: AdminTwoFactorStatus };

function RegenerateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await regenerateAdminBackupCodes(password);
      setCodes(result.backupCodes);
    } catch (err) {
      // 401 is the API's own "Incorrect password"; show it as is.
      setError(err instanceof AdminApiError && err.status === 401 ? err.message : copy.REGENERATE_FAILED);
      setBusy(false);
    }
  };

  // The new codes are on screen and cannot be shown again: closing is only possible through Done,
  // which stays disabled until the operator confirms they saved them.
  if (codes) {
    return (
      <TwoFactorDialog titleId="tf-regen-codes-title" title={copy.NEW_CODES_TITLE} onClose={onDone} locked>
        <BackupCodesPanel codes={codes} body={copy.NEW_CODES_BODY} continueLabel={copy.DONE} onContinue={onDone} />
      </TwoFactorDialog>
    );
  }

  return (
    <TwoFactorDialog titleId="tf-regen-title" title={copy.REGENERATE_BUTTON} onClose={onClose} locked={busy}>
      <form className="tf-form" onSubmit={(e) => void submit(e)}>
        <p className="tf-text">{copy.REGENERATE_BODY}</p>
        {error ? (
          <div className="tf-banner tf-banner--alert" role="alert">
            <span className="tf-banner__bar" aria-hidden />
            <p className="tf-banner__body">{error}</p>
          </div>
        ) : null}
        <label className="tf-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="tf-actions">
          <button type="button" className="tf-btn tf-btn--outline" onClick={onClose} disabled={busy}>
            {copy.CANCEL}
          </button>
          <button type="submit" className="tf-btn tf-btn--primary" disabled={busy || password.length === 0}>
            {busy ? copy.WORKING : copy.REGENERATE_CONFIRM}
          </button>
        </div>
      </form>
    </TwoFactorDialog>
  );
}

export default function TwoFactorCard() {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [dialog, setDialog] = useState(false);

  const fetchStatus = useCallback(() => {
    setLoad({ s: "loading" });
    getAdminTwoFactorStatus().then(
      (status) => setLoad({ s: "ready", status }),
      () => setLoad({ s: "error" }),
    );
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <section className="tf-profile-card" aria-labelledby="tf-card-title">
      <div className="tf-profile-card__head">
        <h2 id="tf-card-title" className="tf-profile-card__title">
          {copy.CARD_TITLE}
        </h2>
        {load.s === "ready" && load.status.enabled ? <span className="tf-pill">{copy.STATUS_ON}</span> : null}
      </div>

      {load.s === "loading" ? <p className="tf-text">{copy.LOADING_STATUS}</p> : null}

      {load.s === "error" ? (
        <>
          <div className="tf-banner tf-banner--alert" role="alert">
            <span className="tf-banner__bar" aria-hidden />
            <p className="tf-banner__body">{copy.STATUS_LOAD_ERROR}</p>
          </div>
          <button type="button" className="tf-btn tf-btn--outline" onClick={fetchStatus}>
            {copy.TRY_AGAIN}
          </button>
        </>
      ) : null}

      {load.s === "ready" && !load.status.enabled ? <p className="tf-text">{copy.CARD_OFF_BODY}</p> : null}

      {load.s === "ready" && load.status.enabled ? (
        <>
          <p className="tf-text">{copy.CARD_ON_BODY}</p>
          <div className="tf-stat">
            <span className="tf-stat__label">{copy.BACKUP_REMAINING_LABEL}</span>
            <span className="tf-stat__value">{load.status.backupCodesRemaining} of 10</span>
          </div>
          <div className="tf-banner tf-banner--info">
            <span className="tf-banner__bar" aria-hidden />
            <p className="tf-banner__body">{copy.CARD_REQUIRED_NOTE}</p>
          </div>
          <button type="button" className="tf-btn tf-btn--outline" onClick={() => setDialog(true)}>
            {copy.REGENERATE_BUTTON}
          </button>
        </>
      ) : null}

      {dialog ? (
        <RegenerateDialog
          onClose={() => setDialog(false)}
          onDone={() => {
            setDialog(false);
            fetchStatus();
          }}
        />
      ) : null}
    </section>
  );
}
