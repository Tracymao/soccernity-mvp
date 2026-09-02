// Create-post composer for the Community feed.
//
// Figma source for the composer itself: the dedicated "Create a Post"
// frame (2008:655), not the Community template frame's own embedded
// (static, illustrative) composer mock -- per this PR's brief. The
// dedicated frame shows an avatar, a "What's happening?" text area, an
// "Add to your post" icon row (photo / video / poll), and a navy "Post"
// button.
//
// Wired to POST /posts (api/feed.ts createPost). CreatePostDto's real
// allowlist is contentText (1-3000, required) plus optional mediaUrls /
// clubPageId / banterRoomId. This composer only sends contentText: there
// is no media-upload endpoint anywhere in Build Plan Section 4 yet, so
// the photo/video/poll affordances the Figma frame shows are rendered
// present-but-disabled with an explanatory note rather than faked --
// the same discipline ProfilePage.tsx / EditProfileModal.tsx apply to
// their own unbacked fields.
//
// POST /posts is gated by GuardianConsentGuard in addition to
// JwtAuthGuard, so a restricted-pending minor gets a 403 here -- surfaced
// as an inline message linking to /guardian-consent, not a silent
// failure.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { createPost, FeedApiError, type CreatedPost } from "../../api/feed";

const MAX_LENGTH = 3000;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

interface PostComposerProps {
  accessToken: string;
  authorName: string;
  onCreated: (post: CreatedPost) => void;
}

export default function PostComposer({ accessToken, authorName, onCreated }: PostComposerProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  const trimmed = text.trim();
  const over = text.length > MAX_LENGTH;
  const canSubmit = trimmed.length > 0 && !over && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setRestricted(false);
    try {
      const post = await createPost(accessToken, { contentText: trimmed });
      onCreated(post);
      setText("");
    } catch (err) {
      if (err instanceof FeedApiError && err.status === 403) {
        setRestricted(true);
      } else {
        setError(err instanceof FeedApiError ? err.message : "Couldn't publish that post.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__row">
        <div className="composer__avatar" aria-hidden="true">
          {initialsFor(authorName)}
        </div>
        <div className="composer__field">
          <textarea
            className="composer__textarea"
            placeholder="What's happening?"
            aria-label="What's happening?"
            value={text}
            maxLength={MAX_LENGTH + 200 /* allow typing slightly over so the counter can warn */}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="composer__foot">
            <div className="composer__attachments" aria-hidden="true">
              {/* No media-upload endpoint exists (Build Plan Section 4) --
                  disabled, not faked. */}
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
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className={over ? "composer__count composer__count--over" : "composer__count"}>
                {text.length}/{MAX_LENGTH}
              </span>
              <button type="submit" className="composer__submit" disabled={!canSubmit}>
                {submitting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
          <p className="composer__note">Photo, video and poll attachments will arrive with a later media release.</p>
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
    </form>
  );
}
