import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { EmailVerifiedGuard } from './modules/auth/guards/email-verified.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { GuardianConsentGuard } from './modules/auth/guards/guardian-consent.guard';
import { ProfileCompleteGuard } from './modules/auth/guards/profile-complete.guard';
import { BanterController } from './modules/banter/banter.controller';
import { BlockController } from './modules/block/block.controller';
import { ClubsController } from './modules/clubs/clubs.controller';
import { CommunityGroupsController } from './modules/community-groups/community-groups.controller';
import { ContestController } from './modules/contest/contest.controller';
import { FeedController } from './modules/feed/feed.controller';
import { GrassrootsFixturesController } from './modules/grassroots/grassroots-fixtures.controller';
import { GrassrootsTeamsController } from './modules/grassroots/grassroots-teams.controller';
import { ConversationsController } from './modules/messaging/conversations.controller';
import { PublicReportsController } from './modules/moderation/public-reports.controller';
import { ReportsController } from './modules/moderation/reports.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { SportsMatchesController } from './modules/sports/sports-matches.controller';
import { UserAvatarController } from './modules/users/user-avatar.controller';
import { UserCoverController } from './modules/users/user-cover.controller';
import { UsersController } from './modules/users/users.controller';

// B-026 / B-118 / B-027 (Decision Log #370, #403 item 15, #369): the route
// inventory, pinned. Three rules are enforced at the guard level:
//
//   C  GuardianConsentGuard   a restricted-pending user cannot perform ANY
//                             social or profile write (#370) -- including the
//                             undo forms (unlike, unfollow, delete own post):
//                             a restricted-pending account has nothing to undo,
//                             and a uniform rule is the one that cannot drift.
//   E  EmailVerifiedGuard     an unverified-email user cannot perform a social
//                             write (#403 item 15). Applied to the CREATING
//                             forms only; removing or undoing your own content
//                             stays open to an unverified user.
//   P  ProfileCompleteGuard   no username yet -> cannot post (#369). Applied to
//                             routes that publish content or send a message
//                             under the user's identity.
//
// This spec is a DRIFT TRAP. A new write route with no entry below, or an entry
// whose guards no longer match, fails the build -- which is the point: "needs a
// build PR that re-checks every JwtAuthGuard-only write route" (#370) should not
// have to be repeated by hand next time.

type Flags = '' | 'C' | 'CE' | 'CEP';

// Routes the decisions deliberately leave OPEN, each with the reason.
const OPEN_ROUTES: Record<string, string> = {
  'POST /reports': 'report/appeal stay open to a restricted-pending user (#370)',
  'POST /reports/:id/appeal': 'report/appeal stay open to a restricted-pending user (#370)',
  'POST /reports/public': 'unauthenticated public report',
  'PATCH /notifications/read-all': 'own inbox read-state; not a social or profile write',
  'PATCH /notifications/:id/read': 'own inbox read-state; not a social or profile write',
  'PATCH /conversations/:id/read': 'own read-state; touches no one else',
  'PUT /sports/matches/:id/subscription': 'private kickoff-alert preference; founder-confirmed JwtAuthGuard-only (sprint-4/match-kickoff-alerts)',
  'DELETE /sports/matches/:id/subscription': 'private kickoff-alert preference',
  'POST /posts/:id/view': 'anonymous aggregate view tally; OptionalJwtAuthGuard by design',
  'DELETE /teams/:id': 'admin-only (AdminJwtAuthGuard), a different auth domain',
  // B-197 (Decision Log #411 item 5): a safety action needs authentication only (JwtAuthGuard stays, pinned below).
  'POST /users/:id/block': 'a restricted-pending or unverified account must still be able to block (#411 item 5)',
  'DELETE /users/:id/block': 'a restricted-pending or unverified account must still be able to unblock (#411 item 5)',
};

