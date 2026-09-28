// Cover image picker — Decision Log #334, resolved.
//
// No Figma frame designs this control anywhere in the file (checked
// before building it — the Media section's own frames, Figma nodes
// 361:553 / 396:442 / 916:2362 / 917:24, only ever cover the standalone
// Media Library/Upload/Preview screens, never a picker embedded in
// another screen's composer). Built plain and flagged here, matching
// this project's established "no design exists, build plainly and
// disclose it" precedent (AdminProfilePage.tsx's Change Password panel,
// PR #245's ReportAction component).
//
// This is a PICKER, not an uploader — it reuses the already-shipped
// GET /admin/media (listMedia) to choose from images already in the
// Media library. It does NOT add a new upload flow inline; the existing
// disabled "Upload Images" composer control on CreateArticlePage.tsx
// (a *different*, still-unbuilt feature — attaching images inline to the
// article body) is untouched.
//
// displayNameFromUrl/formatBytes are deliberately a SECOND, local copy of
// pages/media/mediaShared.tsx's own helpers of the same name, not a
// cross-page-folder import — mirrors this codebase's own established
// "own copy, not cross-import across page families" convention (see
// mediaShared.tsx's / adminContentShared.tsx's own header comments).
import { useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";
import { listMedia, type MediaAsset } from "../../api/adminMedia";
import "../content/content.css";
import "./coverImagePicker.css";

function displayNameFromUrl(url: string): string {
  const segments = url.split("/");
  return segments[segments.length - 1] || url;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

interface CoverImagePickerPanelProps {
  onPick: (media: MediaAsset) => void;
}

// A separate inner component so its data fetch only ever runs while the
// picker is actually open — CoverImagePicker below conditionally mounts
// this, rather than fetching GET /admin/media every time the composer
// itself loads, whether or not the editor ever opens the picker.
function CoverImagePickerPanel({ onPick }: CoverImagePickerPanelProps) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This component is only ever mounted while the picker panel is open
  // (see CoverImagePicker below), so a plain "fetch the first page on
  // mount" effect — the same useAsyncData/mediaShared.tsx shape used
  // elsewhere in this app — never fires until an editor actually opens
  // it.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMedia({ type: "image", limit: 24 })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof AdminApiError ? err.message : "Couldn't load the media library.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMedia({ type: "image", cursor, limit: 24 });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't load more images.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="ac-cover-picker__panel" role="group" aria-label="Choose a cover image">
      {loading ? <p className="ac-loading">Loading images…</p> : null}
      {error ? (
        <p className="ac-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="ac-hint">
          No images in the Media library yet — upload one from the Media section first.
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="ac-cover-picker__grid">
          {items.map((media) => (
            <button
              type="button"
              key={media.id}
              className="ac-cover-picker__item"
              onClick={() => onPick(media)}
              title={displayNameFromUrl(media.url)}
            >
              <img src={media.url} alt="" />
              <span className="ac-cover-picker__item-size">{formatBytes(media.size)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {cursor && !loading ? (
        <button
          type="button"
          className="ac-btn ac-btn--outline ac-btn--sm"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

interface CoverImagePickerProps {
  /** The currently selected cover image, or null when none is set. */
  selected: MediaAsset | null;
  onChange: (media: MediaAsset | null) => void;
  disabled?: boolean;
}

export default function CoverImagePicker({ selected, onChange, disabled }: CoverImagePickerProps) {
  const [open, setOpen] = useState(false);

  function handlePick(media: MediaAsset) {
    onChange(media);
    setOpen(false);
  }

  return (
    <div className="ac-field ac-cover-picker">
      <span>Cover image (optional)</span>
      {selected ? (
        <div className="ac-cover-picker__selected">
          <img src={selected.url} alt="" className="ac-cover-picker__thumb" />
          <span className="ac-cover-picker__name">{displayNameFromUrl(selected.url)}</span>
          <button
            type="button"
            className="ac-btn ac-btn--outline ac-btn--sm"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
          >
            Change
          </button>
          <button
            type="button"
            className="ac-btn ac-btn--outline ac-btn--sm"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ac-btn ac-btn--outline ac-btn--sm"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
        >
          {open ? "Close" : "Choose cover image"}
        </button>
      )}
      <span className="ac-hint">
        Shown on the public Blog feed and article page. Chosen from images already in the Media
        library — this doesn't upload a new file.
      </span>
      {open ? <CoverImagePickerPanel onPick={handlePick} /> : null}
    </div>
  );
}
