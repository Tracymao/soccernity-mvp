// Cover photo crop step (build register B-210 / B-222 / B-227, Decision Log #414
// item 2). Figma: "Cover Photo — Crop — Desktop" 6812:29354 and "— Mobile"
// 6812:29396 (pass N redrew the mobile window at 796:192), "Soccernity-MVP"
// (weZWWqggy9j13eX8bhFgs6).
//
// ONE saved crop at the cover slot's 796:192 ratio: drag the picture to move it,
// zoom 1x to 3x, and Save. Only the CROPPED file is handed to `onSave`; the
// original is never uploaded or stored. The mobile profile shows the same saved
// crop with `object-fit: cover`, so there is no second mobile crop.
//
// Minimum width: an image narrower than 796 px cannot fill the crop window, so it
// is refused with a message and the person can choose another (B-222; functional
// wording, untagged per Decision Log #412 item 5 -- it promises nothing about the
// image check).
//
// The "checked automatically" sentence that the Figma frames close with is NOT
// written here: it is the tagged string ProfileImageControl already owns (and
// the manifest already lists), so the parent passes it in as `notice`.
//
// Keyboard: the crop window is focusable and the arrow keys move the picture, so
// the crop does not need a pointer. The zoom slider and its - / + buttons are
// ordinary controls.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  COVER_ASPECT_RATIO,
  COVER_MIN_WIDTH_PX,
  COVER_ZOOM_MAX,
  COVER_ZOOM_MIN,
  clampCentre,
  clampZoom,
  cropImageToBlob,
  cropRectFor,
  isCoverWideEnough,
} from "../../lib/imageCrop";
import "./CoverCropDialog.css";

interface Props {
  file: File;
  /** The tagged "checked automatically" sentence, rendered under the buttons as in the frames. */
  notice: string;
  onSave: (cropped: Blob) => void;
  onCancel: () => void;
  /** Re-opens the file chooser (shown on the "too small" refusal). */
  onChooseAnother: () => void;
}

type Natural = { w: number; h: number } | null;

const ZOOM_BUTTON_STEP = 0.1;
const KEY_STEP = 0.02; // fraction of the crop window moved per arrow key press

