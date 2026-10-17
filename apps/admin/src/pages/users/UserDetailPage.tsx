// User Detail -- the host screen for support actions (B-109, B-104). Figma
// "User Detail" 6647:25540 (W0 pass C), route /users/:id, reached from the
// Users list.
//
// Real data: GET /admin/users/:id (moderator / superadmin, same gate as the
// whole Users section). The record is read through the audited single-user
// endpoint, which ALWAYS includes the decrypted date of birth and writes a
// `user.dob_viewed` audit row for it -- there is no way to ask for the record
// without the date. So loading this screen is itself an audited date-of-birth
// read, even though the Figma frame does not display the date here (the date
// is only shown on the correction form, where the admin needs it). That is a
// property of the endpoint, not of this screen; it is recorded in
// docs/fc2-gates-routing-report.md for founder review.
//
// "Date of birth" -> "Correct date of birth" is real (B-103). "Username ->
// Revoke username" is drawn in the frame but is NOT built here (the revoke
// dialog is B-033's admin-screen leg, outside this change), so it renders
// disabled with a plain note, never as a working control. The rest of the
// record the endpoint returns (guardian summary, age tier, safeguarding
// country, revocation history) has no place in the pass-C frame and is not
// rendered.
import { Link, useParams } from "react-router-dom";
import { getUserDetail } from "../../api/adminUsers";
import { formatDate, useAsyncData } from "./usersShared";
import "./users.css";

export default function UserDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: user, loading, error, reload } = useAsyncData(() => getUserDetail(id), [id]);

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__titles ud-titlerow">
          <h1 className="admin-page-header__title">{user ? user.displayName : "User"}</h1>
          {user ? (
            <span className={`us-pill ${user.accountStatus === "active" ? "us-pill--strong" : "us-pill--soft"}`}>
              {user.accountStatus}
            </span>
          ) : null}
          <Link to="/users" className="us-btn us-btn--outline">
            Back to users
          </Link>
        </div>
      </div>

      <div className="us-page">
        {loading ? <p className="us-loading">Loading user…</p> : null}
        {error ? (
          <p className="us-error" role="alert">
            {error}{" "}
            <button type="button" className="us-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {user ? (
          <>
            <section className="us-card" aria-labelledby="ud-account">
              <h2 className="us-card__title" id="ud-account">
                Account
              </h2>
              <dl className="ud-fields">
                <div className="ud-fields__row">
                  <dt>Display name</dt>
                  <dd>{user.displayName}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Username</dt>
                  <dd>{user.username ? `@${user.username}` : "—"}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Status</dt>
                  <dd>{user.accountStatus}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Joined</dt>
                  <dd>{formatDate(user.createdAt)}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>User ID</dt>
                  <dd className="ud-fields__mono">{user.id}</dd>
                </div>
              </dl>
            </section>

            <section className="us-card" aria-labelledby="ud-actions">
              <h2 className="us-card__title" id="ud-actions">
                Support actions
              </h2>
              <div className="ud-action">
                <div>
                  <p className="ud-action__title">Username</p>
                  <p className="ud-action__body">Remove the username from this account.</p>
                </div>
                <button
                  type="button"
                  className="us-btn us-btn--outline"
                  disabled
                  title="Not built in this screen yet"
                >
                  Revoke username
                </button>
              </div>
              <div className="ud-action ud-action--divided">
                <div>
                  <p className="ud-action__title">Date of birth</p>
                  <p className="ud-action__body">Read-only for the user. Support can correct it.</p>
                </div>
                <Link to={`/users/${user.id}/dob-correction`} className="us-btn us-btn--outline">
                  Correct date of birth
                </Link>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
