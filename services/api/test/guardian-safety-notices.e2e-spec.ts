import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaCheckService } from '../src/modules/post-media/media-check.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { UserImageReviewService } from '../src/modules/users/user-image-review.service';
import { RedisService } from '../src/redis/redis.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg } from './support/post-media-doubles';

// ---------------------------------------------------------------------------------------------------------------
// B-279 (Decision Log #456 A, B and C): guardian SAFETY notices, against the REAL app, real Postgres and real Redis.
// The only fakes are the email sender (a recorder standing in for every RegistrationEmailService instance, so the
// test reads exactly what would have been sent and to whom) and the media doubles the post-media specs use.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - each real route that takes a platform safety action on a minor (report actions, appeal decisions, suspend /
//     reinstate / remove, username revoke, a moderator's and the automatic image rejection, a profile image
//     rejection) leads to exactly ONE notice to the minor's confirmed guardian, and the routes answer as before
//   - an adult, a pending guardian and a dismissed report get nothing
//   - removing an account still reaches the guardian although the Guardian row is deleted by the same request
//   - the throttle is a real Redis key with a one-hour TTL
//   - (B) a minor reporting someone, or blocking someone, tells NO guardian anything
//   - the email data carries none of the forbidden details (reason, report, reporter, moderator, post content)
//   - holds (legal hold, bad-faith hold) send nothing: that decision is pinned here
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const SECRET_REASON = 'A very private moderator reason that no guardian may see';
const POST_TEXT = 'Distinctive post text that must never appear in a guardian email';

type SentCall = { method: string; args: unknown[] };
type U = { id: string; auth: { Authorization: string }; guardianEmail: string | null };

