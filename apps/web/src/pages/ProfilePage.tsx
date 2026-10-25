// Profile view screen. Figma source: "Profile 1" (node 1455:4362),
// "Soccernity-MVP" file (weZWWqggy9j13eX8bhFgs6). Route: /profile.
//
// SCOPE NOTE (flagged, not silently narrowed): the source frame is a full
// social-network profile page -- a cover photo, a "Trending News" sidebar,
// a "Suggested" follows sidebar, a "Fixtures" sidebar, and a large
// "Comments and Replies" mock feed, all populated with static lorem-ipsum
// content with no backing endpoint anywhere in Build Plan Section 4. This
// task's own brief scopes "Profile 1" to "wired to GET /users/:id"
// specifically, and reproducing that mock content as if it were real,
// working functionality (when it isn't backed by any real data source)
// would misrepresent placeholder content as a built feature -- the same
// discipline this codebase already applies elsewhere (e.g. Bio/Location
// in EditProfileModal.tsx are rendered disabled/flagged rather than
// silently accepting input that goes nowhere). What IS built here, for
// real: the profile header (real data from GET /users/:id), and
// Followers/Following as genuinely paginated lists (GET
// /users/:id/followers, GET /users/:id/following -- both real, merged
// Section 4.2 endpoints), matching Section 5.5's lazy-load discipline
// rather than an unbounded fetch. The Posts/Media tabs are shown (Figma
// includes them) but render an honest "not available yet" state --
// Section 4 has no `GET /users/:id/posts` endpoint (`GET /posts/feed` is
// scoped to the caller's own posts + follows, not filterable by an
// arbitrary :id), so there's no real data to show there.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { getUser, getFollowers, getFollowing, UsersApiError, type UserProfile, type FollowUserSummary } from "../api/users";
import { countryName } from "../lib/countries";
import { getStoredAccessToken, decodeAccessToken } from "../lib/session";
import EditProfileModal from "./profile/EditProfileModal";
import "./profile/ProfilePage.css";

