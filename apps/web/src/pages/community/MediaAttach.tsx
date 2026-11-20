// The attach controls and the tray/status block shared by every composer that uploads pictures or video:
// the Create Post composer (PostComposer.tsx) and the Bants room composer (BanterRoomPage.tsx; B-042,
// founder decision 2026-11-14: Bants takes photo and video exactly like Create Post -- same limits, same
// states, same behaviour). Markup, class names and wording are the ones PostComposer always had (FC10, B-240,
// Decision Log #419; Figma pass Q composer frames 01-11); they were moved here, not changed, so the two
// composers cannot drift. The state machine itself is useMediaUploads.ts.
//
// The one tagged string ([COPY PENDING LEGAL REVIEW], Decision Log #412 item 5) lives in this file now; its row
// in docs/pending-copy-manifest.md moved with it.
import { useRef, type ChangeEvent } from "react";
import MediaUploadTray from "./MediaUploadTray";
import type { useMediaUploads } from "./useMediaUploads";
import "./MediaUpload.css";

export type MediaUploads = ReturnType<typeof useMediaUploads>;

interface ButtonsProps {
  uploads: MediaUploads;
  /** "video" = a contest entry: one video, no pictures ("Upload a video"). */
  only?: "video";
}

/** The Picture and Video buttons (and their hidden file inputs). Disabled once the server says uploads are off. */
export function MediaAttachButtons({ uploads, only }: ButtonsProps) {
  const pictureInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // so choosing the same file again works
    if (picked.length > 0) uploads.addFiles(picked);
  }

  return (
    <div className="media-attach">
      {only !== "video" && (
        <>
          <input
            ref={pictureInput}
            className="media-attach__input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            data-testid="picture-input"
            onChange={onPicked}
          />
          <button
            type="button"
            className="media-attach__btn"
            disabled={uploads.uploadsUnavailable}
            onClick={() => pictureInput.current?.click()}
          >
            &#128247; Picture
          </button>
        </>
      )}
      <input
        ref={videoInput}
        className="media-attach__input"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="video-input"
        onChange={onPicked}
      />
      <button
        type="button"
        className="media-attach__btn"
        disabled={uploads.uploadsUnavailable}
        onClick={() => videoInput.current?.click()}
      >
        &#127909; {only === "video" ? "Upload a video" : "Video"}
      </button>
    </div>
  );
}

/** The tray of chosen files, then "Uploads aren't available right now" or the one-line note about the check. */
export function MediaUploadStatus({ uploads }: { uploads: MediaUploads }) {
  return (
    <>
      <MediaUploadTray
        items={uploads.items}
        notice={uploads.notice}
        onCancel={uploads.cancel}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
      />
      {uploads.uploadsUnavailable ? (
        <p className="media-unavailable" role="status">
          <strong>Uploads aren&rsquo;t available right now.</strong> You can still post text. Try adding pictures or
          video again later.
        </p>
      ) : (
        uploads.items.length === 0 && (
          <p className="composer__note">
            Everything you upload is checked before other people can see it. [COPY PENDING LEGAL REVIEW]
          </p>
        )
      )}
    </>
  );
}