export default function CoverCropDialog({ file, notice, onSave, onCancel, onChooseAnother }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The blob URL is created INSIDE the effect that revokes it. Creating it in render (useMemo) and
  // revoking it in an effect cleanup breaks under React StrictMode in development: the effect runs, is
  // cleaned up (URL revoked) and runs again, but the memoised URL is not recreated, so the image never
  // loads ("We couldn't open that image"). Found by the Playwright run (spec 14); jsdom cannot show it.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [natural, setNatural] = useState<Natural>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState(COVER_ZOOM_MIN);
  const [centre, setCentre] = useState({ cx: 0.5, cy: 0.5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const tooSmall = natural !== null && !isCoverWideEnough(natural.w);
  const ready = natural !== null && !tooSmall && !loadFailed;

  const rect = ready ? cropRectFor(natural.w, natural.h, zoom, centre.cx, centre.cy) : null;

  // The picture is placed with percentages of the crop window, so the layout needs no pixel
  // measurement: left/width are fractions of the window width, top/height of its height.
  function placement(r: NonNullable<typeof rect>) {
    return {
      left: `${(-r.sx / r.sw) * 100}%`,
      top: `${(-r.sy / r.sh) * 100}%`,
      width: `${(natural!.w / r.sw) * 100}%`,
      height: `${(natural!.h / r.sh) * 100}%`,
    };
  }

  function changeZoom(next: number) {
    if (!natural) return;
    const z = clampZoom(next);
    setZoom(z);
    setCentre((c) => clampCentre(natural.w, natural.h, z, c.cx, c.cy));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, cx: centre.cx, cy: centre.cy };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !rect || !natural) return;
    const box = windowRef.current?.getBoundingClientRect();
    const width = box && box.width > 0 ? box.width : 520;
    const height = box && box.height > 0 ? box.height : width / COVER_ASPECT_RATIO;
    // The picture follows the pointer, so the crop region moves the opposite way.
    const cx = drag.cx - ((event.clientX - drag.x) / width) * (rect.sw / natural.w);
    const cy = drag.cy - ((event.clientY - drag.y) / height) * (rect.sh / natural.h);
    setCentre(clampCentre(natural.w, natural.h, zoom, cx, cy));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ready || !rect || !natural) return;
    const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    setCentre((c) =>
      clampCentre(
        natural.w,
        natural.h,
        zoom,
        c.cx + dx * KEY_STEP * (rect.sw / natural.w),
        c.cy + dy * KEY_STEP * (rect.sh / natural.h),
      ),
    );
  }

  async function save() {
    if (!rect || !imageRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await cropImageToBlob(imageRef.current, rect, file.type);
      onSave(blob);
    } catch {
      setError("We couldn’t crop that image. Try another one.");
      setSaving(false);
    }
  }

  return (
    <div className="cover-crop__scrim" data-testid="cover-crop-dialog">
      <div className="cover-crop" role="dialog" aria-modal="true" aria-labelledby="cover-crop-title">
        {/* Decodes the chosen file (and is what the canvas draws from). Not shown. */}
        {objectUrl && (
          <img
            ref={imageRef}
            src={objectUrl}
            alt=""
            hidden
            data-testid="cover-crop-source"
            onLoad={(event) =>
              setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
            }
            onError={() => setLoadFailed(true)}
          />
        )}

        {tooSmall ? (
          <>
            <h2 id="cover-crop-title" className="cover-crop__title">
              This image is too small
            </h2>
            <p className="cover-crop__lead" role="alert">
              A cover photo needs to be at least {COVER_MIN_WIDTH_PX} pixels wide. This one is {natural!.w} pixels wide.
              Choose a larger image.
            </p>
            <div className="cover-crop__actions">
              <button type="button" className="cover-crop__button cover-crop__button--primary" onClick={onChooseAnother}>
                Choose another image
              </button>
              <button type="button" className="cover-crop__button" onClick={onCancel} ref={cancelRef}>
                Cancel
              </button>
            </div>
          </>
        ) : loadFailed ? (
          <>
            <h2 id="cover-crop-title" className="cover-crop__title">
              We couldn’t open that image
            </h2>
            <p className="cover-crop__lead" role="alert">
              Choose a JPEG, PNG or WebP file and try again.
            </p>
            <div className="cover-crop__actions">
              <button type="button" className="cover-crop__button cover-crop__button--primary" onClick={onChooseAnother}>
                Choose another image
              </button>
              <button type="button" className="cover-crop__button" onClick={onCancel} ref={cancelRef}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="cover-crop-title" className="cover-crop__title">
              Crop your cover photo
            </h2>
            <p className="cover-crop__lead">
              Drag the picture to choose what shows. Your cover is cropped to the shape of the frame.
            </p>

            <div className="cover-crop__stage">
              <div
                ref={windowRef}
                className="cover-crop__window"
                data-testid="cover-crop-window"
                role="group"
                tabIndex={ready ? 0 : -1}
                aria-label="Crop area. Drag the picture, or use the arrow keys, to move it."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
              >
                {rect && objectUrl && (
                  <img className="cover-crop__picture" src={objectUrl} alt="" draggable={false} style={placement(rect)} />
                )}
                <span className="cover-crop__grid cover-crop__grid--v1" aria-hidden="true" />
                <span className="cover-crop__grid cover-crop__grid--v2" aria-hidden="true" />
                <span className="cover-crop__grid cover-crop__grid--h1" aria-hidden="true" />
                <span className="cover-crop__grid cover-crop__grid--h2" aria-hidden="true" />
                <span className="cover-crop__handle cover-crop__handle--tl" aria-hidden="true" />
                <span className="cover-crop__handle cover-crop__handle--tr" aria-hidden="true" />
                <span className="cover-crop__handle cover-crop__handle--bl" aria-hidden="true" />
                <span className="cover-crop__handle cover-crop__handle--br" aria-hidden="true" />
                <span className="cover-crop__hint" aria-hidden="true">
                  Drag to move
                </span>
              </div>
            </div>

            <div className="cover-crop__zoom">
              <label htmlFor="cover-crop-zoom" className="cover-crop__zoom-label">
                Zoom
              </label>
              <button
                type="button"
                className="cover-crop__zoom-step"
                aria-label="Zoom out"
                onClick={() => changeZoom(zoom - ZOOM_BUTTON_STEP)}
                disabled={!ready || zoom <= COVER_ZOOM_MIN}
              >
                −
              </button>
              <input
                id="cover-crop-zoom"
                className="cover-crop__slider"
                type="range"
                min={COVER_ZOOM_MIN}
                max={COVER_ZOOM_MAX}
                step={0.01}
                value={zoom}
                disabled={!ready}
                onChange={(event) => changeZoom(Number(event.target.value))}
              />
              <button
                type="button"
                className="cover-crop__zoom-step"
                aria-label="Zoom in"
                onClick={() => changeZoom(zoom + ZOOM_BUTTON_STEP)}
                disabled={!ready || zoom >= COVER_ZOOM_MAX}
              >
                +
              </button>
              <span className="cover-crop__zoom-value" data-testid="cover-crop-zoom-value">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className="cover-crop__preview-block">
              <p className="cover-crop__caption">Cropped preview</p>
              <div className="cover-crop__preview" data-testid="cover-crop-preview">
                {rect && objectUrl && <img className="cover-crop__picture" src={objectUrl} alt="" style={placement(rect)} />}
              </div>
              <p className="cover-crop__caption">This is how your cover will look on your profile.</p>
            </div>

            {error && (
              <p className="cover-crop__error" role="alert">
                {error}
              </p>
            )}

            <div className="cover-crop__actions">
              <button
                type="button"
                className="cover-crop__button cover-crop__button--primary"
                onClick={() => void save()}
                disabled={!ready || saving}
              >
                {saving ? "Saving…" : "Save cover photo"}
              </button>
              <button type="button" className="cover-crop__button" onClick={onCancel} disabled={saving} ref={cancelRef}>
                Cancel
              </button>
            </div>

            <p className="cover-crop__notice">{notice}</p>
          </>
        )}
      </div>
    </div>
  );
}
