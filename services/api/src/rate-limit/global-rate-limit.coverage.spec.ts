import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { HealthController } from '../health/health.controller';
import { AdminMediaController } from '../modules/media/admin-media.controller';
import { PostMediaController } from '../modules/post-media/post-media.controller';
import { PostMediaReportController } from '../modules/post-media/post-media-report.controller';
import { UserAvatarController } from '../modules/users/user-avatar.controller';
import { UserCoverController } from '../modules/users/user-cover.controller';
import { SKIP_GLOBAL_RATE_LIMIT_KEY, UPLOAD_RATE_LIMIT_KEY } from './global-rate-limit.constants';

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
