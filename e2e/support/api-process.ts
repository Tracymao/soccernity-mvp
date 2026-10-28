import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { API_LOG, FAKE_MEDIA, PORTS, REPO, RUN_DIR, URLS } from './stack';

// The real API process, started and (for the Contest phase scenes of spec 17) RESTARTED on a new
// test-clock instant. The API clock is environment-only (TEST_CLOCK_ISO, services/api/src/clock),
// so moving it means restarting the process; there is deliberately no HTTP endpoint that moves it.
//
// global-setup.ts starts the first API through spawnApi() and the pid is written to .run/api.pid so
// a Playwright worker (a different process) can stop it and start the next one. Teardown calls
// stopApi() and so also stops whichever API is running at the end.

export const API_PID_FILE = path.join(RUN_DIR, 'api.pid');

export interface ApiClock {
  /** An ISO-8601 instant with a zone, e.g. 2026-11-05T02:00:00Z. Omitted = the real clock. */
  iso?: string;
  /** Let the clock run on from `iso` instead of freezing it. */
  advance?: boolean;
  /** Start the API with NO object store configured (the S3_* placeholders), as a fresh deployment is. */
  noObjectStore?: boolean;
}

// ffmpeg / ffprobe for the video half of the media pipeline: the static binaries from the harness's own
// devDependencies, if installed (a video upload FAILS CLOSED without them, so the video tests skip).
function videoTools(): { ffmpeg: string; ffprobe: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpeg = require('ffmpeg-static') as string | null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobe = (require('ffprobe-static') as { path?: string }).path;
    return { ffmpeg: ffmpeg ?? '', ffprobe: ffprobe ?? '' };
  } catch {
    return { ffmpeg: '', ffprobe: '' };
  }
}

/** Everything the API process needs. The three test-clock variables are always written (blank when unused). */
export function apiEnvironment(dbUrl: string, redisUrl: string, clock: ApiClock = {}): NodeJS.ProcessEnv {
  const iso = clock.iso?.trim() ?? '';
  return {
    ...process.env,
    NO_COLOR: '1',
    PORT: String(PORTS.api),
    DATABASE_URL: dbUrl,
    DIRECT_URL: dbUrl,
    REDIS_URL: redisUrl,
    // Email links must point at the QA web server; the email provider stays
    // un-configured on purpose so every would-be email (with its link/token)
    // is written to the API log, which the tests read.
    WEB_APP_BASE_URL: URLS.web,
    // CORS allowlist (QA D-01 fix): the API answers cross-origin browser calls
    // only from these two origins (plus localhost outside production).
    ADMIN_APP_BASE_URL: URLS.admin,
    EMAIL_PROVIDER_API_KEY: 'replace-me',
    // Never let a QA run reach Stripe (the root .env may hold a real test key).
    STRIPE_SECRET_KEY: 'replace-me',
    STRIPE_PUBLISHABLE_KEY: 'replace-me',
    // The default 5/60s auth throttle is far below what a full onboarding
    // suite needs; the throttle itself is covered by services/api's own e2e.
    AUTH_RATE_LIMIT_MAX: '1000',
    // Global API rate limit: a full QA run is hundreds of requests from one IP in minutes, so force the
    // production limits (120 / 600 / 30 / 10) out of the way. The limiter has its own unit and HTTP specs.
    GLOBAL_RATE_LIMIT_USER_MAX: '1000000',
    GLOBAL_RATE_LIMIT_USER_WINDOW_MS: '60000',
    GLOBAL_RATE_LIMIT_ANON_MAX: '1000000',
    GLOBAL_RATE_LIMIT_ANON_WINDOW_MS: '60000',
    GLOBAL_RATE_LIMIT_WRITE_MAX: '1000000',
    GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS: '60000',
    GLOBAL_RATE_LIMIT_UPLOAD_MAX: '1000000',
    GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS: '60000',
    // Auth limits for shared networks (B-256): a full QA run signs up, logs in and resets far more than 30 / 60 / 5 per
    // 10-15 minutes from one IP and one set of emails, and the Redis counters outlive a restart of the API. Forced out of
    // the way; the real numbers are proven by services/api's auth-limits specs (unit, HTTP and real-Redis e2e).
    AUTH_SIGNUP_RATE_LIMIT_MAX: '1000000',
    AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: '600000',
    AUTH_LOGIN_FAILED_ATTEMPTS_MAX: '1000000',
    AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS: '900000',
    AUTH_IP_CEILING_MAX: '1000000',
    AUTH_IP_CEILING_WINDOW_MS: '600000',
    AUTH_FORGOT_PASSWORD_EMAIL_MAX: '1000000',
    AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS: '3600000',
    TRUST_PROXY_HOPS: '',
    // FC10 (B-240): the post media pipeline talks to the local stand-ins in support/fake-media-services.ts
    // (an S3-compatible store and Amazon Rekognition). The real code runs unchanged; only the vendors'
    // answers are fixed. The sweeps run every minute, so the media specs wait up to ~70 s for a decision.
    S3_ENDPOINT: FAKE_MEDIA.storage,
    S3_BUCKET: clock.noObjectStore ? 'replace-me' : FAKE_MEDIA.bucket,
    S3_ACCESS_KEY: clock.noObjectStore ? 'replace-me' : 'qa-access-key',
    S3_SECRET_KEY: clock.noObjectStore ? 'replace-me' : 'qa-secret-key',
    S3_REGION: 'us-east-1',
    S3_PUBLIC_BASE_URL: '',
    REKOGNITION_ACCESS_KEY_ID: 'qa-rekognition-key',
    REKOGNITION_SECRET_ACCESS_KEY: 'qa-rekognition-secret',
    REKOGNITION_REGION: 'eu-west-1',
    AWS_ENDPOINT_URL_REKOGNITION: FAKE_MEDIA.rekognition,
    FFMPEG_PATH: videoTools().ffmpeg,
    FFPROBE_PATH: videoTools().ffprobe,
    TEST_CLOCK_ISO: iso,
    E2E_TEST_CLOCK: iso ? '1' : '',
    TEST_CLOCK_ADVANCE: iso && clock.advance ? '1' : '',
  };
}