describe('Guardian safety notices (B-279) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let redis: RedisService;
  const sent: SentCall[] = [];
  const storage = new InMemoryStorage();
  const processor = new TestMediaProcessor();
  const moderation = new FakeModerationClient();
  const clockNow = new Date('2026-11-05T10:00:00Z');
  const http = () => request(app.getHttpServer());
  const prisma = () => getTestPrismaClient();

  const safetyNotices = () => sent.filter((c) => c.method === 'sendGuardianSafetyNoticeEmail');
  const securityNotices = () => sent.filter((c) => c.method === 'sendGuardianSecurityNoticeEmail');
  const noticeArgs = (c: SentCall) => c.args as [string, string, string, string]; // to, subject, summary, when

  // One recorder for every RegistrationEmailService instance. Only send* methods exist (answering every property
  // would make it look like a thenable and Nest would hang).
  const emailRecorder = new Proxy(
    {},
    {
      get: (_t, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          return Promise.resolve(name === 'sendLoginLockoutNoticeEmail' ? true : undefined);
        };
      },
    },
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(emailRecorder)
      .overrideProvider(APP_CLOCK)
      .useValue({ now: () => new Date(clockNow) })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DirectUploadStorageService)
      .useValue(storage)
      .overrideProvider(MediaProcessor)
      .useValue(processor)
      .overrideProvider(MediaModerationClient)
      .useValue(moderation)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    const keys = await redis.keys('guardian-security-notice:*');
    if (keys.length > 0) await redis.del(...keys);
    sent.length = 0;
    storage.objects.clear();
    storage.issuedLinks.length = 0;
    moderation.configured = true;
    moderation.labelsFor = () => [];
    moderation.failTimes = 0;
    moderation.calls.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  type SeedOpts = {
    isMinor?: boolean;
    consent?: string | null;
    username?: string | null;
    displayName?: string;
  };

  async function seedUser(opts: SeedOpts = {}): Promise<U> {
    const isMinor = opts.isMinor ?? true;
    const user = await prisma().user.create({
      data: {
        email: `safety-${rand()}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: opts.displayName ?? 'Sam Minor',
        username: opts.username === undefined ? `u_${rand()}` : opts.username,
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        verificationStatus: 'verified',
        accountStatus: 'active',
      },
    });
    const consent = opts.consent === undefined ? 'confirmed' : opts.consent;
    const guardianEmail = `guardian-${rand()}@example.com`;
    if (consent !== null && isMinor) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: guardianEmail,
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: consent,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return {
      id: user.id,
      auth: bearer(pair.accessToken.token),
      guardianEmail: consent !== null && isMinor ? guardianEmail : null,
    };
  }

  async function seedAdmin(role = 'moderator'): Promise<{ id: string; auth: { Authorization: string } }> {
    const admin = await prisma().adminUser.create({
      data: { email: `safety-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Safety Admin', role, childSafetyVetted: true },
    });
    return { id: admin.id, auth: bearer((await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token) };
  }

  async function seedPost(authorId: string): Promise<string> {
    return (await prisma().post.create({ data: { authorId, contentText: POST_TEXT, mediaUrls: [] } })).id;
  }

  // Background notices: wait until the recorder holds `count` safety notices, or give up and let the assertion fail.
  async function waitForSafety(count: number) {
    const deadline = Date.now() + 5_000;
    while (safetyNotices().length < count && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }
  // For "nothing was sent": give any background work time to (not) happen.
  const settle = () => new Promise((r) => setTimeout(r, 400));

  /** A report by `reporter` about `minor`'s post, ready for an admin. */
  async function reportAbout(reporter: U, minor: U): Promise<{ reportId: string; postId: string }> {
    const postId = await seedPost(minor.id);
    const res = await http()
      .post('/reports')
      .set(reporter.auth)
      .send({ targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying', reason: SECRET_REASON })
      .expect(201);
    return { reportId: res.body.id as string, postId };
  }

  const everythingSent = () => JSON.stringify(sent.map((c) => c.args));

  // ================================================================== (A) and (C): report actions

  describe('an actioned report about a minor tells the minor\'s guardian the OUTCOME (A and C)', () => {
    it.each([
      ['content_removed', "Soccernity removed content that was posted from Sam Minor's account."],
      ['warning_issued', "Soccernity recorded a warning on Sam Minor's account."],
      ['user_suspended', "Sam Minor's Soccernity account was suspended."],
    ] as const)('%s: ONE notice, the route answers as before, and nothing forbidden is in the email', async (action, sentence) => {
      const minor = await seedUser();
      const reporter = await seedUser({ isMinor: false, displayName: 'Rita Reporter' });
      const admin = await seedAdmin();
      const { reportId } = await reportAbout(reporter, minor);

      const res = await http().patch(`/admin/moderation/reports/${reportId}`).set(admin.auth).send({ action }).expect(200);
      expect(res.body).toMatchObject({ id: reportId, status: 'actioned', actionTaken: action });

      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      const [to, subject, summary, when] = noticeArgs(safetyNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(subject).toBe("An update on Sam Minor's Soccernity account");
      expect(summary).toBe(sentence);
      expect(when).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}, \d{2}:\d{2} UTC$/);

      // Nothing about the reason, the report, the reporter, the post or any id travels in the notice.
      const body = JSON.stringify(safetyNotices()[0].args);
      for (const forbidden of [SECRET_REASON, POST_TEXT, 'Rita Reporter', reportId, reporter.id, admin.id, 'report']) {
        expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      // The reporter is NOT a minor with a guardian, and no other notice of any kind went out.
      expect(securityNotices()).toHaveLength(0);
    });

    it('a DISMISSED report sends no guardian notice at all', async () => {
      const minor = await seedUser();
      const reporter = await seedUser({ isMinor: false });
      const admin = await seedAdmin();
      const { reportId } = await reportAbout(reporter, minor);

      await http().patch(`/admin/moderation/reports/${reportId}`).set(admin.auth).send({ action: 'dismissed' }).expect(200);
      await settle();

      expect(safetyNotices()).toHaveLength(0);
    });

    it('an adult, and a minor whose guardian is still pending, get nothing', async () => {
      const adult = await seedUser({ isMinor: false });
      const pending = await seedUser({ consent: 'pending' });
      const reporter = await seedUser({ isMinor: false });
      const admin = await seedAdmin();

      for (const subject of [adult, pending]) {
        const { reportId } = await reportAbout(reporter, subject);
        await http().patch(`/admin/moderation/reports/${reportId}`).set(admin.auth).send({ action: 'content_removed' }).expect(200);
      }
      await settle();

      expect(safetyNotices()).toHaveLength(0);
    });

    it('is throttled to ONE per hour per kind per account, by a real Redis key with a one-hour TTL', async () => {
      const minor = await seedUser();
      const reporter = await seedUser({ isMinor: false });
      const admin = await seedAdmin();

      for (let i = 0; i < 3; i++) {
        const { reportId } = await reportAbout(reporter, minor);
        await http().patch(`/admin/moderation/reports/${reportId}`).set(admin.auth).send({ action: 'content_removed' }).expect(200);
      }
      await waitForSafety(1);
      await settle();

      expect(safetyNotices()).toHaveLength(1);
      const ttl = await redis.ttl(`guardian-security-notice:content_removed:${minor.id}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
  });

  // ================================================================== appeals

  describe('an appeal decision tells the appellant\'s guardian the outcome only', () => {
    async function appealed(): Promise<{ minor: U; reportId: string; second: { id: string; auth: { Authorization: string } } }> {
      const minor = await seedUser();
      const reporter = await seedUser({ isMinor: false });
      const first = await seedAdmin();
      const second = await seedAdmin();
      const { reportId } = await reportAbout(reporter, minor);
      await http().patch(`/admin/moderation/reports/${reportId}`).set(first.auth).send({ action: 'content_removed' }).expect(200);
      await waitForSafety(1);
      sent.length = 0; // forget the action notice; this test is about the decision
      await http().post(`/reports/${reportId}/appeal`).set(minor.auth).send({ reason: 'I did nothing wrong, honest' }).expect(201);
      await settle();
      expect(safetyNotices()).toHaveLength(0); // the minor appealing is the minor's own action: nothing is sent
      return { minor, reportId, second };
    }

    it.each([
      ['upheld', 'The earlier decision was upheld.'],
      ['overturned', 'The earlier decision was overturned.'],
    ] as const)('%s: ONE notice naming the outcome only', async (decision, tail) => {
      const { minor, reportId, second } = await appealed();
      // The first notice used the content_removed hourly allowance; the appeal events are separate kinds.

      await http().patch(`/admin/moderation/reports/${reportId}/appeal`).set(second.auth).send({ decision }).expect(200);

      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      const [to, , summary] = noticeArgs(safetyNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(summary).toBe(`A review of an earlier decision on Sam Minor's account is finished. ${tail}`);
      expect(everythingSent()).not.toContain('I did nothing wrong');
      expect(everythingSent()).not.toContain(SECRET_REASON);
    });
  });

  // ================================================================== admin user actions

  describe('admin user actions', () => {
    it('suspend -> ONE account_suspended; reinstating -> ONE account_reinstated', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin();

      const s = await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'suspended', reasonCategory: 'other' }).expect(200);
      expect(s.body.user).toMatchObject({ id: minor.id, accountStatus: 'suspended' });
      await waitForSafety(1);
      expect(noticeArgs(safetyNotices()[0])[2]).toBe("Sam Minor's Soccernity account was suspended.");

      await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'active' }).expect(200);
      await waitForSafety(2);
      expect(safetyNotices()).toHaveLength(2);
      expect(noticeArgs(safetyNotices()[1])[2]).toBe("The suspension on Sam Minor's Soccernity account was lifted.");
      expect(safetyNotices().every((c) => noticeArgs(c)[0] === minor.guardianEmail)).toBe(true);
    });

    it('undoing a self-requested deletion is not a safety action: no notice', async () => {
      const minor = await seedUser();
      await prisma().user.update({ where: { id: minor.id }, data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date() } });
      const admin = await seedAdmin();

      await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'active' }).expect(200);
      await settle();

      expect(safetyNotices()).toHaveLength(0);
    });

    it('removing an account still reaches the guardian although the same request deletes the Guardian row', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin();

      const res = await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'deleted' }).expect(200);
      expect(res.body).toEqual({ deleted: true, id: minor.id });
      expect(await prisma().guardian.count({ where: { minorUserId: minor.id } })).toBe(0); // the row really is gone

      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      const [to, subject, summary] = noticeArgs(safetyNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(subject).toBe("An update on Sam Minor's Soccernity account");
      expect(summary).toBe("Sam Minor's Soccernity account was removed by Soccernity.");
    });

    it('removing an ADULT\'s account sends nothing', async () => {
      const adult = await seedUser({ isMinor: false });
      const admin = await seedAdmin();
      await http().patch(`/admin/users/${adult.id}`).set(admin.auth).send({ status: 'deleted' }).expect(200);
      await settle();
      expect(safetyNotices()).toHaveLength(0);
    });

    it('a username revoke -> ONE username_removed notice, and the reason never travels', async () => {
      const minor = await seedUser({ username: `chelsea_${rand()}` });
      const admin = await seedAdmin();

      await http()
        .post(`/admin/users/${minor.id}/username-revoke`)
        .set(admin.auth)
        .send({ reason: SECRET_REASON })
        .expect(200);

      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      const [to, , summary] = noticeArgs(safetyNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(summary).toBe("Soccernity removed the username on Sam Minor's account.");
      expect(JSON.stringify(safetyNotices()[0].args)).not.toContain(SECRET_REASON);
    });
  });

  // ================================================================== media and profile images

  describe('image and media rejections', () => {
    async function uploadAs(u: U): Promise<string> {
      const buf = await makeJpeg({ width: 10 + Math.floor(Math.random() * 20) });
      const res = await http().post('/media/uploads').set(u.auth).send({ contentType: 'image/jpeg', size: buf.length }).expect(201);
      storage.put(`quarantine/${u.id}/${res.body.id}`, buf, 'image/jpeg');
      await http().post(`/media/uploads/${res.body.id}/confirm`).set(u.auth).expect(200);
      return res.body.id as string;
    }

    it('the AUTOMATIC image check rejecting a minor\'s picture -> ONE media_not_approved notice, no labels in it', async () => {
      const minor = await seedUser();
      moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 99 }] as never;

      const id = await uploadAs(minor);
      await app.get(MediaCheckService).runDueChecks(new Date(clockNow));

      expect((await prisma().postMedia.findUniqueOrThrow({ where: { id } })).status).toBe('rejected');
      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      const [to, , summary] = noticeArgs(safetyNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(summary).toBe("A photo or video uploaded from Sam Minor's account was not approved and is not shown.");
      expect(JSON.stringify(safetyNotices()[0].args)).not.toMatch(/Explicit/i);
    });

    it('an automatic APPROVAL sends nothing', async () => {
      const minor = await seedUser();
      await uploadAs(minor);
      await app.get(MediaCheckService).runDueChecks(new Date(clockNow));
      await settle();
      expect(safetyNotices()).toHaveLength(0);
    });

    it('a MODERATOR rejecting an uncertain picture -> ONE notice; approving one sends nothing', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin();
      moderation.labelsFor = () => [{ name: 'Suggestive', parentName: null, confidence: 60 }] as never;
      const a = await uploadAs(minor);
      const b = await uploadAs(minor);
      await app.get(MediaCheckService).runDueChecks(new Date(clockNow));

      await http().post(`/admin/media-review/${a}/approve`).set(admin.auth).expect(200);
      await settle();
      expect(safetyNotices()).toHaveLength(0);

      await http().post(`/admin/media-review/${b}/reject`).set(admin.auth).send({ reason: SECRET_REASON }).expect(200);
      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      expect(noticeArgs(safetyNotices()[0])[2]).toBe(
        "A photo or video uploaded from Sam Minor's account was not approved and is not shown.",
      );
      expect(everythingSent()).not.toContain(SECRET_REASON);
    });

    it('rejecting a profile picture -> ONE profile_image_not_approved notice, without the reason', async () => {
      const minor = await seedUser();
      await prisma().user.update({
        where: { id: minor.id },
        data: { avatarUrl: 'https://cdn.test/avatar.jpg', avatarKey: 'avatars/a.jpg', avatarStatus: 'pending' },
      });

      // No HTTP route calls the image review yet (B-037/B-012); the service method is the code path.
      await app.get(UserImageReviewService).rejectProfileImage(minor.id, 'avatar', SECRET_REASON);

      await waitForSafety(1);
      expect(safetyNotices()).toHaveLength(1);
      expect(noticeArgs(safetyNotices()[0])[2]).toBe(
        "A profile picture or cover photo on Sam Minor's account was not approved and is not shown.",
      );
      expect(everythingSent()).not.toContain(SECRET_REASON);
    });
  });

  // ================================================================== (B): the minor's own actions

  describe('what the MINOR does tells NO guardian anything (B)', () => {
    it('a minor reporting a post or a user (signed in) sends no guardian notice of any kind', async () => {
      const minor = await seedUser();
      const other = await seedUser({ isMinor: false });
      const postId = await seedPost(other.id);

      await http().post('/reports').set(minor.auth).send({ targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying', reason: 'mean' }).expect(201);
      await http().post('/reports').set(minor.auth).send({ targetType: 'user', targetId: other.id, reasonCategory: 'harassment_or_bullying', reason: 'mean' }).expect(201);
      await settle();

      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);
      expect(await prisma().report.count({ where: { reporterId: minor.id } })).toBe(2);
    });

    it('a public report (no account) sends no guardian notice either, even when it concerns a minor', async () => {
      const minor = await seedUser();
      const postId = await seedPost(minor.id);

      await http()
        .post('/reports/public')
        .send({ reporterContactEmail: 'someone@example.com', targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying', reason: 'concerning', concernsMinor: true })
        .expect(201);
      await settle();

      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);
    });

    it('a minor blocking someone sends no guardian notice of any kind', async () => {
      const minor = await seedUser();
      const other = await seedUser({ isMinor: false });

      await http().post(`/users/${other.id}/block`).set(minor.auth).send({ reason: 'they were unkind' }).expect(200);
      await http().delete(`/users/${other.id}/block`).set(minor.auth).expect(200);
      await settle();

      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);
      expect(await prisma().block.count()).toBe(0);
    });
  });

  // ================================================================== holds: pinned as NOT notified

  describe('holds send no guardian notice (the decision is pinned here)', () => {
    it('a legal hold and a bad-faith hold placed on a report about a minor, then lifted, send nothing', async () => {
      const minor = await seedUser();
      const reporter = await seedUser({ isMinor: false });
      const admin = await seedAdmin();
      const { reportId } = await reportAbout(reporter, minor);

      const legal = await http()
        .post(`/admin/moderation/reports/${reportId}/holds/legal`)
        .set(admin.auth)
        .send({ reason: 'Legal request received today' })
        .expect(201);
      expect(legal.body.holds.length).toBeGreaterThan(0);
      await http()
        .post(`/admin/moderation/reports/${reportId}/holds/bad-faith`)
        .set(admin.auth)
        .send({ reason: 'Reporter acted in bad faith' })
        .expect(201);
      for (const h of legal.body.holds as Array<{ id: string }>) {
        await http().patch(`/admin/moderation/holds/${h.id}/lift`).set(admin.auth).send({ reason: 'No longer needed, lifted' }).expect(200);
      }
      await settle();

      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);
    });
  });
});