type LoadState = "loading" | "loaded" | "error" | "no-session";
type Tab = "posts" | "media";
type FollowPanel = null | "followers" | "following";

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const token = getStoredAccessToken();
  const decoded = token ? decodeAccessToken(token) : null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [editing, setEditing] = useState(false);

  const [followPanel, setFollowPanel] = useState<FollowPanel>(null);
  const [followItems, setFollowItems] = useState<FollowUserSummary[]>([]);
  const [followCursor, setFollowCursor] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!token || !decoded) {
      setLoadState("no-session");
      return;
    }
    setLoadState("loading");
    try {
      const result = await getUser(token, decoded.sub);
      setProfile(result);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [token, decoded?.sub]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function openFollowPanel(panel: "followers" | "following") {
    if (!token || !profile) return;
    setFollowPanel(panel);
    setFollowItems([]);
    setFollowCursor(null);
    setFollowError(null);
    setFollowLoading(true);
    try {
      const fetcher = panel === "followers" ? getFollowers : getFollowing;
      const page = await fetcher(token, profile.id);
      setFollowItems(page.items);
      setFollowCursor(page.nextCursor);
    } catch (err) {
      setFollowError(err instanceof UsersApiError ? err.message : "Couldn't load that list.");
    } finally {
      setFollowLoading(false);
    }
  }

  async function loadMoreFollow() {
    if (!token || !profile || !followPanel || !followCursor) return;
    setFollowLoading(true);
    try {
      const fetcher = followPanel === "followers" ? getFollowers : getFollowing;
      const page = await fetcher(token, profile.id, followCursor);
      setFollowItems((prev) => [...prev, ...page.items]);
      setFollowCursor(page.nextCursor);
    } catch (err) {
      setFollowError(err instanceof UsersApiError ? err.message : "Couldn't load more.");
    } finally {
      setFollowLoading(false);
    }
  }

  if (loadState === "no-session") {
    return (
      <div className="profile-status-message" role="status">
        Log in to view your profile. <Link to="/login">Log in</Link>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="profile-status-message" role="status">
        Loading your profile…
      </div>
    );
  }

  if (loadState === "error" || !profile) {
    return (
      <div className="profile-status-message profile-status-message--error" role="alert">
        Couldn&rsquo;t load your profile. Please try again shortly.
      </div>
    );
  }

  return (
    <div className="profile-page">
      {/* The owner always sees their own cover and picture, including one still
          under review (W5/W6: nobody else sees it until the image check exists). */}
      {profile.cover && <img className="profile-cover" src={profile.cover.url} alt="" />}
      <div className="profile-header">
        <div className="profile-header__avatar" aria-hidden="true">
          {profile.avatar ? (
            <img className="profile-header__avatar-image" src={profile.avatar.url} alt="" />
          ) : (
            initialsFor(profile.publicName)
          )}
        </div>

        <div className="profile-header__body">
          <div className="profile-header__top">
            <div>
              <h1 className="profile-header__name">{profile.publicName}</h1>
              {/* No @username/handle field exists on the User model --
                  email shown instead as the closest real identity data,
                  flagged as a departure from the Figma frame's @handle. */}
              <p className="profile-header__meta">{profile.email}</p>
              <p className="profile-header__meta">
                Member since{" "}
                {new Date(profile.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </p>
            </div>
            <button type="button" className="profile-edit-button" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          </div>

          <div className="profile-header__badges">
            <span className="profile-badge">{profile.role}</span>
            <span className={profile.verificationStatus === "verified" ? "profile-badge" : "profile-badge profile-badge--pending"}>
              {profile.verificationStatus}
            </span>
            {profile.isMinor && (
              <Link to="/guardian-consent" className="profile-badge profile-badge--pending" style={{ textDecoration: "none" }}>
                Guardian consent status
              </Link>
            )}
          </div>

          <div className="profile-header__stats">
            <button type="button" className="profile-stat" onClick={() => openFollowPanel("followers")}>
              Followers <span>(view)</span>
            </button>
            <button type="button" className="profile-stat" onClick={() => openFollowPanel("following")}>
              Following <span>(view)</span>
            </button>
          </div>
        </div>
      </div>

      {followPanel && (
        <div className="profile-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="profile-section__title">{followPanel === "followers" ? "Followers" : "Following"}</h2>
            <button type="button" className="profile-load-more" onClick={() => setFollowPanel(null)}>
              Close
            </button>
          </div>
          {followError && (
            <p className="profile-status-message profile-status-message--error" role="alert">
              {followError}
            </p>
          )}
          {!followError && followItems.length === 0 && !followLoading && (
            <p className="profile-section__body">Nobody here yet.</p>
          )}
          <ul className="profile-follow-list">
            {followItems.map((item) => (
              <li key={item.id}>{item.publicName}</li>
            ))}
          </ul>
          {followLoading && <p className="profile-section__body">Loading…</p>}
          {followCursor && !followLoading && (
            <button type="button" className="profile-load-more" onClick={loadMoreFollow}>
              Load more
            </button>
          )}
        </div>
      )}

      <div className="profile-section">
        <p className="profile-section__title">About</p>
        <div className="profile-field-row">
          <span className="profile-field-row__label">Bio</span>
          <span className={profile.bio ? "profile-field-row__value" : "profile-field-row__value profile-field-row__value--disabled"}>
            {profile.bio ?? "Not set"}
          </span>
        </div>
        <div className="profile-field-row">
          <span className="profile-field-row__label">Country</span>
          <span
            className={
              profile.profileCountry ? "profile-field-row__value" : "profile-field-row__value profile-field-row__value--disabled"
            }
          >
            {profile.profileCountry ? countryName(profile.profileCountry) : "Not set"}
          </span>
        </div>
        <div className="profile-field-row">
          <span className="profile-field-row__label">Preferred Club</span>
          {/* Owner only: no other user's response carries it (Decision Log #411 item 3). */}
          <span
            className={
              profile.preferredClub ? "profile-field-row__value" : "profile-field-row__value profile-field-row__value--disabled"
            }
          >
            {profile.preferredClub ?? "Not set"}
          </span>
        </div>
      </div>

      <div>
        <div className="profile-tabs">
          <button
            type="button"
            className={tab === "posts" ? "profile-tab profile-tab--active" : "profile-tab"}
            onClick={() => setTab("posts")}
          >
            Posts
          </button>
          <button
            type="button"
            className={tab === "media" ? "profile-tab profile-tab--active" : "profile-tab"}
            onClick={() => setTab("media")}
          >
            Media
          </button>
        </div>
        <div className="profile-empty-state">
          {/* Section 4 has no GET /users/:id/posts -- see this file's
              header comment. */}
          Posts for this profile aren&rsquo;t available yet.
        </div>
      </div>

      {editing && token && (
        <EditProfileModal
          accessToken={token}
          user={profile}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setProfile(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
