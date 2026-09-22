// Muted accounts leaf. Figma: "Settings — Muted accounts" 2926:9482
// (desktop, formerly "Settings — Mute New Accounts" — renamed by
// sprint-2/settings-duplicate-clusters-consolidation, Decision Log
// #230/#247, decision #5: the screen covers three groups, not just "new
// accounts", so "Muted accounts" fits better) / "…— Mobile" 5696:8307.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22). Row set matches exactly: "People you don't follow",
// "People who don't follow you", "People with a new account" — label
// only, no row has ANY description text on either breakpoint (the
// previously-invented per-row desc for each was removed rather than
// corrected, same fix EmailNotificationsPage.tsx's sub-rows got; Row.desc
// is now optional, rendered only when present). Both breakpoints' own
// literal header node text is the STALE pre-rename "Mute notifications
// from people" (Decision Log #230/#247 renamed the section, but the
// frame's on-screen heading text was never updated to match — the exact
// same drift class SecurityOverviewPage.tsx's own h2 fix already
// corrected for its section). "Muted accounts" (already in code, matches
// the rail label) is kept as the real h2, not the stale text. Lead fixed:
// "Mute notifications from people:" (a made-up repurposing of that stale
// heading text as a subtitle, with an invented trailing colon) → mobile's
// real subtitle "Choose whose notifications you don't want to see."
// (desktop has no separate subtitle at all — just the one stale heading
// line, then straight into the rows).
//
// NO LIVE MUTE/BLOCK BACKEND EXISTS. Checked directly: no mute or block
// concept anywhere in services/api (grep across services/api/src for
// "\bmute|\bblock(ed)?User" returns nothing) — there is no per-caller
// content-muting mechanism at all, only the unrelated admin-side
// account-suspension flag (Decision Log #303). Renders visible,
// PERMANENTLY DISABLED, with a note — same precedent as every other
// backend-pending Settings control in this app.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsNotificationsPage.css";

function DisabledToggle({ label }: { label: string }) {
  return (
    <span className="notif-toggle" role="img" aria-label={`${label}: off (not adjustable yet)`}>
      <span className="notif-toggle__knob" />
    </span>
  );
}

interface Row {
  id: string;
  label: string;
  desc?: string;
}

const ROWS: Row[] = [
  { id: "not-following", label: "People you don't follow" },
  { id: "not-followers", label: "People who don't follow you" },
  { id: "new-accounts", label: "People with a new account" },
];

export default function MutedAccountsPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage muted accounts. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Muted accounts</h2>
        <p className="settings-page__lead">
          Choose whose notifications you don&rsquo;t want to see.
        </p>
      </div>

      <ul className="notif-rows">
        {ROWS.map((r) => (
          <li key={r.id} className="notif-row">
            <div className="notif-row__body">
              <p className="notif-row__title">{r.label}</p>
              {r.desc ? <p className="notif-row__desc">{r.desc}</p> : null}
              <p className="notif-row__note">
                Not adjustable yet — muting isn&rsquo;t available yet. This needs a backend
                notification-preferences module first.
              </p>
            </div>
            <DisabledToggle label={r.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}
