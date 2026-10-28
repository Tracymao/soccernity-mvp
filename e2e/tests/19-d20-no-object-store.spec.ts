import { test, expect } from '@playwright/test';
import { me, registerViaApi, uniqueUsername, verifyEmailViaApi, api } from '../support/helpers';
import { restartApi } from '../support/api-process';
import { URLS } from '../support/stack';

// QA-2 D-20 (fixed): the API's 503 for "no object store" used to name the S3_* environment variables and the
// Create Profile / Edit Profile page showed that message to the person verbatim. It now answers with a plain
// sentence; the S3_* detail stays in the server log. (The admin media upload keeps its own message.)
//
// This used to live in spec 15 and relied on the harness API having no object store. Since FC10 the harness
// gives the API a fake one (support/fake-media-services.ts), so this file restarts the API WITHOUT a store. It
// is the LAST spec on purpose: the restarted API is owned by this worker, and global teardown stops whichever
// API is running (api.pid), so nothing after it needs the default API back.

function solidPng(width: number, height: number): Uint8Array {
  const zlib = require('zlib') as typeof import('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7b)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  );
}


test.describe('image upload without an object store', () => {
  test("D-20: the 503 shown to a user says uploads aren't available and names no configuration", async () => {
    test.setTimeout(180_000);
    await restartApi({ noObjectStore: true });
    const a = await registerViaApi({ age: 30, label: 'img9', displayName: 'Quinn Player' });
    await verifyEmailViaApi(a);
    const { token } = await me(a);
    await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername('img9') } });
    const form = new FormData();
    form.append('file', new Blob([solidPng(400, 400) as unknown as BlobPart], { type: 'image/png' }), 'a.png');
    const res = await fetch(`${URLS.api}/users/${a.userId}/avatar`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("Picture uploads aren't available right now. Please try again later.");
    expect(body).not.toMatch(/S3_|environment|configured/i);
  });
});
