// Create-post composer for the Community feed.
//
// Figma source: the dedicated "Create a Post" frames — mobile
// "Community — Create Post — Mobile" (5701:8328, base) / "… Contest Mode — Mobile"
// (5818:8997) / "… Active Contest" (5982:10905) / "… No Active Contest" (5982:10932),
// and the desktop page-with-modal frames "Create a post" (2008:655) / "Create a post -
// For Contest" (2009:2913) / PR G's "Create Post — Desktop — Active/No Active Contest"
// (6171:14797 / 6171:16994). The composer itself carries a "Create a Post | Contest"
// mode-tab row.
//
// MODE-TAB VISIBILITY (Decision Log #148, resolved): the tab row is shown iff an
// ACTIVE CONTEST currently exists — precisely, GET /contest/current's
// `isAcceptingEntries` (cycle 'active' AND a weekly round open right now). It is NOT a
// permanent affordance and NOT driven by which mode the user picked. When no contest
// is accepting entries the composer renders exactly the plain post form, no tabs
// (Figma "No Active Contest").
//
// POST MODE  -> POST /posts               (api/feed.ts createPost). contentText only —
//               there is no media-upload endpoint in Section 4, so the "Attach photos
//               or videos" affordance is rendered present-but-disabled.
// CONTEST MODE -> POST /posts, then POST /contest/entries with the new post's id
//               (api/contest.ts submitContestEntry). Contest entries are video-skill
//               challenges, so the attachment affordance is VIDEO-ONLY here ("Upload a
//               video", disabled — same no-endpoint reason). This video-only framing is
//               scoped to contest entries alone; the plain post form's photo-or-video
//               affordance and every other post type (club posts, etc.) are untouched
//               — there is no server-side media-type restriction and this PR adds none
//               (CreatePostDto's mediaUrls allowlist is unchanged).
//
// Both POST /posts and POST /contest/entries are gated by GuardianConsentGuard in
// addition to JwtAuthGuard, so a restricted-pending minor gets a 403 on either —
// surfaced as an inline message linking to /guardian-consent, not a silent failure.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { createPost, FeedApiError, type CreatedPost } from "../../api/feed";
import { submitContestEntry, ContestApiError, type CurrentContestResponse } from "../../api/contest";

const MAX_LENGTH = 3000;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

type Mode = "post" | "contest";

interface PostComposerProps {
  accessToken: string;
  authorName: string;
  /** GET /contest/current, or null if it hasn't loaded / failed. */
  contest: CurrentContestResponse | null;
  /** Deep-link a starting mode (e.g. /community?compose=contest). Ignored if the tab row isn't shown. */
  initialMode?: Mode;
  onCreated: (post: CreatedPost) => void;
  /** Fired after a contest entry lands, so the parent can refetch GET /contest/current. */
  onContestSubmitted?: () => void;
}

