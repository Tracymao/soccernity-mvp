// Browser-side cover photo crop (Decision Log #414 item 2, build register B-210 /
// B-222 / B-227). ONE saved crop at the cover slot's 796:192 ratio: the person moves
// and zooms the picture inside a fixed crop window, and only the CROPPED file is
// uploaded -- the original never leaves the browser. Mobile profile frames show
// that same saved crop with `object-fit: cover`; there is no second mobile crop.
//
// Figma: crop frames 6812:29354 (desktop) and 6812:29396 (mobile, redrawn at
// 796:192 by pass N), "image too small" state B-222.
//
// Parameters the founder fixed (#414 item 2): ratio 796:192, zoom 1x to 3x,
// minimum width 796 px. Adopted readings, not stated by the founder (B-222):
//   - the 796 px minimum applies to the image the person CHOOSES, because an
//     image narrower than the crop window cannot fill it;
//   - 1x means the image just covers the crop window;
//   - the saved file keeps the cropped region's own pixels (no upscaling), so a
//     zoomed-in crop from a small image is a small file. Its pixel size and any
//     server-side size or ratio check are NOT decided (B-205).
export const COVER_ASPECT_RATIO = 796 / 192;
export const COVER_MIN_WIDTH_PX = 796;
export const COVER_ZOOM_MIN = 1;
export const COVER_ZOOM_MAX = 3;

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** True when the chosen image is wide enough to fill the crop window (>= 796 px). */
export function isCoverWideEnough(naturalWidth: number): boolean {
  return naturalWidth >= COVER_MIN_WIDTH_PX;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return COVER_ZOOM_MIN;
  return Math.min(COVER_ZOOM_MAX, Math.max(COVER_ZOOM_MIN, zoom));
}

/** The largest centred rectangle of the given aspect ratio that fits inside width x height. */
export function centreCropRect(width: number, height: number, ratio: number): CropRect {
  const current = width / height;
  if (current > ratio) {
    const sw = Math.round(height * ratio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / ratio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

/**
 * The source region at 1x: the largest region of `ratio` that fits the image (so the image just
 * covers the crop window). Zoom z shows a region 1/z as large.
 */
function regionAtOneX(naturalWidth: number, naturalHeight: number, ratio: number): { w: number; h: number } {
  if (naturalWidth / naturalHeight > ratio) return { w: naturalHeight * ratio, h: naturalHeight };
  return { w: naturalWidth, h: naturalWidth / ratio };
}

/** Source-pixel size of the crop region at this zoom. */
export function cropRegionSize(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  ratio: number = COVER_ASPECT_RATIO,
): { w: number; h: number } {
  const base = regionAtOneX(naturalWidth, naturalHeight, ratio);
  const z = clampZoom(zoom);
  return { w: base.w / z, h: base.h / z };
}

/**
 * The crop rectangle, in source pixels, for a crop window centred at fractions (cx, cy) of the image
 * (0..1 across and down) at the given zoom. The window is clamped so it never leaves the image.
 */
export function cropRectFor(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  cx: number,
  cy: number,
  ratio: number = COVER_ASPECT_RATIO,
): CropRect {
  const { w, h } = cropRegionSize(naturalWidth, naturalHeight, zoom, ratio);
  const sx = Math.min(naturalWidth - w, Math.max(0, cx * naturalWidth - w / 2));
  const sy = Math.min(naturalHeight - h, Math.max(0, cy * naturalHeight - h / 2));
  return { sx, sy, sw: w, sh: h };
}

/** Keeps a window centre (as fractions of the image) in the range where the window stays inside the image. */
export function clampCentre(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  cx: number,
  cy: number,
  ratio: number = COVER_ASPECT_RATIO,
): { cx: number; cy: number } {
  const { w, h } = cropRegionSize(naturalWidth, naturalHeight, zoom, ratio);
  const minX = w / 2 / naturalWidth;
  const minY = h / 2 / naturalHeight;
  return {
    cx: Math.min(1 - minX, Math.max(minX, cx)),
    cy: Math.min(1 - minY, Math.max(minY, cy)),
  };
}

/**
 * Crops a loaded image to `rect` and returns the cropped image as a Blob. PNG and WebP keep their type;
 * anything else (JPEG) is re-encoded as JPEG at 0.92. THROWS when the browser cannot draw or encode it:
 * the caller must not fall back to uploading the original (it is never stored).
 */
export async function cropImageToBlob(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  rect: CropRect,
  fileType: string,
): Promise<Blob> {
  const sw = Math.max(1, Math.round(rect.sw));
  const sh = Math.max(1, Math.round(rect.sh));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(image, Math.round(rect.sx), Math.round(rect.sy), sw, sh, 0, 0, sw, sh);
  const type = fileType === "image/png" || fileType === "image/webp" ? fileType : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("Could not encode the cropped image");
  return blob;
}
