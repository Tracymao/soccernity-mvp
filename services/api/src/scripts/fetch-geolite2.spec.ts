import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FetchGeoLite2Deps, fetchGeoLite2 } from './fetch-geolite2';

const ACCOUNT = '123456';
const KEY = 'super-secret-licence-key';

function tmpDest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geolite2-spec-'));
  return { dir, dest: path.join(dir, 'GeoLite2-Country.mmdb') };
}

function deps(over: Partial<FetchGeoLite2Deps> = {}) {
  const logs: string[] = [];
  const big = Buffer.alloc(1_500_000, 1);
  const d: FetchGeoLite2Deps = {
    fetchFn: jest.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => big })) as never,
    extract: (_archive, outDir) => {
      const p = path.join(outDir, 'GeoLite2-Country.mmdb');
      fs.writeFileSync(p, big);
      return p;
    },
    verify: jest.fn(async () => undefined),
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, logs };
}

describe('fetchGeoLite2 (B-024)', () => {
  it.each([
    ['no credentials', {}],
    ['only an account id', { MAXMIND_ACCOUNT_ID: ACCOUNT }],
    ['only a licence key', { MAXMIND_LICENSE_KEY: KEY }],
    ['blank credentials', { MAXMIND_ACCOUNT_ID: ' ', MAXMIND_LICENSE_KEY: ' ' }],
    ['placeholder credentials', { MAXMIND_ACCOUNT_ID: 'replace-me', MAXMIND_LICENSE_KEY: 'replace-me' }],
  ])('SKIPS without making any request when given %s', async (_l, env) => {
    const { d, logs } = deps();
    const out = await fetchGeoLite2(env, d);
    expect(out.status).toBe('skipped');
    expect(d.fetchFn).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/unresolved/);
  });

  it('downloads with HTTP Basic auth, verifies, and installs atomically', async () => {
    const { dir, dest } = tmpDest();
    const { d, logs } = deps();
    const out = await fetchGeoLite2({ MAXMIND_ACCOUNT_ID: ACCOUNT, MAXMIND_LICENSE_KEY: KEY, GEOLITE2_DB_PATH: dest }, d);

    expect(out).toEqual({ status: 'installed', path: dest });
    expect(fs.statSync(dest).size).toBe(1_500_000);
    expect(fs.existsSync(`${dest}.tmp`)).toBe(false);
    expect(d.verify).toHaveBeenCalledTimes(1);

    const [url, init] = (d.fetchFn as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('GeoLite2-Country');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${ACCOUNT}:${KEY}`).toString('base64')}`);
    // Credentials are never logged.
    expect(logs.join('\n')).not.toContain(KEY);
    expect(logs.join('\n')).not.toContain(ACCOUNT);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['an HTTP error', { fetchFn: (async () => ({ ok: false, status: 401 })) as never }, /HTTP 401/],
    ['a network error', { fetchFn: (async () => { throw new Error('ECONNRESET'); }) as never }, /ECONNRESET/],
    ['a corrupt database', { verify: async () => { throw new Error('invalid metadata'); } }, /invalid metadata/],
    ['an implausibly small file', { extract: (_a: string, out: string) => { const p = path.join(out, 'x.mmdb'); fs.writeFileSync(p, 'tiny'); return p; } }, /implausibly small/],
    ['an archive with no database', { extract: () => { throw new Error('no .mmdb file found'); } }, /no \.mmdb/],
  ])('on %s: does NOT throw, leaves any existing database untouched, never logs the credentials', async (_l, over, pattern) => {
    const { dir, dest } = tmpDest();
    fs.writeFileSync(dest, 'previous-good-database');
    const { d, logs } = deps(over as Partial<FetchGeoLite2Deps>);

    const out = await fetchGeoLite2({ MAXMIND_ACCOUNT_ID: ACCOUNT, MAXMIND_LICENSE_KEY: KEY, GEOLITE2_DB_PATH: dest }, d);

    expect(out.status).toBe('failed');
    expect((out as { reason: string }).reason).toMatch(pattern as RegExp);
    expect(fs.readFileSync(dest, 'utf8')).toBe('previous-good-database');
    expect(logs.join('\n')).not.toContain(KEY);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
