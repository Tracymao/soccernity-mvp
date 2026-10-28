import * as fs from 'fs';
import * as path from 'path';
import { TEST_CLOCK_ENV_VARS } from './clock/clock';
import { POST_MEDIA_DEFAULTS } from './modules/post-media/post-media.config';
import { GLOBAL_RATE_LIMIT_DEFAULTS } from './rate-limit/global-rate-limit.constants';
import { AUTH_LIMIT_DEFAULTS } from './modules/auth/rate-limit/auth-limits/auth-limits.constants';

// B-018 regression guard. The build register found ~22 variables read in code
// but absent from render.yaml, so a deploy silently ran with code defaults (or
// none). This fails the build the moment code reads an environment variable
// that is not declared in render.yaml (both services) AND documented in
// .env.example.
//
// It finds variables by static pattern -- ConfigService `.get('NAME')` /
// `.getOrThrow('NAME')` and `process.env.NAME` / `process.env['NAME']` -- so a
// name built dynamically or held in a constant would not be seen. That is a
// known blind spot, not a guarantee of completeness.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.resolve(__dirname);

// Not declared in render.yaml on purpose:
//  - NODE_ENV: Render sets it at runtime only; setting it as an envVar would
//    also apply at build time and make `npm install` skip devDependencies.
//  - PORT: Render injects it.
//  - TEST_CLOCK_ISO / TEST_CLOCK_ADVANCE / E2E_TEST_CLOCK: QA only; the process REFUSES TO START if any
//    is set in production (validate-runtime-env.ts), so they must never appear in render.yaml.
const NOT_IN_RENDER = new Set(['NODE_ENV', 'PORT', ...TEST_CLOCK_ENV_VARS]);
// Not in .env.example on purpose: NODE_ENV has a comment-only entry there.
const NOT_IN_EXAMPLE = new Set(['NODE_ENV']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function envVarsReadInCode(): Map<string, string> {
  const found = new Map<string, string>();
  const patterns = [
    /\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
    /process\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g,
    // PostMediaConfig's validated-number reader: `this.num('NAME', default, min, max)`.
    /this\.num\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  ];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        if (!found.has(m[1])) found.set(m[1], path.relative(SRC, file));
      }
    }
  }
  return found;
}

function renderKeysPerService(): Set<string>[] {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
  // One chunk per "- type: web" service; keys are `- key: NAME` lines.
  return text
    .split(/^\s*-\s+type:\s+web\b/m)
    .slice(1)
    .map((chunk) => new Set([...chunk.matchAll(/^\s*-\s+key:\s+([A-Z0-9_]+)/gm)].map((m) => m[1])));
}

function exampleKeys(): Set<string> {
  const text = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
  return new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
}

