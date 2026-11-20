import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { HealthController } from '../health/health.controller';
import { AdminMediaController } from '../modules/media/admin-media.controller';
import { PostMediaController } from '../modules/post-media/post-media.controller';
import { PostMediaReportController } from '../modules/post-media/post-media-report.controller';
import { UserAvatarController } from '../modules/users/user-avatar.controller';
import { UserCoverController } from '../modules/users/user-cover.controller';
import {
  REFRESH_RATE_LIMIT_KEY,
  SKIP_GLOBAL_RATE_LIMIT_KEY,
  SKIP_GLOBAL_WRITE_LIMIT_KEY,
  UPLOAD_RATE_LIMIT_KEY,
} from './global-rate-limit.constants';
import { AuthController } from '../modules/auth/auth.controller';

// Drift traps for the global rate limit. The exemptions and the upload class are opt-in metadata on
// handlers, so a new FileInterceptor route that forgets the tag, or an exemption that silently
// disappears, must fail the build rather than ship.
const reflector = new Reflector();
const SRC = path.resolve(__dirname, '..');

const skips = (klass: { prototype: any }, handler: string) =>
  reflector.getAllAndOverride<boolean>(SKIP_GLOBAL_RATE_LIMIT_KEY, [klass.prototype[handler], klass]) === true;
const isUpload = (klass: { prototype: any }, handler: string) =>
  reflector.getAllAndOverride<boolean>(UPLOAD_RATE_LIMIT_KEY, [klass.prototype[handler], klass]) === true;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') sourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('global rate limit: exemptions', () => {
  it('exempts GET /health', () => {
    expect(skips(HealthController, 'check')).toBe(true);
  });

  it('exempts POST /media/uploads (it has its own per-user limit) and nothing else on that controller', () => {
    expect(skips(PostMediaController, 'create')).toBe(true);
    for (const handler of ['confirm', 'get', 'remove']) expect(skips(PostMediaController, handler)).toBe(false);
  });

  it('gives the other post-media route (report) the ordinary writes limit', () => {
    const handlers = Object.getOwnPropertyNames(PostMediaReportController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) expect(skips(PostMediaReportController, handler)).toBe(false);
  });

  it('exempts nothing that the brief did not name', () => {
    // Every non-spec source file that uses the decorator: the decorator's own file, the health
    // controller and the post-media controller. A new use is a reviewable change.
    const users = sourceFiles(SRC)
      .filter((f) => /@SkipGlobalRateLimit\(\)/.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')))
      .map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
      .sort();
    expect(users).toEqual(['health/health.controller.ts', 'modules/post-media/post-media.controller.ts']);
  });
});

describe('global rate limit: upload class', () => {
  it('tags the avatar, cover and admin media upload routes', () => {
    expect(isUpload(UserAvatarController, 'upload')).toBe(true);
    expect(isUpload(UserCoverController, 'upload')).toBe(true);
    expect(isUpload(AdminMediaController, 'upload')).toBe(true);
  });

  it('does not tag the browser-to-bucket upload routes (their bytes never reach the API)', () => {
    for (const handler of ['create', 'confirm', 'get', 'remove']) expect(isUpload(PostMediaController, handler)).toBe(false);
  });

  it('every FileInterceptor route in the source carries @UploadRateLimit()', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const code = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      const interceptors = (code.match(/@UseInterceptors\([^)]*FileInterceptor\(/g) ?? []).length;
      const tags = (code.match(/@UploadRateLimit\(\)/g) ?? []).length;
      if (interceptors !== tags) missing.push(`${path.relative(SRC, file)}: ${interceptors} FileInterceptor route(s), ${tags} @UploadRateLimit()`);
    }
    expect(missing).toEqual([]);
  });
});

// ---- @SkipGlobalWriteLimit() (the writes-class exemption) -------------------------------------------------
// A handler that carries its own, stricter limiter must not ALSO draw on the shared 30-per-minute writes budget
// (for a signed-out caller that key is the IP, so a class of children behind one school IP shared it). The tag
// is opt-in metadata on the handler, so the build checks it both ways: every handler with one of these limiters
// has it, and nothing else does except POST /auth/refresh, which has @RefreshRateLimit() instead.
const LIMITER_DECORATORS = ['AuthLimit', 'AuthRateLimit', 'GuardianWithdrawalRateLimit'];
const DECORATOR = '@\\w+\\((?:[^()]|\\([^()]*\\))*\\)';