const EXPECTED: Record<string, Flags> = {
  // users
  'PATCH /users/:id': 'CE',
  'PATCH /users/:id/represented-club': 'CE',
  'POST /users/:id/follow': 'CE',
  'DELETE /users/:id/follow': 'C',
  // B-035 (avatar): a profile write. Deliberately NOT P: the avatar is chosen at Create Profile, before the username exists.
  'POST /users/:id/avatar': 'CE',
  'DELETE /users/:id/avatar': 'C',
  // B-196 (cover photo): the avatar's rule exactly -- a profile write, so C on both forms and E on the creating
  // form; deliberately NOT P (the cover is optional at Create Profile, before the username exists).
  'POST /users/:id/cover': 'CE',
  'DELETE /users/:id/cover': 'C',
  // posts
  'POST /posts': 'CEP',
  'POST /posts/:id/like': 'CE',
  'DELETE /posts/:id/like': 'C',
  'POST /posts/:id/comments': 'CEP',
  'DELETE /posts/:id': 'C',
  'PATCH /posts/:id/comment-settings': 'C',
  'PATCH /posts/:id/comments/:commentId/hide': 'C',
  'PATCH /posts/:id/comments/:commentId/unhide': 'C',
  'DELETE /posts/:id/comments/:commentId': 'C',
  'POST /posts/:id/save': 'CE',
  'DELETE /posts/:id/save': 'C',
  // clubs
  'POST /clubs/:id/join': 'CE',
  'DELETE /clubs/:id/join': 'C',
  // banter rooms
  'POST /banter-rooms': 'CEP',
  'POST /banter-rooms/:id/join': 'CE',
  'DELETE /banter-rooms/:id/join': 'C',
  'POST /banter-rooms/:id/posts': 'CEP',
  'PATCH /banter-rooms/:id/status': 'C',
  'POST /banter-rooms/:id/topics': 'CE',
  // community groups
  'POST /community-groups': 'CEP',
  'POST /community-groups/:id/join': 'CE',
  'DELETE /community-groups/:id/join': 'C',
  // messaging
  'POST /conversations': 'CEP',
  'POST /conversations/:id/messages': 'CEP',
  // contest (backend/w7-contest, B-091)
  'POST /contest/entries': 'CEP',
  // A finalist's final upload creates a post under the user's identity: the full CEP stack.
  'POST /contest/final-entry': 'CEP',
  // Voting (#370 uniform write block, #393 accounts with restrictions cannot vote): a vote is a
  // CREATING form, so C + E; NOT P (voting publishes nothing under the user's identity). Un-voting is
  // an undo, so C only (the like / unlike precedent).
  'PUT /contest/entries/:entryId/vote': 'CE',
  'DELETE /contest/entries/:entryId/vote': 'C',
  // grassroots
  'POST /teams': 'CE',
  'POST /fixtures': 'CE',
  'POST /fixtures/:id/result': 'CE',
  'PATCH /fixtures/:id/status': 'CE',
};

// Every non-admin, non-auth controller that has write routes. Admin
// controllers are a separate auth domain (AdminJwtAuthGuard); the auth
// controllers are the open set by design (login, password, deactivate/delete,
// guardian-consent token routes, change-guardian-email, logout).
const CONTROLLERS = [
  UsersController,
  BlockController,
  UserAvatarController,
  UserCoverController,
  FeedController,
  ClubsController,
  BanterController,
  CommunityGroupsController,
  ConversationsController,
  ContestController,
  GrassrootsTeamsController,
  GrassrootsFixturesController,
  ReportsController,
  PublicReportsController,
  NotificationsController,
  SportsMatchesController,
];

// Controller files deliberately NOT in CONTROLLERS, with the reason. A new
// *.controller.ts that is in neither list fails the build.
const NOT_INSPECTED_DIRS = [
  'admin', // every admin-* module: AdminJwtAuthGuard domain
  'auth', // the open set by design
  'blog', // read-only
  'leaderboard', // read-only
  'search', // read-only
  'sports', // sports-standings.controller is read-only (matches controller is inspected)
  'health',
  'feed', // saved-posts.controller is read-only (feed.controller is inspected)
];

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

function guardsOf(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];
}

function flagsFor(ctrl: new (...a: never[]) => unknown, handler: object): string {
  const all = [...guardsOf(ctrl), ...guardsOf(handler)];
  return (
    (all.includes(GuardianConsentGuard) ? 'C' : '') +
    (all.includes(EmailVerifiedGuard) ? 'E' : '') +
    (all.includes(ProfileCompleteGuard) ? 'P' : '')
  );
}

function joinPath(base: string, route: string): string {
  const parts = [base, route].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  return `/${parts.join('/')}`;
}

interface Route {
  key: string;
  flags: string;
}

