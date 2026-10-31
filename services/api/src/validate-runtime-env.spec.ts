import { assertProductionEnv, findInvalidProductionOrigins, findInvalidProductionSecrets } from './validate-runtime-env';

const GOOD_SECRETS = { JWT_SECRET: 'a'.repeat(44), ADMIN_JWT_SECRET: 'b'.repeat(44) };
const GOOD_URLS = { WEB_APP_BASE_URL: 'https://soccernity.com', ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' };
const GOOD_DOB_KEY = Buffer.alloc(32, 7).toString('base64');
const GOOD = { ...GOOD_SECRETS, ...GOOD_URLS, DOB_ENCRYPTION_KEY: GOOD_DOB_KEY };

describe('assertProductionEnv (B-018)', () => {
  it('does nothing outside production, whatever is missing', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test', JWT_SECRET: 'replace-me' })).not.toThrow();
    expect(() => assertProductionEnv({})).not.toThrow();
  });

  it('passes in production with two distinct real secrets and real app URLs', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD })).not.toThrow();
  });

  it('does not check the app URLs outside production', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development', WEB_APP_BASE_URL: 'http://localhost:5173' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test', ...GOOD_SECRETS })).not.toThrow();
  });

  it('refuses to start in production when ADMIN_JWT_SECRET is unset (it used to boot and 500 on admin login)', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD_URLS, JWT_SECRET: GOOD.JWT_SECRET })).toThrow(/ADMIN_JWT_SECRET/);
  });

  it('refuses to start in production when JWT_SECRET is unset', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD_URLS, ADMIN_JWT_SECRET: GOOD.ADMIN_JWT_SECRET })).toThrow(/JWT_SECRET/);
  });

  it.each([['replace-me'], ['Replace-Me'], ['replace-me-please'], ['changeme'], ['  '], ['']])(
    'refuses a placeholder / blank secret (%p)',
    (value) => {
      expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD, JWT_SECRET: value })).toThrow(/JWT_SECRET/);
      expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD, ADMIN_JWT_SECRET: value })).toThrow(/ADMIN_JWT_SECRET/);
    },
  );

  it('refuses when both secrets are the same value (would defeat admin/user token isolation)', () => {
    expect(() =>
      assertProductionEnv({ NODE_ENV: 'production', ...GOOD_URLS, JWT_SECRET: 'same-real-value', ADMIN_JWT_SECRET: 'same-real-value' }),
    ).toThrow(/must differ/);
  });

  it('names every offender and never prints a secret value', () => {
    let message = '';
    try {
      assertProductionEnv({ NODE_ENV: 'production', ...GOOD_URLS, JWT_SECRET: 'replace-me', ADMIN_JWT_SECRET: '' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('ADMIN_JWT_SECRET');
    expect(message).not.toContain('replace-me');
  });

  it('findInvalidProductionSecrets lists nothing for good values', () => {
    expect(findInvalidProductionSecrets(GOOD)).toEqual([]);
  });
});

describe('assertProductionEnv: app origins (B-163)', () => {
  const prod = (over: Record<string, string | undefined>) => ({ NODE_ENV: 'production', ...GOOD, ...over });

  it.each(['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL'])('refuses to start when %s is unset', (name) => {
    expect(() => assertProductionEnv(prod({ [name]: undefined }))).toThrow(new RegExp(name));
  });

  it.each(['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL'])('refuses to start when %s is blank', (name) => {
    expect(() => assertProductionEnv(prod({ [name]: '   ' }))).toThrow(new RegExp(name));
  });

  it.each([
    ['not a URL', 'soccernity dot com'],
    ['no scheme', 'soccernity.com'],
    ['a non-http scheme', 'ftp://soccernity.com'],
    ['a .example placeholder host', 'https://web.example'],
    ['the bare placeholder host', 'https://example'],
    ['a replace-me host', 'https://replace-me.onrender.com'],
    ['plain http', 'http://soccernity.com'],
    ['localhost over https', 'https://localhost:5173'],
    ['localhost over http', 'http://localhost:5173'],
    ['127.0.0.1', 'https://127.0.0.1'],
  ])('refuses %s (%s)', (_label, value) => {
    for (const name of ['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL']) {
      expect(() => assertProductionEnv(prod({ [name]: value }))).toThrow(new RegExp(name));
    }
  });

  it('names every offending URL and no secret', () => {
    let message = '';
    try {
      assertProductionEnv(prod({ WEB_APP_BASE_URL: undefined, ADMIN_APP_BASE_URL: 'http://localhost:5174' }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('WEB_APP_BASE_URL');
    expect(message).toContain('ADMIN_APP_BASE_URL');
    expect(message).not.toContain(GOOD.JWT_SECRET);
  });

  it('accepts https origins with a port or a path', () => {
    expect(() =>
      assertProductionEnv(prod({ WEB_APP_BASE_URL: 'https://app.soccernity.com:8443/', ADMIN_APP_BASE_URL: 'https://admin.soccernity.com/x' })),
    ).not.toThrow();
  });

  it('findInvalidProductionOrigins lists nothing for good values', () => {
    expect(findInvalidProductionOrigins(GOOD)).toEqual([]);
  });
});

describe('assertProductionEnv: the QA test clock (backend/test-clock-qa)', () => {
  const PROD = { NODE_ENV: 'production', ...GOOD };

  it('passes in production when no test-clock variable is set (or they are blank)', () => {
    expect(() => assertProductionEnv(PROD)).not.toThrow();
    expect(() => assertProductionEnv({ ...PROD, TEST_CLOCK_ISO: '', E2E_TEST_CLOCK: '  ' })).not.toThrow();
  });

  it.each([
    [{ TEST_CLOCK_ISO: '2026-11-05T10:00:00Z' }, 'TEST_CLOCK_ISO'],
    [{ E2E_TEST_CLOCK: '1' }, 'E2E_TEST_CLOCK'],
    [{ TEST_CLOCK_ADVANCE: '1' }, 'TEST_CLOCK_ADVANCE'],
    [{ TEST_CLOCK_ISO: '2026-11-05T10:00:00Z', E2E_TEST_CLOCK: '1' }, 'TEST_CLOCK_ISO, E2E_TEST_CLOCK'],
  ])('REFUSES TO START in production when %j is set', (vars, named) => {
    expect(() => assertProductionEnv({ ...PROD, ...vars })).toThrow(/Refusing to start: the QA test clock/);
    expect(() => assertProductionEnv({ ...PROD, ...vars })).toThrow(named);
  });

  it('refuses even when every other production check would pass', () => {
    expect(() => assertProductionEnv({ ...PROD, TEST_CLOCK_ISO: '2026-11-05T10:00:00Z' })).toThrow();
    expect(() => assertProductionEnv(PROD)).not.toThrow();
  });

  it('does not touch non-production processes', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'test', TEST_CLOCK_ISO: '2026-11-05T10:00:00Z' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'development', E2E_TEST_CLOCK: '1' })).not.toThrow();
  });
});


