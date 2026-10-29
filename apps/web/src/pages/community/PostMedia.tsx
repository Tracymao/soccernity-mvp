// The pictures and videos of a post, in a feed card (FC10, B-240; Decision Log #419; Figma pass Q frames
// "Author post card" 6849:29675-29813 and "Report on media" 6849:29863-30169).
//
//  - Ids and kinds come from the post payload's `media: [{ id, kind, viewUrl? }]` (B-259), in the order of
//    `mediaUrls`. Nothing is read out of a URL and the kind is never guessed from a file name.
//  - For everyone: an <img> or a <video controls>, never a bare URL.
//  - For the AUTHOR of the post: each file's own status, read from GET /media/uploads/:id. A file under
//    review shows "Under review" and who can see it; a rejected file shows its reason and a Remove button.
//    A file that is not approved is drawn ONLY through the short-lived signed `viewUrl` (from the payload,
//    refreshed by the status read), never through its public address; if no signed link is available the
//    file is not drawn. Removing the file is DELETE /media/uploads/:id, which also takes it out of the post,
//    so the author can then choose another picture. The status polls while a file is still being checked.
//  - For anyone else: a Report control on each file (POST /media/:id/report) with an optional reason (up to
//    500 characters, shown to moderators only) and a clear state for the per-account daily report limit.
//
// The daily-limit sheet follows the Figma pass S frames 6858:30671 (desktop) and 6858:30747 (mobile): the
// server's own message and NO number, then the line "If this is urgent or involves a child, report the post or
// the person instead." and a secondary button "Report the post or person" (Decision Log #436, B-266). The button
// opens the EXISTING general report flow (ReportAction, POST /reports, the post and its author as targets, as
// the post card offers it); POST /reports has no per-account daily cap and stays open to a restricted-pending
// account, so it is the way out for someone at the media-report limit. It makes no request of its own.
//
// Strings that say who can see a file, or who sees a reporter's reason, are tagged [COPY PENDING LEGAL REVIEW] (Decision Log #412 item 5) and
// have rows in docs/pending-copy-manifest.md.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MEDIA_REPORT_REASON_MAX_LENGTH,
  POST_MEDIA_CODES,
  PostMediaApiError,
  deleteUpload,
  getUpload,
  reportMedia,
  type PostMediaView,
} from "../../api/postMedia";
import type { FeedPostMedia } from "../../api/feed";
import ReportAction from "./ReportAction";
import "./MediaUpload.css";

const POLL_MS = 5000;
// How many times a file's signed link is re-fetched after the browser fails to load it (it lasts 5 minutes).
const MAX_LINK_REFRESHES = 2;

function Media({
  kind,
  src,
  playVideo,
  onLoadError,
}: {
  kind: FeedPostMedia["kind"];
  src: string;
  playVideo?: boolean;
  onLoadError?: () => void;
}) {
  if (kind === "video") {
    return (
      <video
        className="post__media-video"
        src={src}
        controls
        preload={playVideo ? "metadata" : "none"}
        playsInline
        aria-label="Video attached to this post"
        onError={onLoadError}
      />
    );
  }
  return <img className="post__media-img" src={src} alt="Picture attached to this post" loading="lazy" onError={onLoadError} />;
}

type ReportStage = "closed" | "confirm" | "done" | "limit" | "urgent";

