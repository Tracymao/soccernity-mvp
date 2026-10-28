// The Create Post > Contest tab during the Week 4 upload window (days 22-24): build register B-096
// frames 6660:28736 (desktop) / 6660:35662 (mobile) "Upload Open (finalist)", 6660:31044 / 6660:35699
// "Closed (not a finalist)" (restored, Decision Log #403 item 1), Decision Log #386, #400, #403, #405.
//
// The Contest tab is NOT hidden for a non-finalist: a non-finalist who opens it sees "Finalists only"
// and nothing to upload. A finalist sees the upload form, or -- once uploaded -- a confirmation that
// the entry is in and hidden from everyone but them until the reveal at 00:00 on day 25.
//
// The submit is POST /contest/final-entry, which CREATES the post itself (hidden until the reveal,
// out of the Community feed), so unlike a weekly entry this does not go through POST /posts. It takes the
// id of ONE video the finalist uploaded straight to storage (api/postMedia.ts, useMediaUploads.ts; Figma
// pass Q frames 6850:*, Decision Log #419 item 7). The pasted "Video link" of the earlier stand-in is gone.
// A video that is still being checked still attaches (it is hidden from everyone but its owner until the
// reveal anyway); one that is rejected must be removed and replaced before the window closes.
//
// The upload window's own copy comes from the frame. Nothing here shows the minimum tally (admin
// only, #400 E8) or any engagement count (all engagement on a final entry is locked until the reveal).
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { ContestApiError, submitFinalEntry, type CurrentContestResponse } from "../../api/contest";
import MediaUploadTray from "./MediaUploadTray";
import { useMediaUploads } from "./useMediaUploads";

interface Props {
  accessToken: string;
  authorName: string;
  contest: CurrentContestResponse;
  onSubmitted?: () => void;
}

const MAX_CAPTION = 3000;

export default function FinalWeekPanel({ accessToken, authorName, contest, onSubmitted }: Props) {
  const [text, setText] = useState("");
  const uploads = useMediaUploads({ accessToken, only: "video" });
  const videoInput = useRef<HTMLInputElement>(null);
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

  const caption = text.trim();
  const hasVideo = uploads.mediaIds.length === 1;
  const canSubmit = caption.length > 0 && caption.length <= MAX_CAPTION && hasVideo && uploads.canPublish && !submitting;

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length > 0) uploads.addFiles(picked);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFinalEntry(accessToken, { contentText: caption, mediaId: uploads.mediaIds[0] });
      setDone(true);
      setText("");
      uploads.clear();
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
            <p className="composer__link-label">Choose your final video</p>
            <MediaUploadTray
              variant="final"
              items={uploads.items}
              notice={uploads.notice}
              onCancel={uploads.cancel}
              onRemove={uploads.remove}
              onRetry={uploads.retry}
            />
            {uploads.uploadsUnavailable ? (
              <p className="media-unavailable" role="status">
                <strong>Uploads aren&rsquo;t available right now.</strong> Try again later; the window is open until
                23:59:59 on day 24.
              </p>
            ) : uploads.items.length === 0 ? (
              <>
                <input
                  ref={videoInput}
                  id="final-entry-video"
                  className="media-attach__input"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="final-video-input"
                  onChange={onPicked}
                />
                <button type="button" className="media-attach__btn" onClick={() => videoInput.current?.click()}>
                  &#127909; Choose a video
                </button>
                <p className="composer__note">
                  MP4, WebM or MOV, up to 100 MB and 120 seconds. Upload on days 22&ndash;24; the deadline is 23:59:59 on
                  day 24.
                </p>
                <p className="composer__note">
                  Everything you upload is checked before it can be shown, and your video stays hidden from everyone but
                  you until the reveal. [COPY PENDING LEGAL REVIEW]
                </p>
              </>
            ) : (
              <p className="composer__note">You can replace it until the upload window closes.</p>
            )}
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
