// Browser-side centre crop for the cover photo (Decision Log #412 item 3, B-215):
// "the cover is cropped to the aspect ratio of the cover frame", done in the
// browser so the server still receives and checks an ordinary image file.
//
// The ratio is the profile cover slot in the Figma profile frames
// (6747:28894 and the other K2/K4 frames: 796 x 192). B-210 (K7) was to record
// the measured number in a frame note; that pass has not run, so this is the
// number read off the frame, and only the DESKTOP slot (the mobile cover slot is
// a different shape, about 390 x 120, and is shown with `object-fit: cover`).
// A crop step with position and zoom controls is not drawn (B-210) and is not
// built: this crops automatically around the centre.
export const COVER_ASPECT_RATIO = 796 / 192;

/** The largest centred rectangle of the given aspect ratio that fits inside width x height. */
export function centreCropRect(
  width: number,
  height: number,
  ratio: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const current = width / height;
  if (current > ratio) {
    const sw = Math.round(height * ratio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / ratio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

/**
 * Crops `file` to `ratio` and returns a new image Blob of the same type (PNG and
 * WebP stay lossless-or-near; JPEG is re-encoded at 0.92). If the browser cannot
 * decode or draw the image (no canvas, a decode failure) the ORIGINAL file is
 * returned unchanged: the server still validates it, and a cover that is not
 * cropped is still displayed cropped by CSS.
 */
export async function cropToAspectRatio(file: File, ratio: number): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file);
    const { sx, sy, sw, sh } = centreCropRect(bitmap.width, bitmap.height, ratio);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close?.();
    const type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    return blob ?? file;
  } catch {
    return file;
  }
}