function MediaReport({
  accessToken,
  item,
  postId,
  authorId,
}: {
  accessToken: string;
  item: FeedPostMedia;
  postId: string;
  authorId: string;
}) {
  const [stage, setStage] = useState<ReportStage>("closed");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const noun = item.kind === "video" ? "video" : "picture";
  const urgentButton = useRef<HTMLButtonElement>(null);

  // "Report the post or person" is the first action of the limit sheet, so it takes focus when the sheet appears.
  useEffect(() => {
    if (stage === "limit") urgentButton.current?.focus();
  }, [stage]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportMedia(accessToken, item.id, reason);
      setStage("done");
    } catch (err) {
      if (err instanceof PostMediaApiError && err.code === POST_MEDIA_CODES.reportDailyLimit) {
        setLimitMessage(err.message);
        setStage("limit");
      } else if (err instanceof PostMediaApiError && err.status === 404) {
        setError("That file isn’t available to report any more.");
      } else {
        setError(err instanceof PostMediaApiError ? err.message : "Couldn’t send that report.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "done") return <span className="media-report__done">Reported — thanks, our team will review it.</span>;
  if (stage === "limit") {
    return (
      <div className="media-report">
        <div className="media-report__panel" role="status" aria-label="Report limit reached">
          <p className="media-report__limit-title">You’ve reached today’s report limit</p>
          {limitMessage && <p>{limitMessage}</p>}
          <p>If this is urgent or involves a child, report the post or the person instead.</p>
          <div className="media-report__buttons">
            <button type="button" className="media-item__action" onClick={() => setStage("closed")}>
              Close
            </button>
            <button ref={urgentButton} type="button" className="media-item__action" onClick={() => setStage("urgent")}>
              Report the post or person
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (stage === "urgent") {
    return (
      <div className="media-report">
        <ReportAction
          accessToken={accessToken}
          startOpen
          onCancel={() => setStage("limit")}
          targets={[
            { label: "Report post", targetType: "post", targetId: postId },
            { label: "Report user", targetType: "user", targetId: authorId },
          ]}
        />
      </div>
    );
  }
  if (stage === "closed") {
    return (
      <div className="media-report">
        <button type="button" className="media-report__trigger" onClick={() => setStage("confirm")}>
          Report this {noun}
        </button>
      </div>
    );
  }
  const reasonId = `media-report-reason-${item.id}`;
  return (
    <div className="media-report">
      <div className="media-report__panel" role="group" aria-label={`Report this ${noun}`}>
        <p>Report this {noun}? Our team will review it.</p>
        <label htmlFor={reasonId} className="media-report__label">
          Why are you reporting it? (optional)
        </label>
        <textarea
          id={reasonId}
          className="media-report__reason"
          value={reason}
          maxLength={MEDIA_REPORT_REASON_MAX_LENGTH}
          rows={3}
          onChange={(event) => setReason(event.target.value)}
          disabled={submitting}
        />
        <p className="media-report__hint">
          Only our moderators see your reason, not the person who posted this. [COPY PENDING LEGAL REVIEW]
        </p>
        <p className="media-report__counter" aria-live="polite">
          {reason.length} / {MEDIA_REPORT_REASON_MAX_LENGTH}
        </p>
        {error && (
          <p role="alert" className="media-item__error">
            {error}
          </p>
        )}
        <div className="media-report__buttons">
          <button type="button" className="media-item__action media-item__action--primary" onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Submit report"}
          </button>
          <button type="button" className="media-item__action" onClick={() => setStage("closed")} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnMedia({
  accessToken,
  item,
  publicUrl,
  onRemoved,
}: {
  accessToken: string;
  item: FeedPostMedia;
  publicUrl: string | null;
  onRemoved: (id: string) => void;
}) {
  const id = item.id;
  const [view, setView] = useState<PostMediaView | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const refreshes = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await getUpload(accessToken, id);
      if (alive.current) setView(next);
    } catch {
      /* a failed status read just leaves the file shown without a status */
    }
  }, [accessToken, id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const pending = view?.status === "pending";
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  // The signed link lasts 5 minutes. If the browser cannot load the file (the link ran out), ask for a fresh
  // one, a couple of times at most.
  function refreshLink() {
    if (refreshes.current >= MAX_LINK_REFRESHES) return;
    refreshes.current += 1;
    void load();
  }

  async function remove() {
    if (removing) return;
    setRemoving(true);
    setError(null);
    try {
      await deleteUpload(accessToken, id);
      onRemoved(id);
    } catch (err) {
      setError(err instanceof PostMediaApiError ? err.message : "Couldn’t remove that file.");
      setRemoving(false);
    }
  }

  const noun = item.kind === "video" ? "video" : "picture";
  const status = view?.status ?? null;
  const pendingNow = status === "pending";
  const rejected = status === "rejected";

  // Which address to draw. An approved file is public: its public address. Anything not approved is drawn
  // ONLY through a signed link (the status read's, else the payload's). Before the status read arrives, the
  // payload decides: a file with a signed link is not public yet; a file without one is.
  const signed = view?.viewUrl ?? item.viewUrl ?? null;
  const notPublicYet = status ? status !== "approved" : Boolean(item.viewUrl);
  const src = notPublicYet ? signed : (view?.url ?? publicUrl);

  return (
    <div className="post__media-item" data-media-status={status ?? "unknown"}>
      {src && <Media kind={item.kind} src={src} onLoadError={notPublicYet ? refreshLink : undefined} />}
      {pendingNow && (
        <div className="post-media-author__row">
          <div className="media-item__body">
            <p className="media-item__name">
              <span className="media-chip">Under review</span>
            </p>
            <p className="media-item__hint">
              {noun === "video"
                ? "Only you can see this post until its video has been checked. [COPY PENDING LEGAL REVIEW]"
                : "Only you can see this post until its pictures have been checked. [COPY PENDING LEGAL REVIEW]"}
            </p>
          </div>
        </div>
      )}
      {rejected && (
        <div className="post-media-author__row post-media-author__row--bad">
          <div className="media-item__body">
            <p className="media-item__name">
              <span className="media-chip media-chip--bad">{noun === "video" ? "Video not approved" : "Picture not approved"}</span>
            </p>
            <p className="media-item__title" role="alert">
              This {noun} wasn’t approved
            </p>
            {view?.rejectionReason && <p className="media-item__reason">{view.rejectionReason}</p>}
            <p className="media-item__hint">
              {noun === "video"
                ? "Your post stays hidden from other people until every video has been approved. Remove this video or choose another. [COPY PENDING LEGAL REVIEW]"
                : "Your post stays hidden from other people until every picture has been approved. Remove this picture or choose another. [COPY PENDING LEGAL REVIEW]"}
            </p>
            {error && (
              <p className="media-item__error" role="alert">
                {error}
              </p>
            )}
          </div>
          <button type="button" className="media-item__action" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : `Remove ${noun}`}
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  /** The post's `media` (ids, kinds, the author's signed links). */
  media: FeedPostMedia[];
  /** The post's `mediaUrls`: the public address of each file, in the same order as `media`. */
  urls: string[];
  accessToken: string;
  /** The post the files belong to and its author: the targets of the general report offered at the daily limit. */
  postId: string;
  authorId: string;
  isOwn: boolean;
  /** The standalone entry page shows the video player straight away. */
  playVideo?: boolean;
}

export default function PostMedia({ media, urls, accessToken, postId, authorId, isOwn, playVideo }: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  const shown = media
    .map((item, index) => ({ item, publicUrl: urls[index] ?? null }))
    .filter((m) => !removed.includes(m.item.id));
  if (shown.length === 0) return null;
  return (
    <div className="post__media post-media-author">
      {shown.map(({ item, publicUrl }) =>
        isOwn ? (
          <OwnMedia
            key={item.id}
            accessToken={accessToken}
            item={item}
            publicUrl={publicUrl}
            onRemoved={(id) => setRemoved((r) => [...r, id])}
          />
        ) : (
          <div key={item.id} className="post__media-item">
            {publicUrl && <Media kind={item.kind} src={publicUrl} playVideo={playVideo} />}
            <MediaReport accessToken={accessToken} item={item} postId={postId} authorId={authorId} />
          </div>
        ),
      )}
    </div>
  );
}
