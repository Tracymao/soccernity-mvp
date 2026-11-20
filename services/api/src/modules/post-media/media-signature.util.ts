// backend/w14-post-media-pipeline (B-041; Decision Log #419 item 2/3). Magic-byte detection for the
// formats a post may carry. The client's declared content type is never trusted on its own: the server
// reads the first bytes of the object it received and the two must agree.
//
// Images: JPEG, PNG, WebP (no GIF; HEIC/HEIF is refused with its own plain message, no conversion: B-259). Video: MP4, WebM, QuickTime (MOV).
export const POST_MEDIA_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;
export type PostMediaContentType = (typeof POST_MEDIA_CONTENT_TYPES)[number];
export type PostMediaKind = 'image' | 'video';

export interface DetectedMedia {
  kind: PostMediaKind;
  contentType: PostMediaContentType;
  ext: string;
}

export const POST_MEDIA_KIND_BY_TYPE: Record<PostMediaContentType, PostMediaKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
};

export const POST_MEDIA_EXT_BY_TYPE: Record<PostMediaContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function isPostMediaContentType(value: string): value is PostMediaContentType {
  return (POST_MEDIA_CONTENT_TYPES as readonly string[]).includes(value);
}

// ISO base media brands that live in an MP4/MOV-style container but are NOT video we accept (HEIC and
// AVIF stills share the 'ftyp' box). A file with one of these is refused as an unsupported type.
const NON_VIDEO_FTYP_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']);

export const HEIC_CONTENT_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'] as const;
const HEIC_FTYP_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** True for a declared HEIC/HEIF content type (the default photo format on many iPhones). */
export function isHeicContentType(value: string): boolean {
  return (HEIC_CONTENT_TYPES as readonly string[]).includes(value.trim().toLowerCase());
}

/** True when the first bytes are a HEIC/HEIF still, whatever type the client declared. */
export function looksLikeHeic(head: Buffer): boolean {
  if (head.length < 12 || head.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  return HEIC_FTYP_BRANDS.has(head.subarray(8, 12).toString('ascii').trim().toLowerCase());
}

/** Detects the real format from the first bytes of a file (pass at least 64 bytes), or null. */
export function detectPostMedia(head: Buffer): DetectedMedia | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { kind: 'image', contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return { kind: 'image', contentType: 'image/png', ext: 'png' };
  }
  if (head.length >= 12 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { kind: 'image', contentType: 'image/webp', ext: 'webp' };
  }
  if (head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('ascii').trim().toLowerCase();
    if (NON_VIDEO_FTYP_BRANDS.has(brand)) return null;
    if (brand === 'qt') return { kind: 'video', contentType: 'video/quicktime', ext: 'mov' };
    return { kind: 'video', contentType: 'video/mp4', ext: 'mp4' };
  }
  // Matroska/WebM: EBML header 1A 45 DF A3, with the DocType 'webm' (a plain Matroska file is refused).
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    if (head.toString('latin1').includes('webm')) {
      return { kind: 'video', contentType: 'video/webm', ext: 'webm' };
    }
    return null;
  }
  return null;
}