interface HandlerBlock {
  file: string;
  method: string;
  decorators: string[];
}

// Every decorated method in a non-spec source file: the run of decorators directly above a method signature.
function handlerBlocks(): HandlerBlock[] {
  const blocks: HandlerBlock[] = [];
  const re = new RegExp('((?:[ \\t]*' + DECORATOR + '[ \\t]*\\n)+)[ \\t]*(?:async\\s+)?(\\w+)\\s*[(<]', 'g');
  for (const file of sourceFiles(SRC)) {
    const code = fs
      .readFileSync(file, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(re)) {
      blocks.push({
        file: path.relative(SRC, file).replace(/\\/g, '/'),
        method: m[2],
        decorators: [...m[1].matchAll(/@(\w+)\(/g)].map((d) => d[1]),
      });
    }
  }
  return blocks;
}

const label = (b: HandlerBlock) => b.file + '#' + b.method;

describe('global rate limit: @SkipGlobalWriteLimit() coverage', () => {
  const blocks = handlerBlocks();
  const withLimiter = blocks.filter((b) => b.decorators.some((d) => LIMITER_DECORATORS.includes(d)));

  it('finds the handlers it is meant to police (guards against a regex that silently matches nothing)', () => {
    expect(withLimiter.length).toBeGreaterThanOrEqual(18);
    expect(withLimiter.map(label)).toEqual(
      expect.arrayContaining([
        'modules/auth/auth.controller.ts#login',
        'modules/auth/registration/registration.controller.ts#register',
        'modules/auth/password-reset/password-reset.controller.ts#forgotPassword',
        'modules/admin/admin-auth.controller.ts#login',
        'modules/auth/guardian-consent/guardian-consent.controller.ts#requestWithdrawal',
        'modules/auth/guardian-consent/guardian-consent.controller.ts#withdraw',
      ]),
    );
  });

  it('every handler that carries @AuthLimit, @AuthRateLimit or the guardian-withdrawal throttle is tagged', () => {
    expect(withLimiter.filter((b) => !b.decorators.includes('SkipGlobalWriteLimit')).map(label)).toEqual([]);
  });

  it('no other handler carries the tag, except POST /auth/refresh (which has @RefreshRateLimit())', () => {
    const extra = blocks
      .filter((b) => b.decorators.includes('SkipGlobalWriteLimit'))
      .filter((b) => !b.decorators.some((d) => LIMITER_DECORATORS.includes(d)))
      .map(label);
    expect(extra).toEqual(['modules/auth/auth.controller.ts#refresh']);
  });

  it('@RefreshRateLimit() is used on POST /auth/refresh only (admin refresh is unchanged)', () => {
    expect(blocks.filter((b) => b.decorators.includes('RefreshRateLimit')).map(label)).toEqual([
      'modules/auth/auth.controller.ts#refresh',
    ]);
  });

  it('the metadata really is on the handlers (not only in the source text)', () => {
    const meta = (key: string, handler: string) =>
      reflector.getAllAndOverride<boolean>(key, [AuthController.prototype[handler as 'login'], AuthController]) === true;
    for (const handler of ['login', 'refresh', 'reactivateAccount', 'deleteInactiveAccount']) {
      expect(meta(SKIP_GLOBAL_WRITE_LIMIT_KEY, handler)).toBe(true);
    }
    for (const handler of ['logout', 'changePassword', 'deactivateAccount', 'deleteAccount']) {
      expect(meta(SKIP_GLOBAL_WRITE_LIMIT_KEY, handler)).toBe(false);
    }
    expect(meta(REFRESH_RATE_LIMIT_KEY, 'refresh')).toBe(true);
    expect(meta(REFRESH_RATE_LIMIT_KEY, 'login')).toBe(false);
    // the writes-class tag never turns into a full exemption
    for (const handler of ['login', 'refresh']) expect(meta(SKIP_GLOBAL_RATE_LIMIT_KEY, handler)).toBe(false);
  });
});
