// The pictures and videos of a post, in a feed card (FC10, B-240; Decision Log #419; Figma pass Q frames
// "Author post card" 6849:29675-29813 and "Report on media" 6849:29863-30169).
//
//  - For everyone: an <img> or a <video controls>, never a bare URL.
//  - For the AUTHOR of the post: each file's own status, read from GET /media/uploads/:id (the post payload
//    carries only URLs, so the upload id is read from the URL, lib/media.ts mediaIdFromUrl). A file under
//    review shows "Under review" and who can see it; a rejected file shows its reason and a Remove button.
//    Removing the file is DELETE /media/uploads/:id, which also takes it out of the post, so the author can
//    then choose another picture. The status polls while a file is still being checked.
//  - For anyone else: a Report control on each file (POST /media/:id/report).
//
// Strings that say who can see a file are tagged [COPY PENDING LEGAL REVIEW] (Decision Log #412 item 5) and
// have rows in docs/pending-copy-manifest.md.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  POST_MEDIA_CODES,
  PostMediaApiError,
  deleteUpload,
  getUpload,
  reportMedia,
  type PostMediaView,
} from "../../api/postMedia";
import { isVideoUrl, mediaIdFromUrl } from "../../lib/media";
import "./MediaUpload.css";

const POLL_MS = 5000;

function Media({ url, playVideo }: { url: string; playVideo?: boolean }) {
  if (isVideoUrl(url)) {
    return (
      <video
        className="post__media-video"
        src={url}
        controls
        preload={playVideo ? "metadata" : "none"}
        playsInline
        aria-label="Video attached to this post"
      />
    );
  }
  return <img className="post__media-img" src={url} alt="Picture attached to this post" loading="lazy" />;
}

type ReportStage = "closed" | "confirm" | "done";

function MediaReport({ accessToken, url }: { accessToken: string; url: string }) {
  const id = mediaIdFromUrl(url);
  const [stage, setStage] = useState<ReportStage>("closed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return null;
  const noun = isVideoUrl(url) ? "video" : "picture";

  async function submit() {
    if (submitting || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportMedia(accessToken, id);
      setStage("done");
    } catch (err) {
      if (err instanceof PostMediaApiError && err.status === 404) {
        setError("That file isn’t available to report any more.");
      } else {
        setError(err instanceof PostMediaApiError ? err.message : "Couldn’t send that report.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "done") return <span className="media-report__done">Reported — thanks, our team will review it.</span>;
  if (stage === "closed") {
    return (
      <div className="media-report">
        <button type="button" className="media-report__trigger" onClick={() => setStage("confirm")}>
          Report this {noun}
        </button>
      </div>
    );
  }
  return (
    <div className="media-report">
      <div className="media-report__panel" role="group" aria-label={`Report this ${noun}`}>
        <p>Report this {noun}? Our team will review it.</p>
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
  url,
  onRemoved,
}: {
  accessToken: string;
  url: string;
  onRemoved: (url: string) => void;
}) {
  const id = mediaIdFromUrl(url);
  const [view, setView] = useState<PostMediaView | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
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

  async function remove() {
    if (!id || removing) return;
    setRemoving(true);
    setError(null);
    try {
      await deleteUpload(accessToken, id);
      onRemoved(url);
    } catch (err) {
      setError(
        err instanceof PostMediaApiError && err.code === POST_MEDIA_CODES.mediaInContestEntry
          ? err.message
          : err instanceof PostMediaApiError
            ? err.message
            : "Couldn’t remove that file.",
      );
      setRemoving(false);
    }
  }

  const noun = isVideoUrl(url) ? "video" : "picture";
  const rejected = view?.status === "rejected";

  return (
    <div className="post__media-item" data-media-status={view?.status ?? "unknown"}>
      <Media url={url} />
      {pending && (
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
  urls: string[];
  accessToken: string;
  isOwn: boolean;
  /** The standalone entry page shows the video player straight away. */
  playVideo?: boolean;
}

export default function PostMedia({ urls, accessToken, isOwn, playVideo }: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  const shown = urls.filter((u) => !removed.includes(u));
  if (shown.length === 0) return null;
  return (
    <div className="post__media post-media-author">
      {shown.map((url) =>
        isOwn ? (
          <OwnMedia key={url} accessToken={accessToken} url={url} onRemoved={(u) => setRemoved((r) => [...r, u])} />
        ) : (
          <div key={url} className="post__media-item">
            <Media url={url} playVideo={playVideo} />
            <MediaReport accessToken={accessToken} url={url} />
          </div>
        ),
      )}
    </div>
  );
}