describe('assertProductionEnv: DOB_ENCRYPTION_KEY (B-252, Decision Log #425)', () => {
  const production = (key: string | undefined) => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'production', ...GOOD };
    if (key === undefined) delete env.DOB_ENCRYPTION_KEY;
    else env.DOB_ENCRYPTION_KEY = key;
    return env;
  };
  const b64 = (bytes: number) => Buffer.alloc(bytes, 9).toString('base64');

  it('passes with one valid 32-byte base64 key', () => {
    expect(() => assertProductionEnv(production(b64(32)))).not.toThrow();
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['whitespace', '   '],
    ['the placeholder', 'replace-me'],
    ['31 bytes', b64(31)],
    ['33 bytes', b64(33)],
    ['non-base64 text', 'this is not a key!!'],
  ])('refuses to start in production when the key is %s', (_label, value) => {
    expect(() => assertProductionEnv(production(value))).toThrow(/DOB_ENCRYPTION_KEY.*32 bytes/);
  });

  it('points to docs/deployment.md', () => {
    expect(() => assertProductionEnv(production(undefined))).toThrow(/docs\/deployment\.md/);
  });

  it('ignores a bad key outside production', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development', DOB_ENCRYPTION_KEY: 'replace-me' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test', DOB_ENCRYPTION_KEY: b64(31) })).not.toThrow();
    expect(() => assertProductionEnv({})).not.toThrow();
  });

  it('never puts the key value in the error', () => {
    for (const bad of [b64(31), b64(33), 'this is not a key!!', 'replace-me']) {
      let message = '';
      try {
        assertProductionEnv(production(bad));
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('DOB_ENCRYPTION_KEY');
      expect(message).not.toContain(bad);
    }
  });
});

