import * as http from 'http';

// TEST HARNESS, not product code. FC10 (B-240): the two external services the media upload pipeline talks
// to, replaced by small local stand-ins so a REAL browser can upload a file end to end against the REAL
// API process:
//
//   1. an S3-compatible object store (path-style: /<bucket>/<key>) that accepts the browser's PUT to the
//      one-time link, HEAD / GET / DELETE / CopyObject from the API, and answers the CORS preflight the browser
//      sends. B-265 (two buckets): it holds TWO buckets, a public one and a private one, as production does
//      (the API routes each key by prefix; see services/api/src/storage/storage-prefixes.ts). A key lives in
//      exactly the bucket the API wrote it to, and a copy between the two buckets is a real cross-bucket copy;
//   2. an Amazon Rekognition stand-in (DetectModerationLabels) -- the "fake check". The API's own check
//      code, thresholds and decision rule run unchanged; only the vendor's answer is fixed.
//
// The fake check decides from the IMAGE WIDTH, so a test chooses the outcome by the picture it uploads
// (images are built by pngOfWidth in media-fixtures.ts; a video's frames are 64 px wide):
//     64 px  -> no labels                       -> approved by the check
//     66 px  -> "Explicit Nudity" at 99         -> auto-rejected
//     68 px  -> "Suggestive" at 65              -> uncertain, left for a moderator
// (The API stores the re-encoded file and sends Rekognition THAT, so only the width -- which re-encoding
// keeps -- is a stable signal; no marker survives in the bytes.)

export const FAKE_BUCKET = 'qa-media';
/** B-265: the private bucket (pending / rejected media, quarantine, data exports). Never served publicly. */
export const FAKE_PRIVATE_BUCKET = 'qa-media-private';
const BUCKETS = [FAKE_BUCKET, FAKE_PRIVATE_BUCKET] as const;
export const FAKE_STORAGE_PORT = 3191;
export const FAKE_REKOGNITION_PORT = 3192;

export const WIDTH_CLEAR = 64;
export const WIDTH_REJECT = 66;
export const WIDTH_UNSURE = 68;

interface StoredObject {
  body: Buffer;
  contentType: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, GET, HEAD, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// The AWS SDK sends a streamed body with a trailing checksum as "aws-chunked": <hex-size>[;sig]\r\n<data>\r\n ... 0\r\n<trailers>.
function decodeAwsChunked(raw: Buffer): Buffer {
  const out: Buffer[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const lineEnd = raw.indexOf('\r\n', pos);
    if (lineEnd < 0) break;
    const size = parseInt(raw.subarray(pos, lineEnd).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    pos = lineEnd + 2;
    out.push(raw.subarray(pos, pos + size));
    pos += size + 2;
  }
  return Buffer.concat(out);
}

export interface FakeMediaServices {
  /** Every object currently in the fake store across both buckets (key -> object), for assertions. A snapshot. */
  objects(): Map<string, StoredObject>;
  /** The objects of ONE bucket (FAKE_BUCKET or FAKE_PRIVATE_BUCKET), a snapshot. */
  objectsIn(bucket: string): Map<string, StoredObject>;
  /** Which buckets currently hold this key (so a test can prove a file is in exactly one). */
  bucketsHolding(key: string): string[];
  /** How many DetectModerationLabels calls arrived (proof the real check ran). */
  rekognitionCalls(): number;
  close(): Promise<void>;
}

export function pngWidth(bytes: Buffer): number | null {
  // PNG signature (8) + IHDR length (4) + 'IHDR' (4) + width (4, big endian).
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString('latin1') === 'PNG') return bytes.readUInt32BE(16);
  return null;
}

function jpegWidth(bytes: Buffer): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1];
    const length = bytes.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return bytes.readUInt16BE(pos + 7);
    pos += 2 + length;
  }
  return null;
}

function labelsFor(width: number | null): Array<{ Name: string; ParentName: string; Confidence: number }> {
  if (width === WIDTH_REJECT) return [{ Name: 'Explicit Nudity', ParentName: 'Explicit', Confidence: 99.2 }];
  if (width === WIDTH_UNSURE) return [{ Name: 'Suggestive', ParentName: '', Confidence: 65.5 }];
  return [];
}

