import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

// TEST HARNESS, not product code. Files a test can upload: a small PNG of a chosen width (the fake check
// in fake-media-services.ts decides its outcome from the width) and a 2-second MP4 made with the harness's
// own ffmpeg (a video's sampled frames are 64 px wide, so the fake check clears it).

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A solid-colour RGB PNG, `width` x 16 px. */
export function pngOfWidth(width: number, rgb: [number, number, number] = [40, 120, 60]): Buffer {
  const height = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Absolute path of ffmpeg from the harness's devDependency, or null when it is not installed. */
export function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

let cachedMp4: string | null | undefined;

/** A real 2-second 64x64 H.264 MP4 on disk (made once per run), or null when ffmpeg is unavailable. */
export function makeMp4(): string | null {
  if (cachedMp4 !== undefined) return cachedMp4;
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) {
    cachedMp4 = null;
    return null;
  }
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-media-')), 'clip.mp4');
  execFileSync(
    ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=64x64:rate=10', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', out],
    { stdio: 'ignore' },
  );
  cachedMp4 = out;
  return out;
}
