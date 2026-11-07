// Settings > Privacy > Download my data. Figma (file weZWWqggy9j13eX8bhFgs6), desktop / mobile:
//   confirm password   6991:53920 / 6991:55566     wrong password    6991:54165 / 6991:55665
//   preparing          6991:54412 / 6991:55766     ready             6991:54653 / 6991:55861
//   too many requests  6991:54900 / 6991:55962     could not prepare 6991:55141 / 6991:56057
// Route: /settings/privacy/download-data, reached from the Download my data row on
// /settings/privacy. Build register B-060 (Decision Log #472 adopted default (g)). API client and
// the backend contract: ../../api/dataExport.ts.
//
// One route, a small state machine. On open it asks for the latest export so a person who left
// while it was preparing, or whose file is ready, lands in the right place.
//   - preparing: checks "latest" every POLL_INTERVAL_MS and stops after POLL_WINDOW_MS or when the
//     person leaves the page, then shows a plain "still preparing" line with a Check again button.
//     BOTH numbers are borrowed defaults (5 s, 2 min), veto-able.
//   - "Cancel" on the preparing frame: there is NO cancel endpoint, so it stops waiting and goes
//     back to Privacy; the file keeps being prepared and can be picked up here later. Label kept as
//     drawn (flagged in the PR).
//   - download: the route needs the access token, so the file is fetched and saved as a blob named
//     soccernity-data-export.json.
// Wording the frames draw is used as drawn; the sentence the frames tag is tagged here and listed
// in docs/pending-copy-manifest.md. Wording no frame draws (still preparing, expired, retry lines)
// is plain and untagged.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  DATA_EXPORT_EXPIRED,
  DATA_EXPORT_FILE_NAME,
  DATA_EXPORT_NOT_FOUND,
  DATA_EXPORT_NOT_READY,
  DATA_EXPORT_TOO_MANY,
  DATA_EXPORT_WRONG_PASSWORD,
  DataExportApiError,
  downloadDataExport,
  getLatestDataExport,
  requestDataExport,
  saveBlobAsFile,
  type LatestDataExport,
} from "../../api/dataExport";
import { getStoredAccessToken } from "../../lib/session";
import downloadIcon from "../../assets/icons/data-export-download.svg";
import alertIcon from "../../assets/icons/data-export-alert.svg";
import "./ChangePasswordPage.css";
import "./DataExportPage.css";

// Borrowed defaults (B-060 brief), veto-able.
export const POLL_INTERVAL_MS = 5000;
export const POLL_WINDOW_MS = 2 * 60 * 1000;

export const MESSAGES = {
  wrongPassword: "That password isn’t right. Check it and try again.",
  startFailed: "We couldn’t start your data export. Try again.",
  downloadFailed: "We couldn’t download your file. Try again.",
  loadFailed: "Couldn’t check your data export. Please try again shortly.",
  stalled: "Your file is still being prepared. It can take a few minutes. You can check again, or come back later.",
  // The one sentence the frame tags; the literal tag is shown to the person on purpose (B-124).
  personalData:
    "The file contains your personal data. Keep it somewhere safe and don’t share it. [COPY PENDING LEGAL REVIEW]",
} as const;

type View = "loading" | "loadError" | "form" | "preparing" | "stalled" | "ready" | "failed" | "tooMany" | "expired";

