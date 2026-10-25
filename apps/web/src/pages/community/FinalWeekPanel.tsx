// The Create Post > Contest tab during the Week 4 upload window (days 22-24): build register B-096
// frames 6660:28736 (desktop) / 6660:35662 (mobile) "Upload Open (finalist)", 6660:31044 / 6660:35699
// "Closed (not a finalist)" (restored, Decision Log #403 item 1), Decision Log #386, #400, #403, #405.
//
// The Contest tab is NOT hidden for a non-finalist: a non-finalist who opens it sees "Finalists only"
// and nothing to upload. A finalist sees the upload form, or -- once uploaded -- a confirmation that
// the entry is in and hidden from everyone but them until the reveal at 00:00 on day 25.
//
// The submit is POST /contest/final-entry, which CREATES the post itself (hidden until the reveal,
// out of the Community feed), so unlike a weekly entry this does not go through POST /posts. It needs
// at least one media URL, and there is NO upload endpoint for posts anywhere, so the frame's "Upload
// file" control is a "Video link" field: paste the web address of the video. This is a stand-in for
// a real upload (not built), named plainly on screen.
//
// The upload window's own copy comes from the frame. Nothing here shows the minimum tally (admin
// only, #400 E8) or any engagement count (all engagement on a final entry is locked until the reveal).
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ContestApiError, submitFinalEntry, type CurrentContestResponse } from "../../api/contest";

interface Props {
  accessToken: string;
  authorName: string;
  contest: CurrentContestResponse;
  onSubmitted?: () => void;
}

const MAX_CAPTION = 3000;

export default function FinalWeekPanel({ accessToken, authorName, contest, onSubmitted }: Props) {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isFinalist = contest.callerIsFinalist;

  if (!isFinalist) {
    return (
      <div className="composer__final">
        <div className="composer__banner" role="status">
          <p className="composer__banner-title">WEEK 4 FINAL · FINALISTS ONLY</p>
          <p className="composer__banner-body">
            Only the finalists can upload to the Contest tab during the Week 4 upload window (days 22&ndash;24).
          </p>
        </div>
        <p className="composer__note">This portal is open to finalists only.</p>
      </div>
    );
  }

  if (contest.callerFinalEntry || done) {
    return (
      <div className="composer__final">
        <p className="composer__contest-done" role="status">
          Your final entry is in. Only you can see it until the reveal at 00:00 on day 25.{" "}
          <Link to="/contest">See the contest</Link>.
        </p>
      </div>
    );
  }

  const url = link.trim();
  const caption = text.trim();
  const validLink = /^https?:\/\/\S+$/i.test(url);
  const canSubmit = caption.length > 0 && caption.length <= MAX_CAPTION && validLink && !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFinalEntry(accessToken, { contentText: caption, mediaUrls: [url] });
      setDone(true);
      setText("");
      setLink("");
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof ContestApiError ? err.message : "Couldn't submit your final entry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="composer__final">
      <div className="composer__banner" role="status">
        <p className="composer__banner-title">WEEK 4 FINAL · UPLOAD WINDOW OPEN</p>
        <p className="composer__banner-body">
          Finalists only. Upload a new video on days 22&ndash;24, deadline 23:59:59 on day 24. Hidden from everyone
          but you until the reveal at 00:00 on day 25.
        </p>
      </div>
      <form className="composer__final-form" onSubmit={handleSubmit}>
        <div className="composer__row">
          <div className="composer__avatar" aria-hidden="true">
            {authorName
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((part) => part[0]?.toUpperCase())
              .slice(0, 2)
              .join("") || "?"}
          </div>
          <div className="composer__field">
            <textarea
              className="composer__textarea"
              placeholder="Add a caption for your final entry…"
              aria-label="Add a caption for your final entry"
              value={text}
              maxLength={MAX_CAPTION}
              onChange={(event) => setText(event.target.value)}
            />
            <label className="composer__link-label" htmlFor="final-entry-video">
              Video link
            </label>
            <input
              id="final-entry-video"
              className="composer__link-input"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              autoComplete="off"
            />
            <p className="composer__note">
              File uploads aren&rsquo;t available yet, so paste the web address of your video. It needs to start with
              https://.
            </p>
            <div className="composer__foot">
              <span />
              <button type="submit" className="composer__submit" disabled={!canSubmit}>
                {submitting ? "Submitting…" : "Submit entry"}
              </button>
            </div>
            {error && (
              <p className="composer__error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