export default function PostComposer({
  accessToken,
  authorName,
  contest,
  initialMode = "post",
  onCreated,
  onContestSubmitted,
}: PostComposerProps) {
  const contestOpen = contest?.isAcceptingEntries === true;
  const alreadyEntered = contest?.callerEntry != null;

  const [mode, setMode] = useState<Mode>(contestOpen && initialMode === "contest" ? "contest" : "post");
  // GET /contest/current usually resolves AFTER this component first mounts, so a
  // ?compose=contest deep-link can't be honoured at useState-init time. Apply it once,
  // when the contest first shows as open, unless the user has already picked a tab.
  const userPickedMode = useRef(false);
  useEffect(() => {
    if (contestOpen && initialMode === "contest" && !userPickedMode.current) {
      setMode("contest");
    }
  }, [contestOpen, initialMode]);

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [contestDone, setContestDone] = useState(false);

  // If the contest closes (or wasn't open to begin with), never sit in contest mode.
  const effectiveMode: Mode = contestOpen ? mode : "post";

  const trimmed = text.trim();
  const over = text.length > MAX_LENGTH;
  const canSubmit = trimmed.length > 0 && !over && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setRestricted(false);

    let post: CreatedPost;
    try {
      post = await createPost(accessToken, { contentText: trimmed });
    } catch (err) {
      if (err instanceof FeedApiError && err.status === 403) setRestricted(true);
      else setError(err instanceof FeedApiError ? err.message : "Couldn't publish that post.");
      setSubmitting(false);
      return;
    }

    if (effectiveMode === "contest") {
      try {
        await submitContestEntry(accessToken, post.id);
        onCreated(post);
        setText("");
        setContestDone(true);
        onContestSubmitted?.();
      } catch (err) {
        // The post itself IS published — show it in the feed rather than lose it —
        // but be honest that it didn't make it into the contest.
        onCreated(post);
        setText("");
        if (err instanceof ContestApiError && err.status === 403) {
          setRestricted(true);
        } else {
          const why = err instanceof ContestApiError ? err.message : "the entry couldn't be submitted";
          setError(`Your post was published, but ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
        }
        onContestSubmitted?.();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    onCreated(post);
    setText("");
    setSubmitting(false);
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {contestOpen && (
        <div className="composer__tabs" role="tablist" aria-label="Post type">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === "post"}
            className={effectiveMode === "post" ? "composer__tab composer__tab--active" : "composer__tab"}
            onClick={() => {
              userPickedMode.current = true;
              setMode("post");
              setError(null);
              setContestDone(false);
            }}
          >
            Create a Post
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === "contest"}
            className={effectiveMode === "contest" ? "composer__tab composer__tab--active" : "composer__tab"}
            onClick={() => {
              userPickedMode.current = true;
              setMode("contest");
              setError(null);
            }}
          >
            Contest
            <span className="composer__tab-badge" title="One contest entry per week">
              1
            </span>
          </button>
        </div>
      )}

      {effectiveMode === "contest" && alreadyEntered ? (
        <p className="composer__contest-done" role="status">
          You&rsquo;ve entered this week&rsquo;s contest (week {contest?.callerEntry?.weekNumber}). Your entry is locked in
          &mdash; you can enter again when next week&rsquo;s round opens.{" "}
          <Link to="/contest">See the contest</Link>.
        </p>
      ) : (
        <div className="composer__row">
          <div className="composer__avatar" aria-hidden="true">
            {initialsFor(authorName)}
          </div>
          <div className="composer__field">
            <textarea
              className="composer__textarea"
              placeholder={
                effectiveMode === "contest" ? "Add a caption for your contest entry…" : "What's happening?"
              }
              aria-label={effectiveMode === "contest" ? "Add a caption for your contest entry" : "What's happening?"}
              value={text}
              maxLength={MAX_LENGTH + 200 /* allow typing slightly over so the counter can warn */}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="composer__foot">
              <div className="composer__attachments" aria-hidden="true">
                {effectiveMode === "contest" ? (
                  // Contest entries are video-skill challenges — video only. No
                  // media-upload endpoint exists, so this is disabled, not faked.
                  <button
                    type="button"
                    className="composer__attach-btn"
                    disabled
                    title="Video uploads for contest entries aren't available yet"
                  >
                    &#127909; Upload a video
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="composer__attach-btn"
                      disabled
                      title="Photo attachments aren't available yet"
                    >
                      &#128247;
                    </button>
                    <button
                      type="button"
                      className="composer__attach-btn"
                      disabled
                      title="Video attachments aren't available yet"
                    >
                      &#127909;
                    </button>
                    <button
                      type="button"
                      className="composer__attach-btn"
                      disabled
                      title="Polls aren't available yet"
                    >
                      &#128202;
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className={over ? "composer__count composer__count--over" : "composer__count"}>
                  {text.length}/{MAX_LENGTH}
                </span>
                <button type="submit" className="composer__submit" disabled={!canSubmit}>
                  {submitting
                    ? effectiveMode === "contest"
                      ? "Submitting…"
                      : "Posting…"
                    : effectiveMode === "contest"
                      ? "Submit entry"
                      : "Post"}
                </button>
              </div>
            </div>
            {effectiveMode === "contest" ? (
              <p className="composer__note">
                Your caption is posted to the feed and entered into this week&rsquo;s contest. Video uploads arrive with a
                later media release.
              </p>
            ) : (
              <p className="composer__note">
                Photo, video and poll attachments will arrive with a later media release.
              </p>
            )}
            {contestDone && (
              <p className="composer__contest-done" role="status">
                Your entry is in for this week&rsquo;s contest. <Link to="/contest">See the contest</Link>.
              </p>
            )}
            {error && (
              <p className="composer__error" role="alert">
                {error}
              </p>
            )}
            {restricted && (
              <p className="composer__error" role="alert">
                Your account is restricted pending guardian consent, so you can&rsquo;t post yet.{" "}
                <Link to="/guardian-consent">Check your consent status</Link>.
              </p>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