describe('environment completeness (B-018)', () => {
  const read = envVarsReadInCode();
  const services = renderKeysPerService();
  const example = exampleKeys();

  it('finds a plausible number of variables (guards against the scanner silently matching nothing)', () => {
    expect(read.size).toBeGreaterThan(30);
    expect(services).toHaveLength(2);
    expect(read.has('JWT_SECRET')).toBe(true);
    expect(read.has('WEB_APP_BASE_URL')).toBe(true);
  });

  it('every variable the code reads is declared in render.yaml for BOTH services', () => {
    const missing: string[] = [];
    services.forEach((keys, i) => {
      for (const [name, file] of read) {
        if (!NOT_IN_RENDER.has(name) && !keys.has(name)) missing.push(`service #${i + 1}: ${name} (read in ${file})`);
      }
    });
    expect(missing).toEqual([]);
  });

  it('every variable the code reads is documented in .env.example', () => {
    const missing = [...read].filter(([name]) => !NOT_IN_EXAMPLE.has(name) && !example.has(name)).map(([n, f]) => `${n} (read in ${f})`);
    expect(missing).toEqual([]);
  });

  it('the two services declare the same set of variables (staging is not a different shape)', () => {
    const [staging, prod] = services;
    expect([...staging].filter((k) => !prod.has(k))).toEqual([]);
    expect([...prod].filter((k) => !staging.has(k))).toEqual([]);
  });

  // Global API rate limit. The twelve numbers must exist in code, in render.yaml for BOTH services and in
  // .env.example, and render.yaml / .env.example must carry the same numbers as the code defaults (a deploy
  // that silently ran a different limit from the one the code documents is the drift this spec is for).
  describe('global rate limit variables', () => {
    const NAMES = [
      'GLOBAL_RATE_LIMIT_USER_MAX',
      'GLOBAL_RATE_LIMIT_USER_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_ANON_MAX',
      'GLOBAL_RATE_LIMIT_ANON_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_WRITE_MAX',
      'GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_UPLOAD_MAX',
      'GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_REFRESH_IP_MAX',
      'GLOBAL_RATE_LIMIT_REFRESH_IP_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX',
      'GLOBAL_RATE_LIMIT_REFRESH_TOKEN_WINDOW_MS',
    ] as const;
    const D = GLOBAL_RATE_LIMIT_DEFAULTS;
    const DEFAULT_OF: Record<(typeof NAMES)[number], number> = {
      GLOBAL_RATE_LIMIT_USER_MAX: D.userMax,
      GLOBAL_RATE_LIMIT_USER_WINDOW_MS: D.userWindowMs,
      GLOBAL_RATE_LIMIT_ANON_MAX: D.anonMax,
      GLOBAL_RATE_LIMIT_ANON_WINDOW_MS: D.anonWindowMs,
      GLOBAL_RATE_LIMIT_WRITE_MAX: D.writeMax,
      GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS: D.writeWindowMs,
      GLOBAL_RATE_LIMIT_UPLOAD_MAX: D.uploadMax,
      GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS: D.uploadWindowMs,
      GLOBAL_RATE_LIMIT_REFRESH_IP_MAX: D.refreshIpMax,
      GLOBAL_RATE_LIMIT_REFRESH_IP_WINDOW_MS: D.refreshIpWindowMs,
      GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX: D.refreshTokenMax,
      GLOBAL_RATE_LIMIT_REFRESH_TOKEN_WINDOW_MS: D.refreshTokenWindowMs,
    };

    it('are read by the code, declared in both render.yaml services and documented in .env.example', () => {
      for (const name of NAMES) expect(read.has(name)).toBe(true);
      for (const keys of services) for (const name of NAMES) expect(keys.has(name)).toBe(true);
      for (const name of NAMES) expect(example.has(name)).toBe(true);
    });

    it('do not reuse or collide with the existing POST_MEDIA_UPLOAD_RATE_LIMIT_* names', () => {
      for (const name of NAMES) expect(name.startsWith('POST_MEDIA_')).toBe(false);
      expect(read.has('POST_MEDIA_UPLOAD_RATE_LIMIT_MAX')).toBe(true);
    });

    it('carry the same numbers in render.yaml (both services) and .env.example as the code defaults', () => {
      const renderText = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
      const exampleText = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
      for (const name of NAMES) {
        const inRender = [...renderText.matchAll(new RegExp(`-\\s+key:\\s+${name}\\s+value:\\s+"(\\d+)"`, 'g'))].map((m) => Number(m[1]));
        expect(inRender).toEqual([DEFAULT_OF[name], DEFAULT_OF[name]]);
        const inExample = exampleText.match(new RegExp(`^${name}=(\\d+)\\s*$`, 'm'));
        expect(inExample && Number(inExample[1])).toBe(DEFAULT_OF[name]);
      }
    });
  });

  // Media follow-ups (B-258, B-259; Decision Log #430). The two numbers the build PR introduced must exist in
  // code, in render.yaml for BOTH services and in .env.example, with the same value as the code default.
  describe('post media follow-up variables', () => {
    const DEFAULT_OF: Record<string, number> = {
      POST_MEDIA_REPORT_DAILY_LIMIT: POST_MEDIA_DEFAULTS.reportDailyLimit,
      POST_MEDIA_UNATTACHED_MAX_AGE_DAYS: POST_MEDIA_DEFAULTS.unattachedMaxAgeDays,
    };
    const NAMES = Object.keys(DEFAULT_OF);

    it('are read by the code, declared in both render.yaml services and documented in .env.example', () => {
      for (const name of NAMES) expect(read.has(name)).toBe(true);
      for (const keys of services) for (const name of NAMES) expect(keys.has(name)).toBe(true);
      for (const name of NAMES) expect(example.has(name)).toBe(true);
    });

    it('carry the same numbers in render.yaml (both services) and .env.example as the code defaults', () => {
      const renderText = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
      const exampleText = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
      for (const name of NAMES) {
        const inRender = [...renderText.matchAll(new RegExp(`-\\s+key:\\s+${name}\\s+value:\\s+"(\\d+)"`, 'g'))].map((m) => Number(m[1]));
        expect(inRender).toEqual([DEFAULT_OF[name], DEFAULT_OF[name]]);
        const inExample = exampleText.match(new RegExp(`^${name}=(\\d+)\\s*$`, 'm'));
        expect(inExample && Number(inExample[1])).toBe(DEFAULT_OF[name]);
      }
    });

    it('state the founder-veto-able defaults: 20 reports per rolling 24 hours, purge unattached after 7 days', () => {
      expect(POST_MEDIA_DEFAULTS.reportDailyLimit).toBe(20);
      expect(POST_MEDIA_DEFAULTS.unattachedMaxAgeDays).toBe(7);
    });
  });

  // Auth limits for shared school and club networks (B-256). Same drift guard as the global limits: the eight
  // names must be read in code, declared in both render.yaml services and documented in .env.example, and the
  // numbers in render.yaml / .env.example must equal the code defaults.
  describe('auth limit variables (shared networks)', () => {
    const A = AUTH_LIMIT_DEFAULTS;
    const DEFAULT_OF: Record<string, number> = {
      AUTH_SIGNUP_RATE_LIMIT_MAX: A.signupMax,
      AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: A.signupWindowMs,
      AUTH_LOGIN_FAILED_ATTEMPTS_MAX: A.loginFailedMax,
      AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS: A.loginFailedWindowMs,
      AUTH_IP_CEILING_MAX: A.ipCeilingMax,
      AUTH_IP_CEILING_WINDOW_MS: A.ipCeilingWindowMs,
      AUTH_FORGOT_PASSWORD_EMAIL_MAX: A.forgotEmailMax,
      AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS: A.forgotEmailWindowMs,
    };
    const NAMES = Object.keys(DEFAULT_OF);

    it('are read by the code, declared in both render.yaml services and documented in .env.example', () => {
      for (const name of NAMES) expect(read.has(name)).toBe(true);
      for (const keys of services) for (const name of NAMES) expect(keys.has(name)).toBe(true);
      for (const name of NAMES) expect(example.has(name)).toBe(true);
    });

    it('carry the same numbers in render.yaml (both services) and .env.example as the code defaults', () => {
      const renderText = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');
      const exampleText = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
      for (const name of NAMES) {
        const inRender = [...renderText.matchAll(new RegExp(`-\\s+key:\\s+${name}\\s+value:\\s+"(\\d+)"`, 'g'))].map((m) => Number(m[1]));
        expect(inRender).toEqual([DEFAULT_OF[name], DEFAULT_OF[name]]);
        const inExample = exampleText.match(new RegExp(`^${name}=(\\d+)\\s*$`, 'm'));
        expect(inExample && Number(inExample[1])).toBe(DEFAULT_OF[name]);
      }
    });

    it('state the numbers the founder asked for', () => {
      expect(A).toMatchObject({
        signupMax: 30,
        signupWindowMs: 10 * 60_000,
        loginFailedMax: 5,
        loginFailedWindowMs: 15 * 60_000,
        ipCeilingMax: 60,
        ipCeilingWindowMs: 10 * 60_000,
        forgotEmailMax: 3,
        forgotEmailWindowMs: 60 * 60_000,
      });
    });
  });

  it('declares the B-024 / B-018 additions', () => {
    for (const keys of services) {
      for (const k of ['TRUST_PROXY_HOPS', 'MAXMIND_ACCOUNT_ID', 'MAXMIND_LICENSE_KEY', 'HELD_INVESTIGATION_ALERT_DAYS', 'ADMIN_JWT_SECRET']) {
        expect(keys.has(k)).toBe(true);
      }
    }
  });
});
