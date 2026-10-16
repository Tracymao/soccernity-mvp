import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { disconnectTestPrismaClient } from './reset-database';
import { E2E_INERT_EXTERNAL_ENV, isolateExternalServiceEnv } from './env';

// B-022. The e2e layer must never pick up REAL third-party credentials from a
// developer's root `.env` (a live Highlightly key leaked live matches into
// sports.e2e-spec.ts). test/env.ts pins every external-service credential to
// its inert placeholder before any spec imports AppModule.
describe('e2e external-service key isolation (B-022)', () => {
  afterAll(async () => disconnectTestPrismaClient());

  it('overwrites real-looking credentials already present in the environment with inert placeholders', () => {
    const keys = Object.keys(E2E_INERT_EXTERNAL_ENV);
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      process.env.SPORTS_DATA_API_KEY = 'real-highlightly-key-from-a-dev-machine';
      process.env.EMAIL_PROVIDER_API_KEY = 'real-postmark-server-token';
      process.env.STRIPE_SECRET_KEY = 'sk_live_not_a_test_key';
      process.env.S3_SECRET_KEY = 'real-r2-secret';
      process.env.SENTRY_DSN = 'https://real@sentry.example/1';

      isolateExternalServiceEnv();

      for (const [key, inert] of Object.entries(E2E_INERT_EXTERNAL_ENV)) {
        expect(process.env[key]).toBe(inert);
      }
      expect(process.env.SPORTS_DATA_API_KEY).toBe('replace-me-once-vendor-is-selected');
      expect(process.env.STRIPE_SECRET_KEY).toBe('replace-me');
    } finally {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  });

  it('every placeholder is one the application already treats as "not configured"', () => {
    // The sports client, Postmark and Stripe gateways all key off these exact
    // strings; if one of them changed, isolation would silently stop isolating.
    expect(E2E_INERT_EXTERNAL_ENV.SPORTS_DATA_API_KEY).toBe('replace-me-once-vendor-is-selected');
    expect(E2E_INERT_EXTERNAL_ENV.EMAIL_PROVIDER_API_KEY).toBe('replace-me');
    expect(E2E_INERT_EXTERNAL_ENV.STRIPE_SECRET_KEY).toBe('replace-me');
    expect(E2E_INERT_EXTERNAL_ENV.S3_BUCKET).toBe('replace-me');
  });

  it('the booted application sees the placeholders, whatever the root .env holds', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const config = app.get(ConfigService);
      expect(config.get('SPORTS_DATA_API_KEY')).toBe('replace-me-once-vendor-is-selected');
      expect(config.get('EMAIL_PROVIDER_API_KEY')).toBe('replace-me');
      expect(config.get('STRIPE_SECRET_KEY')).toBe('replace-me');
    } finally {
      await app.close();
    }
  });
});
