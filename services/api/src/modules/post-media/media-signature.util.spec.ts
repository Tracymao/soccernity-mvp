import { POST_MEDIA_CONTENT_TYPES, POST_MEDIA_EXT_BY_TYPE, POST_MEDIA_KIND_BY_TYPE, detectPostMedia, isPostMediaContentType } from './media-signature.util';

const pad = (b: number[], len = 64) => Buffer.concat([Buffer.from(b), Buffer.alloc(Math.max(0, len - b.length))]);
const ascii = (s: string, at = 0, len = 64) => {
  const buf = Buffer.alloc(len);
  buf.write(s, at, 'latin1');
  return buf;
};

describe('detectPostMedia (magic bytes)', () => {
  it('recognises JPEG, PNG and WebP', () => {
    expect(detectPostMedia(pad([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ kind: 'image', contentType: 'image/jpeg', ext: 'jpg' });
    expect(detectPostMedia(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ kind: 'image', contentType: 'image/png', ext: 'png' });
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);
    expect(detectPostMedia(webp)).toEqual({ kind: 'image', contentType: 'image/webp', ext: 'webp' });
  });

  it('recognises MP4 and QuickTime by their ftyp brand, and WebM by its EBML doctype', () => {
    const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand.padEnd(4, ' ')), Buffer.alloc(40)]);
    expect(detectPostMedia(ftyp('isom'))).toEqual({ kind: 'video', contentType: 'video/mp4', ext: 'mp4' });
    expect(detectPostMedia(ftyp('mp42'))).toEqual({ kind: 'video', contentType: 'video/mp4', ext: 'mp4' });
    expect(detectPostMedia(ftyp('qt'))).toEqual({ kind: 'video', contentType: 'video/quicktime', ext: 'mov' });
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), ascii('\x42\x82\x84webm', 0, 60)]);
    expect(detectPostMedia(webm)).toEqual({ kind: 'video', contentType: 'video/webm', ext: 'webm' });
  });

  it('refuses a HEIC/AVIF still (same ftyp box, not a video we accept)', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'avif']) {
      const buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(40)]);
      expect(detectPostMedia(buf)).toBeNull();
    }
  });

  it('refuses a plain Matroska file (EBML header without the webm doctype)', () => {
    const mkv = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), ascii('\x42\x82\x88matroska', 0, 60)]);
    expect(detectPostMedia(mkv)).toBeNull();
  });

  it('refuses a GIF, a PDF, a script, an empty or a short buffer', () => {
    expect(detectPostMedia(ascii('GIF89a'))).toBeNull();
    expect(detectPostMedia(ascii('%PDF-1.7'))).toBeNull();
    expect(detectPostMedia(ascii('<script>alert(1)</script>'))).toBeNull();
    expect(detectPostMedia(Buffer.alloc(0))).toBeNull();
    expect(detectPostMedia(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('content type tables', () => {
  it('cover exactly the six allowed types, with a kind and an extension each', () => {
    expect([...POST_MEDIA_CONTENT_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']);
    for (const t of POST_MEDIA_CONTENT_TYPES) {
      expect(['image', 'video']).toContain(POST_MEDIA_KIND_BY_TYPE[t]);
      expect(POST_MEDIA_EXT_BY_TYPE[t]).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('isPostMediaContentType rejects GIF and anything else', () => {
    expect(isPostMediaContentType('image/jpeg')).toBe(true);
    expect(isPostMediaContentType('image/gif')).toBe(false);
    expect(isPostMediaContentType('application/pdf')).toBe(false);
  });
});
