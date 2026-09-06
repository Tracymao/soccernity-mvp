// Privacy Settings. Figma source: "Settings — Privacy" (6178:14437,
// desktop) / "Settings — Privacy — Mobile" (6185:14547), "Soccernity-MVP"
// file (weZWWqggy9j13eX8bhFgs6). Route: /settings/privacy.
//
// This is the CONSOLIDATED Privacy page (Build Plan Decision Log #222 /
// sprint-2/auth-navbar-delete-account-privacy-consolidation): the old
// "Settings — Privacy & Safety" screen was merged into it, so this one
// page carries both the data/rights rows AND the "Your Post" / "Direct
// Message" interaction-privacy rows. There is no separate
// "Privacy & Safety" screen to build.
//
// FIRST SETTINGS ROUTE IN apps/web. Build Plan Section 6 defers the
// Settings area to Sprint 3/6, and CLAUDE.md confirms no Settings page
// existed in code before this — there is no established "Settings family"
// page pattern to follow. This page sets one, reusing the same --sn-*
// light-theme tokens and centered-column layout as ClubsPage /
// ProfilePage. The desktop Figma frame's left profile mini-card and its
// "Trending News" / "Suggested" sidebars are static lorem-ipsum with no
// backing Section 4 endpoint (identical to ProfilePage's own source
// frame) and are deliberately NOT reproduced.
//
// BACKEND REALITY — checked live against services/api before building
// (see this PR's report + Build Plan Decision Log #223). Almost every
// control on this page has no backend yet; per CLAUDE.md's standing
// discipline (and the task brief's own "blocks on a small backend-api
// addition — flag rather than fake") each is rendered visibly, in a
// disabled state, with a short note — never a control that looks live
// but silently does nothing:
//   - Public profile visibility — NO `User` column, NO endpoint. Toggle
//     disabled.
//   - Download my data — NO data-export / DSAR endpoint. Row disabled.
//   - Your Post / Direct Message — NO post-visibility or DM-permission
//     backend, and the Figma destination sub-pages (2926:8996 /
//     2926:8764) are not converted. Rows disabled.
//   - Account status — "Deactivate account" / "Delete account" link to
//     /settings/deactivate and /settings/delete-account, real routes
//     that are PlaceholderPage stubs today (the K1/K2/K3 deactivation-
//     flow screens are designed + backend-complete but not yet
//     converted). Founder chose stub routes over disabled rows here.
//   - Guardian approval — REAL. GET /auth/guardian-consent/status. Shown
//     only for minors; a 404 from that endpoint means "not a minor" and
//     the row is hidden. "Change guardian email" has no endpoint
//     anywhere (the same gap GuardianConsentPage.tsx already flags) — it
//     renders disabled ("Coming soon"), matching that page's precedent,
//     while the row as a whole links to /guardian-consent (the real
//     minor status page).
//   - Marketing emails — designed as a disabled "Coming soon" row;
//     services/api sends only transactional email. Rendered as designed.
//
// No-session handling mirrors ProfilePage.tsx / ClubsPage.tsx: no stored
// access token → a "log in" prompt, and the API is never called.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AuthApiError, getGuardianConsentStatus, type GuardianConsentStatus } from "../api/auth";
import { getUser, type UserProfile } from "../api/users";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import "./settings/PrivacySettingsPage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type GuardianState =
  | { kind: "hidden" }
  | { kind: "loaded"; status: GuardianConsentStatus }
  | { kind: "error" };

// The Settings category rail (both Figma frames). Only "Privacy and
// safety" has a route today — the others are genuinely unbuilt (not even
// stubs), so they render disabled rather than as links to the 404 page,
// the same treatment navigation.ts gives Messages / Notifications
// (Decision Log #166).
const SETTINGS_CATEGORIES = [
  { label: "Account", current: false },
  { label: "Security and account access", current: false },
  { label: "Privacy and safety", current: true },
  { label: "Notifications", current: false },
  { label: "Display, language and region", current: false },
];