/** Starts `node dist/main.js` (already built) and records its pid. `truncateLog` is true only for the first start. */
export function spawnApi(env: NodeJS.ProcessEnv, truncateLog: boolean): ChildProcess {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const log = fs.openSync(API_LOG, truncateLog ? 'w' : 'a');
  const child = spawn('node', ['dist/main.js'], {
    cwd: path.join(REPO, 'services', 'api'),
    env,
    stdio: ['ignore', log, log],
  });
  if (child.pid) fs.writeFileSync(API_PID_FILE, String(child.pid));
  return child;
}

export async function waitForApiHealth(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${URLS.api}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error('API /health never became healthy');
    await new Promise((r) => setTimeout(r, 500));
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Stops the API recorded in .run/api.pid (if any) and waits for its port to close. */
export async function stopApi(): Promise<void> {
  if (fs.existsSync(API_PID_FILE)) {
    const pid = Number(fs.readFileSync(API_PID_FILE, 'utf8').trim());
    if (pid) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
    fs.rmSync(API_PID_FILE, { force: true });
  }
  const start = Date.now();
  while (await portOpen(PORTS.api)) {
    if (Date.now() - start > 30_000) throw new Error(`The API on port ${PORTS.api} did not stop`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Stops the running API and starts a new one on the given test-clock instant (or on the real clock
 * when `clock.iso` is omitted). Database and Redis are the QA ones global-setup created.
 */
export async function restartApi(clock: ApiClock = {}): Promise<void> {
  const dbUrl = process.env.QA_DATABASE_URL;
  const redisUrl = process.env.QA_REDIS_URL;
  if (!dbUrl || !redisUrl) throw new Error('QA_DATABASE_URL / QA_REDIS_URL are not set: global-setup has not run.');
  await stopApi();
  const child = spawnApi(apiEnvironment(dbUrl, redisUrl, clock), false);
  child.unref();
  await waitForApiHealth();
}
