// The files a person has chosen for a post or a Week 4 final entry, in the states the Figma pass Q frames
// draw (composer 02-10 desktop/mobile, contest final entry 02-05): uploading with progress and Cancel,
// checking, approved, not approved with its reason, and the upload errors with Try again.
//
// Tagged strings ([COPY PENDING LEGAL REVIEW], Decision Log #412 item 5) are the ones that say who can see an
// upload or what is checked; each has a row in docs/pending-copy-manifest.md. Everything else is
// functional wording from the frames.
import type { UploadItem } from "./useMediaUploads";
import { POST_MEDIA_CODES } from "../../api/postMedia";
import "./MediaUpload.css";

interface Props {
  items: UploadItem[];
  /** "final" = the Week 4 final entry: different approved/rejected wording (Figma contest frames 04-05). */
  variant?: "post" | "final";
  notice?: string | null;
  onCancel: (key: string) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

function noun(item: UploadItem): "picture" | "video" {
  return item.kind === "video" ? "video" : "picture";
}

function errorHeading(item: UploadItem): string {
  switch (item.errorCode) {
    case POST_MEDIA_CODES.fileTooLarge:
      return "That file is too large";
    case POST_MEDIA_CODES.unsupportedFile:
      return "That file type isn’t supported";
    case POST_MEDIA_CODES.videoTooLong:
      return "That video is too long";
    default:
      return "Upload failed";
  }
}

function errorBody(item: UploadItem): string {
  switch (item.errorCode) {
    case POST_MEDIA_CODES.fileTooLarge:
    case POST_MEDIA_CODES.unsupportedFile:
    case POST_MEDIA_CODES.videoTooLong:
      return item.errorMessage ?? "";
    default:
      // A rate limit has its own sentence from the server; anything else is a connection problem.
      return item.errorCode === POST_MEDIA_CODES.uploadRateLimited
        ? (item.errorMessage ?? "Please try again later.")
        : "Check your connection and try again.";
  }
}

function Thumb({ item }: { item: UploadItem }) {
  if (item.previewUrl) return <img className="media-item__thumb" src={item.previewUrl} alt="" />;
  return (
    <span className="media-item__thumb media-item__thumb--placeholder" aria-hidden="true">
      {item.kind === "video" ? "▶" : "🖼"}
    </span>
  );
}

function TrayItem({
  item,
  variant = "post",
  onCancel,
  onRemove,
  onRetry,
}: { item: UploadItem } & Omit<Props, "items" | "notice">) {
  const percent = Math.round(item.progress * 100);

  if (item.phase === "uploading") {
    return (
      <li className="media-item" data-phase="uploading">
        <Thumb item={item} />
        <div className="media-item__body">
          <p className="media-item__name">{item.name}</p>
          {item.processing ? (
            <p className="media-item__status" role="status">
              Finishing up…
            </p>
          ) : (
            <>
              <div
                className="media-item__bar"
                role="progressbar"
                aria-label={`Uploading ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="media-item__status">Uploading… {percent}%</p>
              <p className="media-item__hint">Keep this window open until it finishes.</p>
            </>
          )}
        </div>
        {!item.processing && (
          <button type="button" className="media-item__action" aria-label="Cancel upload" onClick={() => onCancel(item.key)}>
            Cancel
          </button>
        )}
      </li>
    );
  }

  if (item.phase === "checking") {
    return (
      <li className="media-item" data-phase="checking">
        <Thumb item={item} />
        <div className="media-item__body">
          <p className="media-item__name">
            {item.name} <span className="media-chip">Checking</span>
          </p>
          <p className="media-item__hint">Checking… only you can see this until it has been checked. [COPY PENDING LEGAL REVIEW]</p>
          {item.kind === "video" && <p className="media-item__hint">Videos can take a little longer to check.</p>}
          {item.errorMessage && (
            <p className="media-item__error" role="alert">
              {item.errorMessage}
            </p>
          )}
        </div>
        <button type="button" className="media-item__action" onClick={() => void onRemove(item.key)}>
          Remove
        </button>
      </li>
    );
  }

  if (item.phase === "approved") {
    return (
      <li className="media-item" data-phase="approved">
        <Thumb item={item} />
        <div className="media-item__body">
          <p className="media-item__name">
            {item.name}{" "}
            <span className="media-chip media-chip--ok">
              {variant === "final" ? "Approved — waiting for the reveal" : "Approved"}
            </span>
          </p>
          <p className="media-item__hint">
            {variant === "final"
              ? "Your video is hidden from everyone but you until the reveal at 00:00 on day 25. [COPY PENDING LEGAL REVIEW]"
              : item.kind === "video"
                ? "Your video can be seen with your post. [COPY PENDING LEGAL REVIEW]"
                : "Your pictures can be seen with your post. [COPY PENDING LEGAL REVIEW]"}
          </p>
        </div>
        <button type="button" className="media-item__action" onClick={() => void onRemove(item.key)}>
          Remove
        </button>
      </li>
    );
  }

  if (item.phase === "rejected") {
    return (
      <li className="media-item media-item--problem" data-phase="rejected">
        <Thumb item={item} />
        <div className="media-item__body">
          <p className="media-item__name">
            {item.name} <span className="media-chip media-chip--bad">Not approved</span>
          </p>
          <p className="media-item__title" role="alert">
            This {noun(item)} wasn’t approved
          </p>
          {item.rejectionReason && <p className="media-item__reason">{item.rejectionReason}</p>}
          <p className="media-item__hint">
            {variant === "final"
              ? "Remove it and upload another before the window closes at 23:59:59 on day 24."
              : `Remove it to continue, or choose a different ${noun(item)}.`}
          </p>
        </div>
        <button type="button" className="media-item__action" onClick={() => void onRemove(item.key)}>
          Remove
        </button>
      </li>
    );
  }

  return (
    <li className="media-item media-item--problem" data-phase="error">
      <Thumb item={item} />
      <div className="media-item__body">
        <p className="media-item__name">
          {item.name} <span className="media-chip media-chip--bad">Upload failed</span>
        </p>
        <p className="media-item__title" role="alert">
          {errorHeading(item)}
        </p>
        <p className="media-item__reason">{errorBody(item)}</p>
      </div>
      <div className="media-item__actions">
        {item.errorCode === POST_MEDIA_CODES.fileTooLarge ||
        item.errorCode === POST_MEDIA_CODES.unsupportedFile ||
        item.errorCode === POST_MEDIA_CODES.videoTooLong ? (
          <button type="button" className="media-item__action" onClick={() => void onRemove(item.key)}>
            Choose another file
          </button>
        ) : (
          <>
            <button type="button" className="media-item__action media-item__action--primary" onClick={() => onRetry(item.key)}>
              Try again
            </button>
            <button type="button" className="media-item__action" onClick={() => void onRemove(item.key)}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function MediaUploadTray({ items, variant, notice, onCancel, onRemove, onRetry }: Props) {
  if (items.length === 0 && !notice) return null;
  return (
    <div className="media-tray">
      {items.length > 0 && (
        <ul className="media-tray__list" aria-label="Files for this post">
          {items.map((item) => (
            <TrayItem key={item.key} item={item} variant={variant} onCancel={onCancel} onRemove={onRemove} onRetry={onRetry} />
          ))}
        </ul>
      )}
      {notice && (
        <p className="media-item__error" role="alert">
          {notice}
        </p>
      )}
    </div>
  );
}
