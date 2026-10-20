import { assertProductionEnv, findInvalidProductionOrigins, findInvalidProductionSecrets } from './validate-runtime-env';

const GOOD_SECRETS = { JWT_SECRET: 'a'.repeat(44), ADMIN_JWT_SECRET: 'b'.repeat(44) };
const GOOD_URLS = { WEB_APP_BASE_URL: 'https://soccernity.com', ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' };
const GOOD = { ...GOOD_SECRETS, ...GOOD_URLS };

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
