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
// PRIVATE PROFILE (build register B-060, founder decision 2026-11-08; backend PR #689; Figma PV1 7015:58577
// mobile, PV5 7015:58750 desktop). When the owner turned "Public profile" off and the viewer is neither the
// owner nor a follower, `isPrivate` is true and the response is the minimal card only. The page then draws
// just: a neutral tinted band in place of the cover, the avatar, the public name, Follow, and "This profile
// is private" with one tagged sentence. NOTHING else of the profile: no bio, country, guardian contact,
// pinned entry, counts or posts, and no Message button. After a successful Follow the profile is read again
// (silently) so the full view appears; Following is instant, there is no approval step.
//
// ADOPTED DEFAULT, founder-veto-able, and an OVERRIDE OF THE FRAME: the Figma card hides the "..." menu, but
// this page keeps a small one on the private card with ONLY "Report user" and "Block {name}". A person who can
// see nothing but a name and a picture must still be able to report or block them (a safeguarding reason),
// and both actions work without seeing the profile. Copy Profile Link and Message are not offered there.
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
  followUser,
  getPublicProfile,
  unblockUser,
  unfollowUser,
  type PublicProfile,
} from "../api/users";
import { MessagingApiError, startConversation } from "../api/messaging";
import { countryName } from "../lib/countries";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";
import BlockUserDialog from "../components/block/BlockUserDialog";
import ReportAction from "./community/ReportAction";
import NotFoundPage from "./NotFoundPage";
import PinnedEntry from "./community/PinnedEntry";
import { initialsFor } from "./profile/profileFields";
import "./profile/ProfilePage.css";
import "./profile/OtherProfilePage.css";

type LoadState = "loading" | "loaded" | "not-found" | "error";

// The private-card callout (Figma PV1 / PV5). The second sentence is tagged exactly as the frame tags it
// (B-124, docs/pending-copy-manifest.md).
export const PRIVATE_PROFILE_TITLE = "This profile is private";
export const PRIVATE_PROFILE_BODY = "Follow to see their profile, posts and activity. [COPY PENDING LEGAL REVIEW]";

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
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // `silent` reads the profile again WITHOUT the "Loading…" screen (used after a follow or unfollow). It
  // reports whether the read worked; on a failure the page keeps what it was showing.
  const load = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!token || !userId || userId === myId) return false;
      if (!silent) setState("loading");
      try {
        const result = await getPublicProfile(token, userId);
        setProfile(result);
        setFollowing(result.isFollowing);
        setBlocked(result.viewerHasBlocked);
        setState("loaded");
        return true;
      } catch (err) {
        if (!silent) setState(err instanceof UsersApiError && err.status === 404 ? "not-found" : "error");
        return false;
      }
    },
    [token, userId, myId],
  );

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
      // The view can change with the follow: following a private profile reveals it, and unfollowing a
      // private person's profile hides it again. Read it again (silently). On a public profile a follow
      // changes nothing, so nothing is requested.
      if (person.isPrivate || !result.following) {
        const refreshed = await load(true);
        if (!refreshed && person.isPrivate) {
          setActionError("You're now following them, but we couldn't refresh the profile. Reload the page.");
        }
      }
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

  // The private card (B-060, Figma PV1 / PV5): the minimal view for a non-follower. Only what the server
  // returned for it is drawn; the cover photo is replaced by the neutral tinted band, and nothing about
  // the profile itself (bio, country, guardian contact, pinned entry, counts, posts) is rendered.
  if (person.isPrivate) {
    return (
      <div className="profile-page other-profile other-profile--private" data-testid="private-profile">
        <div className="other-profile__private-band" aria-hidden="true" />
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
              </div>

              {!blocked && (
                <div className="other-profile__actions">
                  {/* ONLY Report user and Block: see the header comment (override of the frame). */}
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
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              setReportOpen(true);
                            }}
                          >
                            Report user
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
                    className="profile-edit-button"
                    onClick={() => void toggleFollow()}
                    disabled={busy}
                    aria-pressed={following}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {blocked ? (
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
        ) : (
          <div className="profile-section other-profile__private-note">
            <p className="profile-section__title">{PRIVATE_PROFILE_TITLE}</p>
            <p className="profile-section__body">{PRIVATE_PROFILE_BODY}</p>
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

        {reportOpen && (
          <ReportAction
            accessToken={accessToken}
            targets={[{ label: "Report user", targetType: "user", targetId }]}
            startOpen
            onCancel={() => setReportOpen(false)}
            onFinished={() => setReportOpen(false)}
          />
        )}

        {blockOpen && (
          <BlockUserDialog
            accessToken={accessToken}
            userId={targetId}
            name={person.publicName}
            onClose={() => setBlockOpen(false)}
            onBlocked={() => {
              setBlocked(true);
              setFollowing(false);
              setBlockOpen(false);
              setNotice(null);
            }}
          />
        )}
      </div>
    );
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

      {blockOpen && token && (
        <BlockUserDialog
          accessToken={token}
          userId={targetId}
          name={person.publicName}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => {
            setBlocked(true);
            setFollowing(false);
            setBlockOpen(false);
            setNotice(null);
          }}
        />
      )}
    </div>
  );
}
