// Account section page. Figma: "Settings — Account" 2905:4798 (desktop) /
// "Settings — Account — Mobile" 5607:7813 — formerly mis-named "Settings —
// Overview" (Decision Log #230 audit). Rows: Account information · Club
// representation · Change password · Deactivate account · Delete account.
//
// Only the last two have a screen in code (the real deactivate / delete
// flows). The other three are visibly disabled with a "not built yet"
// note rather than linking nowhere: their leaves (Account Info gate+edit
// 2922:6396/2924:7112, Change Password 2924:6870, Club Representation
// 5570:7813) are follow-up PRs, and Account Information's Username/Country
// also lack backing columns (Decision Log #58).
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";

interface Row {
  label: string;
  desc: string;
  to?: string;
}

const ROWS: Row[] = [
  { label: "Account information", desc: "Your name, phone, and email" },
  { label: "Club representation", desc: "Set your represented club" },
  { label: "Change password", desc: "Update your password and sign out other sessions" },
  {
    label: "Deactivate account",
    desc: "Hide your account until you choose to come back",
    to: "/settings/account/deactivate",
  },
  {
    label: "Delete account",
    desc: "Start a 30-day countdown to permanent deletion",
    to: "/settings/account/delete",
  },
];

export default function AccountOverviewPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your account. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Account</h2>
        <p className="settings-page__lead">Manage your account details and status</p>
      </div>
      <ul className="settings-links">
        {ROWS.map((r) => (
          <li key={r.label}>
            {r.to ? (
              <Link to={r.to} className="settings-link">
                <span>
                  <span className="settings-link__label">{r.label}</span>
                  <span className="settings-link__desc">{r.desc}</span>
                </span>
                <span className="settings-link__chev" aria-hidden="true">
                  &rsaquo;
                </span>
              </Link>
            ) : (
              <div className="settings-link settings-link--disabled" aria-disabled="true">
                <span>
                  <span className="settings-link__label">{r.label}</span>
                  <span className="settings-link__desc">{r.desc} — not built yet.</span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