function formatExpiry(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function InlineError({ id, children }: { id: string; children: string }) {
  return (
    <div className="cpw-error" id={id} role="alert">
      <span className="cpw-error__bar" aria-hidden="true" />
      <p className="cpw-error__text">{children}</p>
    </div>
  );
}

function IconDisc({ icon }: { icon: string }) {
  return (
    <div className="cpw__disc" aria-hidden="true">
      <img src={icon} alt="" width={28} height={28} />
    </div>
  );
}

export default function DataExportPage() {
  const token = getStoredAccessToken();

  const [view, setView] = useState<View>("loading");
  const [exportId, setExportId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [focusPassword, setFocusPassword] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (focusPassword && !busy) {
      document.getElementById("dex-password")?.focus();
      setFocusPassword(false);
    }
  }, [focusPassword, busy]);

  const applyLatest = useCallback((latest: LatestDataExport) => {
    if (!mounted.current) return;
    if (latest.status === "ready" && latest.id) {
      setExportId(latest.id);
      setExpiresAt(latest.expiresAt);
      setDownloadError(null);
      setView("ready");
    } else if (latest.status === "failed") {
      setView("failed");
    } else if (latest.status === "preparing") {
      setView("preparing");
    } else {
      setView("form");
    }
  }, []);

  // First look: where did the person leave off?
  const loadLatest = useCallback(async () => {
    if (!token) return;
    setView("loading");
    try {
      applyLatest(await getLatestDataExport(token));
    } catch {
      if (mounted.current) setView("loadError");
    }
  }, [token, applyLatest]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  // Preparing: poll, stop after the window or when the person leaves (cleanup).
  useEffect(() => {
    if (view !== "preparing" || !token) return;
    let inFlight = false;
    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        applyLatest(await getLatestDataExport(token));
      } catch {
        // A failed check is not the end; the next tick tries again until the window closes.
      } finally {
        inFlight = false;
      }
    }, POLL_INTERVAL_MS);
    const stop = setTimeout(() => {
      clearInterval(interval);
      if (mounted.current) setView("stalled");
    }, POLL_WINDOW_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [view, token, applyLatest]);

  if (!token) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your privacy settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !password) return;
    setFormError(null);
    setWrongPassword(false);
    setBusy(true);
    try {
      await requestDataExport(token as string, password);
      setPassword("");
      setView("preparing");
    } catch (err) {
      if (err instanceof DataExportApiError && err.code === DATA_EXPORT_WRONG_PASSWORD) {
        setWrongPassword(true);
        // The input is disabled while the request runs; focus it once it is enabled again.
        setFocusPassword(true);
      } else if (err instanceof DataExportApiError && err.code === DATA_EXPORT_TOO_MANY) {
        setPassword("");
        setView("tooMany");
      } else if (err instanceof DataExportApiError && err.status === undefined) {
        setFormError(err.message);
      } else {
        setFormError(MESSAGES.startFailed);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function checkAgain() {
    if (busy) return;
    setBusy(true);
    try {
      const latest = await getLatestDataExport(token as string);
      applyLatest(latest);
    } catch {
      if (mounted.current) setView("stalled");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function handleDownload() {
    if (busy || !exportId) return;
    setDownloadError(null);
    setBusy(true);
    try {
      const blob = await downloadDataExport(token as string, exportId);
      saveBlobAsFile(blob, DATA_EXPORT_FILE_NAME);
    } catch (err) {
      if (
        err instanceof DataExportApiError &&
        (err.code === DATA_EXPORT_EXPIRED || err.code === DATA_EXPORT_NOT_FOUND)
      ) {
        setView("expired");
      } else if (err instanceof DataExportApiError && err.code === DATA_EXPORT_NOT_READY) {
        // Not ready after all: go back to waiting.
        setView("preparing");
      } else if (err instanceof DataExportApiError && err.status === undefined) {
        setDownloadError(err.message);
      } else {
        setDownloadError(MESSAGES.downloadFailed);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function startOver() {
    setWrongPassword(false);
    setFormError(null);
    setPassword("");
    setView("form");
  }

  if (view === "loading") {
    return (
      <p className="settings-status" role="status">
        Checking your data export…
      </p>
    );
  }

  if (view === "loadError") {
    return (
      <div className="cpw">
        <InlineError id="dex-load-error">{MESSAGES.loadFailed}</InlineError>
        <div className="dex__actions">
          <button type="button" className="cpw__btn" onClick={() => void loadLatest()}>
            Try again
          </button>
          <Link to="/settings/privacy" className="dex__btn-secondary">
            Back to Privacy
          </Link>
        </div>
      </div>
    );
  }

  if (view === "preparing" || view === "stalled") {
    const stalled = view === "stalled";
    return (
      <div className="cpw">
        <Link to="/settings/privacy" className="cpw__back" aria-label="Back to Privacy">
          &larr;
        </Link>
        <div className="cpw__header">
          <h2 className="cpw__title">Preparing your file</h2>
          <p className="cpw__lead">This can take a few minutes.</p>
        </div>
        {!stalled && (
          <div className="dex__progress" role="progressbar" aria-label="Preparing your file" aria-busy="true">
            <span className="dex__progress-fill" />
          </div>
        )}
        <p className="cpw__note" role="status">
          {stalled ? MESSAGES.stalled : "Preparing…"}
        </p>
        <div className="dex__actions">
          {stalled && (
            <button type="button" className="cpw__btn" onClick={() => void checkAgain()} disabled={busy}>
              Check again
            </button>
          )}
          <Link to="/settings/privacy" className="dex__btn-secondary">
            Cancel
          </Link>
        </div>
      </div>
    );
  }

  if (view === "ready") {
    const expiry = formatExpiry(expiresAt);
    return (
      <div className="cpw">
        <Link to="/settings/privacy" className="cpw__back" aria-label="Back">
          &larr;
        </Link>
        <IconDisc icon={downloadIcon} />
        <div className="cpw__header" role="status">
          <h2 className="cpw__title">Your file is ready</h2>
          <p className="cpw__lead">Your data is ready to download as a JSON file.</p>
        </div>
        <div className="dex__callout">
          <span className="dex__callout-bar" aria-hidden="true" />
          <p className="dex__callout-text">{MESSAGES.personalData}</p>
        </div>
        <p className="cpw__note">
          The download only works for a limited time.{expiry ? ` Available until ${expiry}.` : ""}
        </p>
        {downloadError && <InlineError id="dex-download-error">{downloadError}</InlineError>}
        <div className="dex__actions">
          <button type="button" className="cpw__btn" onClick={() => void handleDownload()} disabled={busy}>
            {busy ? "Downloading…" : "Download file"}
          </button>
          <Link to="/settings/privacy" className="dex__btn-secondary">
            Back to Privacy
          </Link>
        </div>
      </div>
    );
  }

  if (view === "expired") {
    return (
      <div className="cpw">
        <Link to="/settings/privacy" className="cpw__back" aria-label="Back">
          &larr;
        </Link>
        <IconDisc icon={alertIcon} />
        <div className="cpw__header" role="status">
          <h2 className="cpw__title">This file isn’t available any more</h2>
          <p className="cpw__lead">Ask for a new copy of your data.</p>
        </div>
        <div className="dex__actions">
          <button type="button" className="cpw__btn" onClick={startOver}>
            Prepare my file
          </button>
          <Link to="/settings/privacy" className="dex__btn-secondary">
            Back to Privacy
          </Link>
        </div>
      </div>
    );
  }

  if (view === "tooMany") {
    return (
      <div className="cpw">
        <Link to="/settings/privacy" className="cpw__back" aria-label="Back">
          &larr;
        </Link>
        <IconDisc icon={alertIcon} />
        <div className="cpw__header" role="status">
          <h2 className="cpw__title">You’ve asked too many times</h2>
          <p className="cpw__lead">You can ask for a copy of your data again later.</p>
        </div>
        <div className="dex__actions">
          <Link to="/settings/privacy" className="cpw__btn">
            Back to Privacy
          </Link>
        </div>
      </div>
    );
  }

  if (view === "failed") {
    return (
      <div className="cpw">
        <Link to="/settings/privacy" className="cpw__back" aria-label="Back">
          &larr;
        </Link>
        <IconDisc icon={alertIcon} />
        <div className="cpw__header" role="status">
          <h2 className="cpw__title">We couldn’t prepare your file</h2>
          <p className="cpw__lead">Something went wrong. Try again.</p>
        </div>
        <div className="dex__actions">
          <button type="button" className="cpw__btn" onClick={startOver}>
            Try again
          </button>
          <Link to="/settings/privacy" className="dex__btn-secondary">
            Back to Privacy
          </Link>
        </div>
      </div>
    );
  }

  // view === "form"
  return (
    <form className="cpw" onSubmit={handleSubmit} noValidate>
      <Link to="/settings/privacy" className="cpw__back" aria-label="Back to Privacy">
        &larr;
      </Link>
      <div className="cpw__header">
        <h2 className="cpw__title">Download my data</h2>
        <p className="cpw__lead">
          Get a copy of your own Soccernity data: your profile, posts, comments, follows and the messages you sent.
        </p>
      </div>

      <div className="cpw__field">
        <label className="cpw__label" htmlFor="dex-password">
          Password
        </label>
        <input
          id="dex-password"
          type="password"
          autoComplete="current-password"
          className={`cpw__input${wrongPassword ? " cpw__input--error" : ""}`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setWrongPassword(false);
          }}
          disabled={busy}
          aria-invalid={wrongPassword ? true : undefined}
          aria-describedby={wrongPassword ? "dex-password-error" : "dex-password-hint"}
        />
        {wrongPassword && <InlineError id="dex-password-error">{MESSAGES.wrongPassword}</InlineError>}
      </div>
      {!wrongPassword && (
        <p className="cpw__hint" id="dex-password-hint">
          Enter your password to continue.
        </p>
      )}

      {formError && <InlineError id="dex-form-error">{formError}</InlineError>}

      <div className="dex__actions">
        <button type="submit" className="cpw__btn" disabled={busy || !password}>
          {busy ? "Preparing…" : "Prepare my file"}
        </button>
        <Link to="/settings/privacy" className="dex__btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