describe('assertProductionEnv: key rotation settings (DOB_ENCRYPTION_KEY_VERSION / _PREVIOUS)', () => {
  const b64 = (fill: number, bytes = 32) => Buffer.alloc(bytes, fill).toString('base64');
  const production = (over: Record<string, string | undefined>) => ({ NODE_ENV: 'production', ...GOOD, ...over });

  it('unset version and previous (every deployment before a rotation) boots exactly as before', () => {
    expect(() => assertProductionEnv(production({}))).not.toThrow();
  });

  it('a valid rotation (version 2 + a different previous key) boots', () => {
    expect(() =>
      assertProductionEnv(production({ DOB_ENCRYPTION_KEY: b64(9), DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: b64(7) })),
    ).not.toThrow();
  });

  it('after the rotation (version 2, previous removed) boots', () => {
    expect(() => assertProductionEnv(production({ DOB_ENCRYPTION_KEY_VERSION: '2' }))).not.toThrow();
  });

  it('a blank previous key (how Render stores an emptied value) boots', () => {
    expect(() => assertProductionEnv(production({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: '' }))).not.toThrow();
  });

  it.each(['0', '-2', '1.5', 'two', '1e1', '02'])('refuses to start with the version %j', (version) => {
    expect(() => assertProductionEnv(production({ DOB_ENCRYPTION_KEY_VERSION: version }))).toThrow(/DOB_ENCRYPTION_KEY_VERSION/);
  });

  it.each([
    ['31 bytes', b64(3, 31)],
    ['33 bytes', b64(3, 33)],
    ['non-base64 text', 'this is not a key!!'],
    ['the placeholder', 'replace-me'],
  ])('refuses to start when the previous key is %s', (_label, previous) => {
    expect(() =>
      assertProductionEnv(production({ DOB_ENCRYPTION_KEY: b64(9), DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: previous })),
    ).toThrow(/DOB_ENCRYPTION_KEY_PREVIOUS/);
  });

  it('refuses to start when the previous key equals the current one', () => {
    expect(() => assertProductionEnv(production({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: GOOD_DOB_KEY }))).toThrow(
      /must differ/,
    );
  });

  it('refuses to start when a previous key is set but the version was left at 1 or unset (the forgotten-bump mistake)', () => {
    const previous = b64(5);
    expect(() => assertProductionEnv(production({ DOB_ENCRYPTION_KEY: b64(9), DOB_ENCRYPTION_KEY_PREVIOUS: previous }))).toThrow(/VERSION is 1/);
    expect(() =>
      assertProductionEnv(production({ DOB_ENCRYPTION_KEY: b64(9), DOB_ENCRYPTION_KEY_VERSION: '1', DOB_ENCRYPTION_KEY_PREVIOUS: previous })),
    ).toThrow(/VERSION is 1/);
  });

  it('ignores bad rotation settings outside production', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development', DOB_ENCRYPTION_KEY_VERSION: 'nope' })).not.toThrow();
  });

  it('never puts a key value in the error', () => {
    const current = b64(9);
    for (const previous of [b64(3, 31), current, 'this is not a key!!', b64(5)]) {
      let message = '';
      try {
        assertProductionEnv(production({ DOB_ENCRYPTION_KEY: current, DOB_ENCRYPTION_KEY_PREVIOUS: previous }));
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(current);
      expect(message).not.toContain(previous);
    }
  });
});
