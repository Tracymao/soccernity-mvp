// Another person's profile (build register B-082, B-108; Decision Log #371,
// #396, #402 item 4, #403 items 12 and 17, #404 item 8, #406 item 12, #411
// item 5). Route: /users/:userId. Figma: other-user profile 6747:28894
// (desktop), 6669:27188 (mobile, with the open "..." menu), Block confirmation
// 6655:29600 (mobile) / 6655:27355 (desktop).
//
// Data: GET /users/:id/public-profile (any signed-in viewer): public name, bio,
// the optional profile country (only when filled in), the APPROVED avatar and
// cover (nothing is approved until the image check exists, so both are null
// today), a minor's guardian contact, and the viewer's own `isFollowing` and
// `viewerHasBlocked`. The preferred club is never returned (owner only).
//
// Not built here, on purpose: follower / following counts and the Posts / Media
// tabs. No endpoint returns another user's counts or posts (GET /posts/feed is
// scoped to the caller's own and followed users' posts), so there is nothing
// true to show; the page says so instead of faking either.
//
// BLOCK (all of it server-enforced; this page only offers it):
//   - "..." menu: Copy Profile Link, Block {name}. Block opens a confirmation
//     with an optional private note ("Reason (optional)", kept for the blocker
//     only); only "Block" calls the API. The dialog states what blocking does and
//     that the other person is not told.
//   - When the VIEWER has blocked this person the page shows "You blocked
//     {name}" and Unblock; Follow and Message are not offered.
//   - A viewer who has been blocked by the owner gets the SAME 404 a
//     non-existent profile gets, and this page renders the SAME generic "Page
//     not found" view for it (#406 item 12): nothing on screen distinguishes
//     the two.
//   - A 403 `you_blocked_this_user` (follow or message while blocked, only ever
//     received by the blocker) shows the server's own message.
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  UsersApiError,
  blockUser,
  followUser,
  getPublicProfile,
  unblockUser,
  unfollowUser,
  type PublicProfile,
} from "../api/users";
import { MessagingApiError, startConversation } from "../api/messaging";
import { countryName } from "../lib/countries";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import NotFoundPage from "./NotFoundPage";
import PinnedEntry from "./community/PinnedEntry";
import { initialsFor } from "./profile/profileFields";
import "./profile/ProfilePage.css";
import "./profile/OtherProfilePage.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function OtherProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : undefined;

  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !userId || userId === myId) return;
    setState("loading");
    try {
      const result = await getPublicProfile(token, userId);
      setProfile(result);
      setFollowing(result.isFollowing);
      setBlocked(result.viewerHasBlocked);
      setState("loaded");
    } catch (err) {
      setState(err instanceof UsersApiError && err.status === 404 ? "not-found" : "error");
    }
  }, [token, userId, myId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return (
      <div className="profile-status-message" role="status">
        Log in to view this profile. <Link to="/login">Log in</Link>
      </div>
    );
  }
  if (userId && myId && userId === myId) return <Navigate to="/profile" replace />;

  if (state === "loading") {
    return (
      <div className="profile-status-message" role="status">
        Loading this profile…
      </div>
    );
  }
  // The same page for a missing profile and for "you have been blocked".
  if (state === "not-found") return <NotFoundPage />;
  if (state === "error" || !profile || !userId) {
    return (
      <div className="profile-status-message profile-status-message--error" role="alert">
        Couldn&rsquo;t load this profile. Please try again shortly.
      </div>
    );
  }

  const person = profile;
  const accessToken = token;
  const targetId = userId;

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = following ? await unfollowUser(accessToken, targetId) : await followUser(accessToken, targetId);
      setFollowing(result.following);
    } catch (err) {
      setActionError(err instanceof UsersApiError ? err.message : "Couldn't update that follow.");
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { conversation } = await startConversation(accessToken, targetId);
      navigate(`/messages/${conversation.id}`, { state: { otherParticipant: conversation.otherParticipant } });
    } catch (err) {
      setActionError(err instanceof MessagingApiError ? err.message : "Couldn't start that conversation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setMenuOpen(false);
    const url = `${window.location.origin}/users/${targetId}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Profile link copied.");
    } catch {
      setNotice(url);
    }
  }

  async function confirmBlock() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await blockUser(accessToken, targetId, reason);
      setBlocked(true);
      setFollowing(false);
      setBlockOpen(false);
      setReason("");
      setNotice(null);
    } catch (err) {
      setActionError(err instanceof UsersApiError ? err.message : "Couldn't block that user.");
    } finally {
      setBusy(false);
    }
  }

  async function unblock() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await unblockUser(accessToken, targetId);
      setBlocked(false);
    } catch (err) {
      setActionError(err instanceof UsersApiError ? err.message : "Couldn't unblock that user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page other-profile">
      {person.coverUrl && <img className="profile-cover" src={person.coverUrl} alt="" />}
      <div className="profile-header">
        <div className="profile-header__avatar" aria-hidden="true">
          {person.avatarUrl ? (
            <img className="profile-header__avatar-image" src={person.avatarUrl} alt="" />
          ) : (
            initialsFor(person.publicName)
          )}
        </div>

        <div className="profile-header__body">
          <div className="profile-header__top">
            <div>
              <h1 className="profile-header__name">{person.publicName}</h1>
              {person.country && <p className="profile-header__meta">{countryName(person.country)}</p>}
            </div>

            {!blocked && (
              <div className="other-profile__actions">
                <button
                  type="button"
                  className="other-profile__icon-button"
                  onClick={() => void message()}
                  disabled={busy}
                  aria-label="Message"
                >
                  ✉
                </button>
                <div className="other-profile__menu-wrap">
                  <button
                    type="button"
                    className="other-profile__icon-button"
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-label="More options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <ul className="other-profile__menu" role="menu">
                      <li role="none">
                        <button type="button" role="menuitem" onClick={() => void copyLink()}>
                          Copy Profile Link
                        </button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="other-profile__menu-block"
                          onClick={() => {
                            setMenuOpen(false);
                            setActionError(null);
                            setBlockOpen(true);
                          }}
                        >
                          Block {person.publicName}
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className={following ? "profile-edit-button other-profile__follow--on" : "profile-edit-button"}
                  onClick={() => void toggleFollow()}
                  disabled={busy}
                  aria-pressed={following}
                >
                  {following ? "Following" : "Follow"}
                </button>
              </div>
            )}
          </div>

          {person.bio && <p className="other-profile__bio">{person.bio}</p>}

          {person.guardianContact && (
            <p className="profile-header__meta">
              {person.guardianContact.label}:{" "}
              <a href={`mailto:${person.guardianContact.email}`}>{person.guardianContact.email}</a>
            </p>
          )}
        </div>
      </div>

      {blocked && (
        <div className="profile-section other-profile__blocked" role="status">
          <p className="profile-section__title">You blocked {person.publicName}</p>
          <p className="profile-section__body">
            You can&rsquo;t follow or message them, and you won&rsquo;t see their posts. Unblocking does not restore
            follows.
          </p>
          <button type="button" className="profile-load-more" onClick={() => void unblock()} disabled={busy}>
            Unblock {person.publicName}
          </button>
        </div>
      )}

      {notice && (
        <p className="profile-status-message" role="status">
          {notice}
        </p>
      )}
      {actionError && !blockOpen && (
        <p className="profile-status-message profile-status-message--error" role="alert">
          {actionError}
        </p>
      )}

      {token && myId && userId && (
        <PinnedEntry accessToken={token} userId={userId} currentUserId={myId} />
      )}

      <div className="profile-empty-state">
        {/* No endpoint returns another user's posts or counts -- see the header comment. */}
        Posts and follower counts for this profile aren&rsquo;t available yet.
      </div>

      {blockOpen && (
        <div className="other-profile__scrim" onClick={() => !busy && setBlockOpen(false)}>
          <div
            className="other-profile__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="block-dialog-title" className="other-profile__dialog-title">
              Block {person.publicName}?
            </h2>
            <p className="other-profile__dialog-body">Blocking {person.publicName}:</p>
            <ul className="other-profile__dialog-list">
              <li>hides their posts, comments, likes and search results from you, and yours from them</li>
              <li>stops messages in both directions</li>
              <li>removes follows in both directions</li>
            </ul>
            <p className="other-profile__dialog-body">
              You can undo it at any time in Settings; unblocking does not restore follows. They are not told.
              [COPY PENDING LEGAL REVIEW]
            </p>
            <label className="other-profile__dialog-label" htmlFor="block-reason">
              Reason (optional)
            </label>
            <input
              id="block-reason"
              className="other-profile__dialog-input"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Add a note for yourself"
            />
            {actionError && (
              <p className="profile-status-message profile-status-message--error" role="alert">
                {actionError}
              </p>
            )}
            <div className="other-profile__dialog-actions">
              <button type="button" className="profile-load-more" onClick={() => setBlockOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="profile-edit-button" onClick={() => void confirmBlock()} disabled={busy}>
                {busy ? "Blocking…" : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