function VisualToggle({ on, label }: { on: boolean; label: string }) {
  // Purely visual, always disabled — none of this page's toggles have a
  // backend. State is signalled by BOTH colour and knob position, never
  // colour alone (Figma "Settings Toggle" component note, 5694:8219).
  return (
    <span
      className={on ? "privacy-toggle privacy-toggle--on" : "privacy-toggle"}
      role="img"
      aria-label={`${label}: ${on ? "on" : "off"} (not adjustable yet)`}
    >
      <span className="privacy-toggle__knob" />
    </span>
  );
}

export default function PrivacySettingsPage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [guardian, setGuardian] = useState<GuardianState>({ kind: "hidden" });

  const load = useCallback(async () => {
    if (!token || !decoded) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const me = await getUser(token, decoded.sub);
      setProfile(me);

      if (me.isMinor) {
        try {
          const status = await getGuardianConsentStatus(token);
          setGuardian({ kind: "loaded", status });
        } catch (err) {
          // A 404 here means "no Guardian row" — i.e. not actually a
          // minor after all (or a data-invariant edge). Either way, hide
          // the row. Any other failure: this caller IS a minor, so show
          // the row with a soft error rather than pretending it doesn't
          // apply to them.
          setGuardian(err instanceof AuthApiError && err.status === 404 ? { kind: "hidden" } : { kind: "error" });
        }
      } else {
        setGuardian({ kind: "hidden" });
      }

      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token, decoded?.sub]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadState === "no-session") {
    return (
      <div className="privacy-status" role="status">
        Log in to manage your privacy settings. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="privacy-status" role="status">
        Loading your settings…
      </div>
    );
  }

  if (loadState === "error" || !profile) {
    return (
      <div className="privacy-status privacy-status--error" role="alert">
        Couldn&rsquo;t load your settings. Please try again shortly.
      </div>
    );
  }

  return (
    <div className="privacy-page">
      <header className="privacy-page__head">
        <h1 className="privacy-page__heading">Settings</h1>
        <nav className="privacy-cats" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((cat) =>
            cat.current ? (
              <span key={cat.label} className="privacy-cats__item privacy-cats__item--current" aria-current="page">
                {cat.label}
              </span>
            ) : (
              <span
                key={cat.label}
                className="privacy-cats__item privacy-cats__item--disabled"
                aria-disabled="true"
                title="Not available yet"
              >
                {cat.label}
              </span>
            ),
          )}
        </nav>
      </header>

      <section className="privacy-section" aria-labelledby="privacy-section-title">
        <div className="privacy-section__head">
          <h2 id="privacy-section-title" className="privacy-section__title">
            Privacy
          </h2>
          <p className="privacy-section__subtitle">
            Control who can see your profile and how your data is used
          </p>
        </div>

        <ul className="privacy-rows">
          {/* Public profile — no backend field/endpoint yet. */}
          <li className="privacy-row privacy-row--disabled">
            <span className="privacy-row__icon" aria-hidden="true">
              ◉
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">Public profile</p>
              <p className="privacy-row__desc">
                When this is off, only people who follow you can see your profile, posts, and activity.
              </p>
              <p className="privacy-row__note">
                Not adjustable yet — profiles are currently visible to all signed-in members. A visibility
                control needs a backend field first.
              </p>
            </div>
            <VisualToggle on label="Public profile" />
          </li>

          {/* Your Post — interaction-privacy sub-page, no backend / no
              converted screen. */}
          <li className="privacy-row privacy-row--disabled">
            <span className="privacy-row__icon" aria-hidden="true">
              ⓘ
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">Your Post</p>
              <p className="privacy-row__desc">Manage information associated with your post.</p>
              <p className="privacy-row__note">Not available yet.</p>
            </div>
            <span className="privacy-row__chevron" aria-hidden="true">
              ›
            </span>
          </li>

          {/* Direct Message — same. */}
          <li className="privacy-row privacy-row--disabled">
            <span className="privacy-row__icon" aria-hidden="true">
              ✉
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">Direct Message</p>
              <p className="privacy-row__desc">Manage who can message you directly.</p>
              <p className="privacy-row__note">Not available yet.</p>
            </div>
            <span className="privacy-row__chevron" aria-hidden="true">
              ›
            </span>
          </li>

          {/* Download my data — no data-export / DSAR endpoint. */}
          <li className="privacy-row privacy-row--disabled">
            <span className="privacy-row__icon" aria-hidden="true">
              ⭳
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">Download my data</p>
              <p className="privacy-row__desc">
                Request a copy of your Soccernity data. We&rsquo;ll email you a link when it&rsquo;s ready.
              </p>
              <p className="privacy-row__note">
                Not available yet — data export needs a backend endpoint first.
              </p>
            </div>
            <span className="privacy-row__chevron" aria-hidden="true">
              ›
            </span>
          </li>

          {/* Account status — real routes (currently stubs). "Active" is
              definitionally true for anyone who can load this page: a
              deactivated / pending-deletion account has its sessions
              revoked and cannot authenticate. */}
          <li className="privacy-row">
            <span className="privacy-row__icon" aria-hidden="true">
              ⊗
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">Account status</p>
              <p className="privacy-row__desc">Active</p>
              <div className="privacy-row__actions">
                <Link to="/settings/deactivate" className="privacy-row__link">
                  Deactivate account&nbsp;›
                </Link>
                <Link to="/settings/delete-account" className="privacy-row__link">
                  Delete account&nbsp;›
                </Link>
              </div>
            </div>
          </li>

          {/* Guardian approval — REAL data, minors only. */}
          {guardian.kind !== "hidden" && (
            <li className="privacy-row">
              <span className="privacy-row__icon" aria-hidden="true">
                ⓘ
              </span>
              <div className="privacy-row__body">
                <p className="privacy-row__title">
                  Guardian approval
                  {guardian.kind === "loaded" && (
                    <span
                      className={
                        guardian.status.consentStatus === "confirmed"
                          ? "privacy-pill privacy-pill--approved"
                          : "privacy-pill"
                      }
                    >
                      {guardian.status.consentStatus === "confirmed" ? "Approved" : "Pending"}
                    </span>
                  )}
                </p>
                {guardian.kind === "error" ? (
                  <p className="privacy-row__desc">Couldn&rsquo;t load your guardian approval status right now.</p>
                ) : (
                  <p className="privacy-row__desc">
                    {guardian.status.consentStatus === "confirmed"
                      ? "Your guardian has approved your account."
                      : `We're waiting for ${guardian.status.guardianEmail} to approve your account.`}{" "}
                    This section is only shown for accounts under 18.
                  </p>
                )}
                <div className="privacy-row__actions">
                  <Link to="/guardian-consent" className="privacy-row__link">
                    View consent status&nbsp;›
                  </Link>
                  {/* No PATCH-guardian-email endpoint exists anywhere in
                      Section 4.1 — same gap GuardianConsentPage.tsx
                      already flags. Disabled, not wired to nothing. */}
                  <span className="privacy-row__link privacy-row__link--disabled" title="Coming soon">
                    Change guardian email&nbsp;›
                  </span>
                </div>
              </div>
            </li>
          )}

          {/* Marketing emails — designed as a disabled "Coming soon" row.
              services/api sends only transactional email. */}
          <li className="privacy-row privacy-row--disabled">
            <span className="privacy-row__icon" aria-hidden="true">
              ⓘ
            </span>
            <div className="privacy-row__body">
              <p className="privacy-row__title">
                Marketing emails
                <span className="privacy-pill">Coming soon</span>
              </p>
              <p className="privacy-row__desc">
                Soccernity only sends essential account emails right now. If we introduce marketing email,
                you&rsquo;ll be able to opt out here.
              </p>
            </div>
            <VisualToggle on={false} label="Marketing emails" />
          </li>
        </ul>
      </section>
    </div>
  );
}
