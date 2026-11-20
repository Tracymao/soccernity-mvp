import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

// NestJS 10 -> 11 upgrade (sprint-2/nestjs-11-upgrade): @nestjs/config v3 -> v4
// inverts ConfigService.get()'s resolution order. Confirmed by reading
// node_modules/@nestjs/config/dist/config.service.js directly (see this
// file's own comment history / PR description for the full quote): v3 checked
// process.env BEFORE the constructor's internalConfig object (the exact bug
// PR #57 root-caused in token.service.spec.ts's withClearedProcessEnv
// helper); v4's get() now checks getFromInternalConfig() FIRST, then
// getFromValidatedEnv(), then getFromProcessEnv() last.
//
// This codebase has ZERO usage of ConfigModule's `load: [...]` or
// registerAs() custom config factories anywhere (confirmed via grep across
// services/api/src as part of this upgrade) -- AppModule's own
// ConfigModule.forRoot({ isGlobal: true, envFilePath: ... }) call is the only
// real construction site, and it populates values via dotenv reading straight
// into process.env, not into some separate "internal configuration" object.
// So the v3->v4 inversion should have NO practical effect on real app
// behavior: there is no competing internal-config layer for a real env var to
// lose to.
//
// This must be PROVEN, not assumed -- this is the direct, empirical successor
// to the reasoning PR #57 had to learn the hard way. The first describe block
// below constructs ConfigService the exact way AppModule does (envFilePath
// pointing at a real, on-disk .env file, not a hand-built config object) and
// asserts it correctly reads a real, distinctive value back. The second
// documents (and regression-guards) the confirmed inversion itself for the
// `new ConfigService(overrides)` construction pattern token.service.spec.ts's
// buildTokenService() helper uses.
describe('ConfigService construction, the same way AppModule builds it (envFilePath, real file on disk)', () => {
  let tmpDir: string;
  let envFilePath: string;
  const DISTINCTIVE_VALUE = 'nestjs11-config-precedence-proof-8f3d1c';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soccernity-config-precedence-'));
    envFilePath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envFilePath,
      `SOCCERNITY_CONFIG_PRECEDENCE_PROOF=${DISTINCTIVE_VALUE}\n`,
      'utf8',
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a real, distinctive env var loaded from a real envFilePath, exactly like app.module.ts constructs ConfigModule', async () => {
    // Mirrors app.module.ts's own ConfigModule.forRoot({ isGlobal: true,
    // envFilePath: ... }) call verbatim -- no custom `load`/registerAs
    // factories, no hand-built internalConfig object passed anywhere. If
    // v4's precedence inversion mattered for this app's real construction
    // pattern, it would surface here.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath })],
    }).compile();

    const configService = moduleRef.get(ConfigService);

    expect(configService.get('SOCCERNITY_CONFIG_PRECEDENCE_PROOF')).toBe(DISTINCTIVE_VALUE);

    await moduleRef.close();
  });

  it('still falls back to a supplied default for a key that exists in neither the env file nor process.env', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath })],
    }).compile();

    const configService = moduleRef.get(ConfigService);

    expect(configService.get('SOCCERNITY_KEY_THAT_DOES_NOT_EXIST', 'fallback-value')).toBe(
      'fallback-value',
    );

    await moduleRef.close();
  });
});

describe('ConfigService(overrides) construction (token.service.spec.ts buildTokenService() pattern) under @nestjs/config v4', () => {
  const KEY = 'SOCCERNITY_OVERRIDE_PRECEDENCE_PROOF';

  afterEach(() => {
    delete process.env[KEY];
  });

  it('documents the confirmed v3 -> v4 inversion: internalConfig (the constructor argument) now wins over process.env, not the other way around', () => {
    // Under @nestjs/config v3 this exact scenario was the bug PR #57 fixed
    // around: process.env, if set, silently beat the internalConfig object
    // passed directly into `new ConfigService(...)`. Confirmed by reading
    // config.service.js's get() ordering under v4: getFromInternalConfig()
    // runs first now, so this assertion would have failed under v3 with
    // process.env set (it would have returned 'from-process-env' instead).
    process.env[KEY] = 'from-process-env';
    const configService = new ConfigService({ [KEY]: 'from-internal-config' });

    expect(configService.get(KEY)).toBe('from-internal-config');
  });

  it('internalConfig still wins even with no competing process.env value set at all', () => {
    delete process.env[KEY];
    const configService = new ConfigService({ [KEY]: 'from-internal-config' });

    expect(configService.get(KEY)).toBe('from-internal-config');
  });
});
