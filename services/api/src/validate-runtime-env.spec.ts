import { assertProductionEnv, findInvalidProductionSecrets } from './validate-runtime-env';

const GOOD = { JWT_SECRET: 'a'.repeat(44), ADMIN_JWT_SECRET: 'b'.repeat(44) };

describe('assertProductionEnv (B-018)', () => {
  it('does nothing outside production, whatever is missing', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'test', JWT_SECRET: 'replace-me' })).not.toThrow();
    expect(() => assertProductionEnv({})).not.toThrow();
  });

  it('passes in production with two distinct real secrets', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', ...GOOD })).not.toThrow();
  });

  it('refuses to start in production when ADMIN_JWT_SECRET is unset (it used to boot and 500 on admin login)', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: GOOD.JWT_SECRET })).toThrow(/ADMIN_JWT_SECRET/);
  });

  it('refuses to start in production when JWT_SECRET is unset', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production', ADMIN_JWT_SECRET: GOOD.ADMIN_JWT_SECRET })).toThrow(/JWT_SECRET/);
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
      assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'same-real-value', ADMIN_JWT_SECRET: 'same-real-value' }),
    ).toThrow(/must differ/);
  });

  it('names every offender and never prints a secret value', () => {
    let message = '';
    try {
      assertProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'replace-me', ADMIN_JWT_SECRET: '' });
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
