// Admin Profile: the two-factor card (B-271; Figma 6902:32565 to 6902:33104, and for enforcement OFF
// 6906:33681 to 6906:34113).
//   GET  /admin/auth/two-factor/status                      -> { enabled, backupCodesRemaining, enforced }
//   POST /admin/auth/two-factor/backup-codes/regenerate     { password } -> { backupCodes } (shown once)
//   POST /admin/auth/two-factor/disable                     { password } -> 204 (deletes the secret and every backup code)
//
// "Turn off" is offered only when the status answer says enforced === false: while ADMIN_2FA_ENFORCED is on
// the API refuses it (403 admin_two_factor_required) and the card shows the "required" note instead. A status
// answer without the field is read as enforced, so the card never offers an action it may not be allowed to do.
// Turning two-factor back on from here is not drawn and not built (follow-up).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ADMIN_TWO_FACTOR_REQUIRED_CODE,
  TWO_FACTOR_INCORRECT_PASSWORD_CODE,
  TWO_FACTOR_NOT_ENABLED_CODE,
  disableAdminTwoFactor,
  errorCode,
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
      // Decided by the error code, never by the message text.
      setError(errorCode(err) === TWO_FACTOR_INCORRECT_PASSWORD_CODE ? copy.INCORRECT_PASSWORD : copy.REGENERATE_FAILED);
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

function TurnOffDialog({ onClose, onDone, onStale }: { onClose: () => void; onDone: () => void; onStale: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await disableAdminTwoFactor(password);
      onDone();
    } catch (err) {
      const code = errorCode(err);
      if (code === TWO_FACTOR_INCORRECT_PASSWORD_CODE) {
        setError(copy.INCORRECT_PASSWORD);
      } else if (code === ADMIN_TWO_FACTOR_REQUIRED_CODE || code === TWO_FACTOR_NOT_ENABLED_CODE) {
        // Enforcement was switched on (or two-factor was already off) since the card loaded: the card was stale.
        onStale();
        return;
      } else {
        setError(copy.TURN_OFF_FAILED);
      }
      setBusy(false);
    }
  };

  return (
    <TwoFactorDialog titleId="tf-turnoff-title" title={copy.TURN_OFF_TITLE} onClose={onClose} locked={busy}>
      <form className="tf-form" onSubmit={(e) => void submit(e)}>
        <p className="tf-text">{copy.TURN_OFF_BODY}</p>
        <div className="tf-banner tf-banner--alert">
          <span className="tf-banner__bar" aria-hidden />
          <p className="tf-banner__body">{copy.TURN_OFF_WARNING}</p>
        </div>
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
            {busy ? copy.WORKING : copy.TURN_OFF_CONFIRM}
          </button>
        </div>
      </form>
    </TwoFactorDialog>
  );
}

export default function TwoFactorCard() {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [dialog, setDialog] = useState(false);
  const [turnOffDialog, setTurnOffDialog] = useState(false);
  // Set after Turn off succeeds: the card shows the "turned off" banner and the Off state.
  const [turnedOff, setTurnedOff] = useState(false);

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

  // Only an explicit enforced === false offers Turn off.
  const canTurnOff = load.s === "ready" && load.status.enabled && load.status.enforced === false;

  return (
    <>
      {turnedOff ? (
        <div className="tf-banner tf-banner--info" role="status">
          <span className="tf-banner__bar" aria-hidden />
          <div>
            <p className="tf-banner__title">{copy.TURNED_OFF_TITLE}</p>
            <p className="tf-banner__body">{copy.TURNED_OFF_BODY}</p>
          </div>
        </div>
      ) : null}
      <section className="tf-profile-card" aria-labelledby="tf-card-title">
      <div className="tf-profile-card__head">
        <h2 id="tf-card-title" className="tf-profile-card__title">
          {copy.CARD_TITLE}
        </h2>
        {load.s === "ready" && load.status.enabled ? <span className="tf-pill">{copy.STATUS_ON}</span> : null}
        {turnedOff ? <span className="tf-pill tf-pill--off">{copy.STATUS_OFF}</span> : null}
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

      {load.s === "ready" && !load.status.enabled ? (
        <p className="tf-text">{turnedOff ? copy.CARD_TURNED_OFF_BODY : copy.CARD_OFF_BODY}</p>
      ) : null}

      {load.s === "ready" && load.status.enabled ? (
        <>
          <p className="tf-text">{copy.CARD_ON_BODY}</p>
          <div className="tf-stat">
            <span className="tf-stat__label">{copy.BACKUP_REMAINING_LABEL}</span>
            <span className="tf-stat__value">{load.status.backupCodesRemaining} of 10</span>
          </div>
          {canTurnOff ? null : (
            <div className="tf-banner tf-banner--info">
              <span className="tf-banner__bar" aria-hidden />
              <p className="tf-banner__body">{copy.CARD_REQUIRED_NOTE}</p>
            </div>
          )}
          <div className="tf-actions tf-actions--start">
            <button type="button" className="tf-btn tf-btn--outline" onClick={() => setDialog(true)}>
              {copy.REGENERATE_BUTTON}
            </button>
            {canTurnOff ? (
              <button type="button" className="tf-btn tf-btn--outline" onClick={() => setTurnOffDialog(true)}>
                {copy.TURN_OFF_BUTTON}
              </button>
            ) : null}
          </div>
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

      {turnOffDialog ? (
        <TurnOffDialog
          onClose={() => setTurnOffDialog(false)}
          onDone={() => {
            setTurnOffDialog(false);
            setTurnedOff(true);
            setLoad({ s: "ready", status: { enabled: false, backupCodesRemaining: 0, enforced: false } });
          }}
          onStale={() => {
            setTurnOffDialog(false);
            fetchStatus();
          }}
        />
      ) : null}
      </section>
    </>
  );
}