function writeRoutes(): Route[] {
  const routes: Route[] = [];
  for (const ctrl of CONTROLLERS) {
    const base = (Reflect.getMetadata(PATH_METADATA, ctrl) as string) ?? '';
    for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = (ctrl.prototype as unknown as Record<string, unknown>)[name];
      if (typeof handler !== 'function' || name === 'constructor') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      if (method === undefined || method === RequestMethod.GET) continue;
      const route = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '/';
      routes.push({
        key: `${METHOD_NAMES[method] ?? String(method)} ${joinPath(base, route)}`,
        flags: flagsFor(ctrl as never, handler),
      });
    }
  }
  return routes;
}

describe('write-route guard inventory (B-026 / B-118 / B-027)', () => {
  const routes = writeRoutes();

  it('discovers a plausible number of write routes (the scan itself works)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(Object.keys(EXPECTED).length + Object.keys(OPEN_ROUTES).length - 1);
  });

  it('every write route is either in the expected table or deliberately open, with no strays', () => {
    const known = new Set([...Object.keys(EXPECTED), ...Object.keys(OPEN_ROUTES)]);
    const unknown = routes.map((r) => r.key).filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it('every table entry still corresponds to a real route (no stale rows)', () => {
    const real = new Set(routes.map((r) => r.key));
    const stale = [...Object.keys(EXPECTED), ...Object.keys(OPEN_ROUTES)].filter((k) => !real.has(k));
    // DELETE /teams/:id lives on a controller we do inspect; every key must exist.
    expect(stale).toEqual([]);
  });

  it.each(Object.entries(EXPECTED))('%s carries exactly the guards "%s"', (key, expected) => {
    const route = routes.find((r) => r.key === key);
    expect(route?.flags).toBe(expected);
  });

  it('every route the decisions leave open really does NOT carry the consent / email / profile guards', () => {
    for (const key of Object.keys(OPEN_ROUTES)) {
      const route = routes.find((r) => r.key === key);
      expect(route?.flags).toBe('');
    }
  });

  // B-197: exempt from the consent and email guards, but NOT unauthenticated.
  it('Block, unblock and the blocked list keep JwtAuthGuard and carry no consent / email guard anywhere', () => {
    expect(guardsOf(BlockController)).toContain(JwtAuthGuard);
    for (const name of ['block', 'unblock', 'list']) {
      const handler = (BlockController.prototype as unknown as Record<string, object>)[name];
      expect(handler).toBeDefined();
      expect(flagsFor(BlockController as never, handler)).toBe('');
    }
  });

  it('every open route has a stated reason', () => {
    for (const reason of Object.values(OPEN_ROUTES)) expect(reason.length).toBeGreaterThan(10);
  });

  it('no controller file exists that this inventory neither inspects nor deliberately skips', () => {
    const modulesDir = path.join(__dirname, 'modules');
    const inspectedFiles = new Set(CONTROLLERS.map((c) => c.name));
    const unaccounted: string[] = [];
    for (const dir of fs.readdirSync(modulesDir)) {
      const full = path.join(modulesDir, dir);
      if (!fs.statSync(full).isDirectory()) continue;
      const walk = (d: string): string[] =>
        fs.readdirSync(d).flatMap((f) => {
          const p = path.join(d, f);
          return fs.statSync(p).isDirectory() ? walk(p) : [p];
        });
      for (const file of walk(full)) {
        if (!file.endsWith('.controller.ts')) continue;
        const text = fs.readFileSync(file, 'utf8');
        const cls = /export class (\w+Controller)\b/.exec(text)?.[1];
        const skipped = path.basename(file).includes('admin') || NOT_INSPECTED_DIRS.some((d) => dir === d || dir.startsWith(`${d}-`));
        if (cls && !inspectedFiles.has(cls) && !skipped) unaccounted.push(`${dir}/${path.basename(file)}`);
      }
    }
    expect(unaccounted).toEqual([]);
  });

  it('read-only skipped directories really have no write routes outside the inspected controllers', () => {
    // sports-standings.controller, saved-posts.controller, blog/leaderboard/search
    // controllers: grep for any non-GET route decorator.
    const files = [
      'modules/sports/sports-standings.controller.ts',
      'modules/feed/saved-posts.controller.ts',
      'modules/blog/articles.controller.ts',
      'modules/blog/categories.controller.ts',
      'modules/leaderboard/leaderboard.controller.ts',
      'modules/search/search.controller.ts',
      'modules/search/trending.controller.ts',
    ];
    for (const f of files) {
      const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(/^\s*@(Post|Put|Patch|Delete)\(/m.test(text)).toBe(false);
    }
  });
});