export async function startFakeMediaServices(): Promise<FakeMediaServices> {
  const stores = new Map<string, Map<string, StoredObject>>(BUCKETS.map((b) => [b, new Map<string, StoredObject>()]));
  let rekognitionCalls = 0;
  const noSuchKey = (res: http.ServerResponse, code = 'NoSuchKey') =>
    res
      .writeHead(404, { ...CORS, 'Content-Type': 'application/xml' })
      .end(`<?xml version="1.0"?><Error><Code>${code}</Code><Message>not found</Message></Error>`);

  const storage = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    // Path style: /<bucket>/<key...>. An unknown bucket is a NoSuchBucket error, like a real store.
    const bucket = BUCKETS.find((b) => url.pathname.startsWith(`/${b}/`));
    if (!bucket) {
      noSuchKey(res, 'NoSuchBucket');
      return;
    }
    const store = stores.get(bucket)!;
    const key = decodeURIComponent(url.pathname.slice(bucket.length + 2));

    // backend/media-privacy-vetting-followups (B-257): CopyObject is a PUT carrying x-amz-copy-source
    // ("<bucket>/<key>", URL-encoded). The API copies a file from the private prefix to the public one when it
    // is approved, and back when a report holds it, so the stand-in must do the same. B-265: with two buckets
    // the source names its OWN bucket ("<source-bucket>/<key>") and the destination is the bucket in the path,
    // so this is a real cross-bucket copy; a source in an unknown bucket or with a missing key is NoSuchKey.
    const copySource = req.headers['x-amz-copy-source'];
    if (req.method === 'PUT' && copySource) {
      const decoded = decodeURIComponent(String(copySource)).replace(/^\//, '');
      const sourceBucket = BUCKETS.find((b) => decoded.startsWith(`${b}/`));
      const sourceKey = sourceBucket ? decoded.slice(sourceBucket.length + 1) : null;
      const source = sourceBucket && sourceKey ? stores.get(sourceBucket)!.get(sourceKey) : undefined;
      if (!source) {
        noSuchKey(res);
        return;
      }
      store.set(key, { body: Buffer.from(source.body), contentType: String(req.headers['content-type'] ?? source.contentType) });
      res
        .writeHead(200, { ...CORS, 'Content-Type': 'application/xml' })
        .end(`<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><ETag>"copy"</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`);
      return;
    }

    if (req.method === 'PUT') {
      let body = await readBody(req);
      const encoding = String(req.headers['content-encoding'] ?? '');
      const sha = String(req.headers['x-amz-content-sha256'] ?? '');
      if (encoding.includes('aws-chunked') || sha.startsWith('STREAMING-')) body = decodeAwsChunked(body);
      store.set(key, { body, contentType: String(req.headers['content-type'] ?? 'application/octet-stream') });
      res.writeHead(200, { ...CORS, ETag: `"${store.size}"` }).end();
      return;
    }
    const found = store.get(key);
    if (req.method === 'HEAD') {
      if (!found) res.writeHead(404, CORS).end();
      else res.writeHead(200, { ...CORS, 'Content-Length': String(found.body.length), 'Content-Type': found.contentType }).end();
      return;
    }
    if (req.method === 'GET') {
      if (!found) {
        noSuchKey(res);
      } else {
        res.writeHead(200, { ...CORS, 'Content-Length': String(found.body.length), 'Content-Type': found.contentType }).end(found.body);
      }
      return;
    }
    if (req.method === 'DELETE') {
      store.delete(key);
      res.writeHead(204, CORS).end();
      return;
    }
    res.writeHead(405, CORS).end();
  });

  const rekognition = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    const raw = await readBody(req);
    rekognitionCalls += 1;
    let width: number | null = null;
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as { Image?: { Bytes?: string } };
      const bytes = Buffer.from(parsed.Image?.Bytes ?? '', 'base64');
      width = pngWidth(bytes) ?? jpegWidth(bytes);
    } catch {
      /* an unreadable request gets no labels */
    }
    res.writeHead(200, { 'Content-Type': 'application/x-amz-json-1.1' }).end(JSON.stringify({ ModerationLabels: labelsFor(width) }));
  });

  await Promise.all([
    new Promise<void>((resolve) => storage.listen(FAKE_STORAGE_PORT, resolve)),
    new Promise<void>((resolve) => rekognition.listen(FAKE_REKOGNITION_PORT, resolve)),
  ]);

  return {
    objects: () => new Map([...stores.values()].flatMap((m) => [...m.entries()])),
    objectsIn: (bucket) => new Map(stores.get(bucket) ?? []),
    bucketsHolding: (key) => BUCKETS.filter((b) => stores.get(b)!.has(key)),
    rekognitionCalls: () => rekognitionCalls,
    close: () =>
      new Promise<void>((resolve) => {
        storage.close(() => rekognition.close(() => resolve()));
        storage.closeAllConnections?.();
        rekognition.closeAllConnections?.();
      }),
  };
}
