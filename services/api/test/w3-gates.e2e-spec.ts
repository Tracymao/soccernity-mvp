import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { GuardianConsentService } from '../src/modules/auth/guardian-consent/guardian-consent.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// W3 gates (build register B-026, B-118, B-027, B-028, B-029, B-030; Decision
// Log #367, #369, #370, #372, #373, #403 item 15), against the real app and
// real Postgres. Three describes, each with its OWN app instance, because the
// @AuthRateLimit() 'auth' bucket (5 requests / 60 s) is per app and shared by
// login, the consent routes and the report-incorrect-details route.

const rand = () => Math.random().toString(36).slice(2);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PLACEHOLDER = 'Soccernity member';

async function bootApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

interface SeedOptions {
  label: string;
  isMinor?: boolean;
  consentStatus?: 'pending' | 'confirmed' | 'declined' | null; // null/undefined for adults
  verified?: boolean;
  username?: string | null;
  password?: string;
}

async function seedUser(app: INestApplication, o: SeedOptions) {
  const prisma = getTestPrismaClient();
  const passwordHash = await app.get(PasswordService).hash(o.password ?? 'the-real-password');
  const suffix = `${Date.now()}-${rand()}`;
  const user = await prisma.user.create({
    data: {
      email: `e2e-w3-${o.label}-${suffix}@example.com`,
      passwordHash,
      displayName: `Real Name ${o.label}`,
      username: o.username === undefined ? `u_${rand()}`.slice(0, 20) : o.username,
      dateOfBirth: seedDob(o.isMinor ? '2012-03-03' : '1994-05-05'),
      isMinor: o.isMinor ?? false,
      verificationStatus: o.verified === false ? 'unverified' : 'verified',
    },
  });
  let consentToken: string | null = null;
  if (o.isMinor) {
    consentToken = `consent-${o.label}-${suffix}`;
    await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'Guardian Person',
        email: `guardian-${suffix}@example.com`,
        relationship: 'Parent',
        consentToken,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        consentStatus: o.consentStatus ?? 'pending',
      },
    });
  }
  const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
  return {
    id: user.id,
    email: user.email,
    password: o.password ?? 'the-real-password',
    consentToken,
    auth: bearer(accessToken.token),
  };
}

async function seedAdmin(app: INestApplication, role: string) {
  const admin = await getTestPrismaClient().adminUser.create({
    data: {
      email: `e2e-w3-admin-${role}-${Date.now()}-${rand()}@example.com`,
      passwordHash: 'unused',
      fullName: `W3 ${role}`,
      role,
    },
  });
  const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
  return { id: admin.id, auth: bearer(accessToken.token) };
}

async function seedPost(authorId: string, contentText = 'a post') {
  return getTestPrismaClient().post.create({ data: { authorId, contentText } });
}

async function seedClub() {
  return getTestPrismaClient().clubPage.create({ data: { name: `Club ${rand()}`, memberCount: 0 } });
}

// ---------------------------------------------------------------------------
describe('W3 gates e2e: write-route guards (B-026 restricted-pending, B-118 unverified, B-027 incomplete profile)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    app = await bootApp();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  describe('B-026: a restricted-pending user cannot perform any social or profile write', () => {
    it.each(['pending', 'declined'] as const)(
      'a %s minor is refused by every social / profile write with guardian_consent_pending, and nothing is written',
      async (consentStatus) => {
        const minor = await seedUser(app, { label: `rp-${consentStatus}`, isMinor: true, consentStatus });
        const other = await seedUser(app, { label: 'other' });
        const post = await seedPost(other.id);
        const club = await seedClub();
        const prisma = getTestPrismaClient();

        const attempts: Array<[string, () => request.Test]> = [
          ['PATCH /users/:id', () => request(http()).patch(`/users/${minor.id}`).set(minor.auth).send({ phone: '+441234567890' })],
          ['PATCH represented-club', () => request(http()).patch(`/users/${minor.id}/represented-club`).set(minor.auth).send({ clubId: club.id })],
          ['POST follow', () => request(http()).post(`/users/${other.id}/follow`).set(minor.auth)],
          ['DELETE follow', () => request(http()).delete(`/users/${other.id}/follow`).set(minor.auth)],
          ['POST like', () => request(http()).post(`/posts/${post.id}/like`).set(minor.auth)],
          ['DELETE like', () => request(http()).delete(`/posts/${post.id}/like`).set(minor.auth)],
          ['POST save', () => request(http()).post(`/posts/${post.id}/save`).set(minor.auth)],
          ['DELETE save', () => request(http()).delete(`/posts/${post.id}/save`).set(minor.auth)],
          ['POST club join', () => request(http()).post(`/clubs/${club.id}/join`).set(minor.auth)],
          ['DELETE club join', () => request(http()).delete(`/clubs/${club.id}/join`).set(minor.auth)],
          ['POST comment', () => request(http()).post(`/posts/${post.id}/comments`).set(minor.auth).send({ contentText: 'hi' })],
          ['DELETE own post', () => request(http()).delete(`/posts/${post.id}`).set(minor.auth)],
        ];

        for (const [name, attempt] of attempts) {
          const res = await attempt();
          expect({ name, status: res.status, code: res.body.code }).toEqual({
            name,
            status: 403,
            code: 'guardian_consent_pending',
          });
        }

        expect(await prisma.follow.count()).toBe(0);
        expect(await prisma.like.count()).toBe(0);
        expect(await prisma.savedPost.count()).toBe(0);
        expect(await prisma.comment.count()).toBe(0);
        expect(await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } })).toMatchObject({ memberCount: 0 });
        expect((await prisma.user.findUniqueOrThrow({ where: { id: minor.id } })).phone).toBeNull();
      },
    );

    it('the routes #370 leaves open still work for a restricted-pending minor (reports, own status, password, logout)', async () => {
      const minor = await seedUser(app, { label: 'rp-open', isMinor: true, consentStatus: 'pending' });
      const target = await seedUser(app, { label: 'rp-open-target' });
      const post = await seedPost(target.id);

      // Report a post: reaches the handler and is created.
      const report = await request(http())
        .post('/reports')
        .set(minor.auth)
        .send({ targetType: 'post', targetId: post.id, reason: 'spam' });
      expect(report.status).toBe(201);

      await request(http()).get('/auth/guardian-consent/status').set(minor.auth).expect(200);

      // Reaches the handler (wrong current password) rather than being blocked by a guard.
      const pw = await request(http())
        .post('/auth/change-password')
        .set(minor.auth)
        .send({ currentPassword: 'wrong-password-123', newPassword: 'another-password-123' });
      expect(pw.status).not.toBe(403);

      const logout = await request(http()).post('/auth/logout').set(minor.auth).send({});
      expect(logout.status).not.toBe(403);
    });

    it('guardian approval releases the block on the SAME access token (status is read fresh, never from the token)', async () => {
      const minor = await seedUser(app, { label: 'rp-release', isMinor: true, consentStatus: 'pending' });
      const target = await seedUser(app, { label: 'rp-release-target' });

      await request(http()).post(`/users/${target.id}/follow`).set(minor.auth).expect(403);

      await getTestPrismaClient().guardian.update({
        where: { minorUserId: minor.id },
        data: { consentStatus: 'confirmed', consentTimestamp: new Date() },
      });

      await request(http()).post(`/users/${target.id}/follow`).set(minor.auth).expect(200);
    });

    it('an adult is untouched by the consent guard (including an adult with a leftover Guardian row)', async () => {
      const adult = await seedUser(app, { label: 'adult-ok' });
      const target = await seedUser(app, { label: 'adult-ok-target' });
      await request(http()).post(`/users/${target.id}/follow`).set(adult.auth).expect(200);
    });
  });

  describe('B-118: an unverified-email user cannot perform a social write', () => {
    it('creating forms are refused with email_verification_required, and nothing is written', async () => {
      const u = await seedUser(app, { label: 'unverified', verified: false });
      const other = await seedUser(app, { label: 'unverified-other' });
      const post = await seedPost(other.id);
      const club = await seedClub();
      const prisma = getTestPrismaClient();

      const attempts: Array<[string, () => request.Test]> = [
        ['POST /posts', () => request(http()).post('/posts').set(u.auth).send({ contentText: 'hello' })],
        ['POST comment', () => request(http()).post(`/posts/${post.id}/comments`).set(u.auth).send({ contentText: 'hi' })],
        ['POST like', () => request(http()).post(`/posts/${post.id}/like`).set(u.auth)],
        ['POST save', () => request(http()).post(`/posts/${post.id}/save`).set(u.auth)],
        ['POST follow', () => request(http()).post(`/users/${other.id}/follow`).set(u.auth)],
        ['POST club join', () => request(http()).post(`/clubs/${club.id}/join`).set(u.auth)],
        ['POST banter room', () => request(http()).post('/banter-rooms').set(u.auth).send({ name: 'Room', scopeType: 'topic' })],
        ['POST community group', () => request(http()).post('/community-groups').set(u.auth).send({ name: 'Grp', city: 'Lagos' })],
        ['POST conversation', () => request(http()).post('/conversations').set(u.auth).send({ recipientId: other.id })],
        ['POST team', () => request(http()).post('/teams').set(u.auth).send({ name: 'FC', city: 'Lagos' })],
      ];
      for (const [name, attempt] of attempts) {
        const res = await attempt();
        expect({ name, status: res.status, code: res.body.code }).toEqual({
          name,
          status: 403,
          code: 'email_verification_required',
        });
      }
      expect(await prisma.post.count()).toBe(1); // only the seeded one
      expect(await prisma.follow.count()).toBe(0);
      expect(await prisma.like.count()).toBe(0);
      expect(await prisma.grassrootsTeam.count()).toBe(0);
    });

    it('undo / own-content forms stay open to an unverified user', async () => {
      const u = await seedUser(app, { label: 'unverified-undo', verified: false });
      const other = await seedUser(app, { label: 'unverified-undo-other' });
      const mine = await seedPost(u.id);
      const club = await seedClub();

      await request(http()).delete(`/posts/${mine.id}/like`).set(u.auth).expect(200);
      await request(http()).delete(`/posts/${mine.id}/save`).set(u.auth).expect(200);
      await request(http()).delete(`/users/${other.id}/follow`).set(u.auth).expect(200);
      await request(http()).delete(`/clubs/${club.id}/join`).set(u.auth).expect(200);
      await request(http()).delete(`/posts/${mine.id}`).set(u.auth).expect(204);
    });

    it('reports and appeals stay open to an unverified user', async () => {
      const u = await seedUser(app, { label: 'unverified-report', verified: false });
      const other = await seedUser(app, { label: 'unverified-report-other' });
      const post = await seedPost(other.id);
      await request(http())
        .post('/reports')
        .set(u.auth)
        .send({ targetType: 'post', targetId: post.id, reason: 'spam' })
        .expect(201);
    });

    it('verifying unblocks the SAME access token', async () => {
      const u = await seedUser(app, { label: 'unverified-then-verified', verified: false });
      const other = await seedUser(app, { label: 'unverified-then-verified-other' });
      await request(http()).post(`/users/${other.id}/follow`).set(u.auth).expect(403);
      await getTestPrismaClient().user.update({ where: { id: u.id }, data: { verificationStatus: 'verified' } });
      await request(http()).post(`/users/${other.id}/follow`).set(u.auth).expect(200);
    });

    it('a verified user with a complete profile can post (the happy path is intact)', async () => {
      const u = await seedUser(app, { label: 'happy' });
      await request(http()).post('/posts').set(u.auth).send({ contentText: 'hello' }).expect(201);
    });
  });

  describe('B-027: an incomplete profile cannot post, is shown as the placeholder name, and can complete itself', () => {
    it('no username: posting-class routes are refused with profile_incomplete', async () => {
      const u = await seedUser(app, { label: 'noname', username: null });
      const other = await seedUser(app, { label: 'noname-other' });
      const post = await seedPost(other.id);

      const attempts: Array<[string, () => request.Test]> = [
        ['POST /posts', () => request(http()).post('/posts').set(u.auth).send({ contentText: 'x' })],
        ['POST comment', () => request(http()).post(`/posts/${post.id}/comments`).set(u.auth).send({ contentText: 'x' })],
        ['POST banter room', () => request(http()).post('/banter-rooms').set(u.auth).send({ name: 'Room', scopeType: 'topic' })],
        ['POST community group', () => request(http()).post('/community-groups').set(u.auth).send({ name: 'Grp', city: 'Lagos' })],
        ['POST conversation', () => request(http()).post('/conversations').set(u.auth).send({ recipientId: other.id })],
      ];
      for (const [name, attempt] of attempts) {
        const res = await attempt();
        expect({ name, status: res.status, code: res.body.code }).toEqual({ name, status: 403, code: 'profile_incomplete' });
      }
      expect(await getTestPrismaClient().post.count()).toBe(1);
    });

    it('likes, saves and follows are NOT behind the profile gate (the user is just shown as the placeholder)', async () => {
      const u = await seedUser(app, { label: 'noname-social', username: null });
      const other = await seedUser(app, { label: 'noname-social-other' });
      const post = await seedPost(other.id);
      await request(http()).post(`/posts/${post.id}/like`).set(u.auth).expect(200);
      await request(http()).post(`/posts/${post.id}/save`).set(u.auth).expect(200);
      await request(http()).post(`/users/${other.id}/follow`).set(u.auth).expect(200);
    });

    it('PATCH /users/:id is how the profile gets completed, and posting works on the SAME token afterwards', async () => {
      const u = await seedUser(app, { label: 'completes', username: null });
      await request(http()).post('/posts').set(u.auth).send({ contentText: 'x' }).expect(403);

      const res = await request(http()).patch(`/users/${u.id}`).set(u.auth).send({ username: 'finally_me' }).expect(200);
      expect(res.body).toMatchObject({ username: 'finally_me', profileComplete: true, nextStep: 'none' });

      await request(http()).post('/posts').set(u.auth).send({ contentText: 'x' }).expect(201);
    });

    it("a legacy account (verified, no username) is shown to others as 'Soccernity member', never its real name", async () => {
      const viewer = await seedUser(app, { label: 'viewer' });
      const legacy = await seedUser(app, { label: 'legacy', username: null });
      await seedPost(legacy.id, 'legacy post');
      await request(http()).post(`/users/${legacy.id}/follow`).set(viewer.auth).expect(200);

      const res = await request(http()).get('/posts/feed').set(viewer.auth).expect(200);
      const item = res.body.items.find((p: { contentText: string }) => p.contentText === 'legacy post');
      expect(item.author).toMatchObject({ id: legacy.id, publicName: PLACEHOLDER });
      expect(JSON.stringify(res.body)).not.toContain('Real Name legacy');
    });

    it('a user with a username is shown by it', async () => {
      const viewer = await seedUser(app, { label: 'viewer2' });
      const named = await seedUser(app, { label: 'named', username: 'striker_9' });
      await seedPost(named.id, 'named post');
      await request(http()).post(`/users/${named.id}/follow`).set(viewer.auth).expect(200);

      const res = await request(http()).get('/posts/feed').set(viewer.auth).expect(200);
      const item = res.body.items.find((p: { contentText: string }) => p.contentText === 'named post');
      expect(item.author.publicName).toBe('striker_9');
    });

    it('people search finds a user by username but never by real name or the placeholder', async () => {
      const viewer = await seedUser(app, { label: 'searcher' });
      await seedUser(app, { label: 'findable', username: 'findable_fc' });
      await seedUser(app, { label: 'hidden-real-name', username: null });

      const byUsername = await request(http()).get('/search').query({ q: 'findable_fc', scope: 'users' }).set(viewer.auth).expect(200);
      expect(JSON.stringify(byUsername.body)).toContain('findable_fc');

      const byReal = await request(http()).get('/search').query({ q: 'hidden-real-name', scope: 'users' }).set(viewer.auth).expect(200);
      expect(JSON.stringify(byReal.body)).not.toContain('hidden-real-name');

      const byPlaceholder = await request(http()).get('/search').query({ q: 'Soccernity member', scope: 'users' }).set(viewer.auth).expect(200);
      expect(JSON.stringify(byPlaceholder.body)).not.toContain(PLACEHOLDER);
    });
  });

  describe('B-030: GET /users/:id carries the onboarding state on every visit', () => {
    it.each([
      ['restricted-pending minor', { isMinor: true, consentStatus: 'pending' as const }, 'restricted_pending', 'pending'],
      ['declined minor', { isMinor: true, consentStatus: 'declined' as const }, 'restricted_pending', 'declined'],
      ['approved minor, no username', { isMinor: true, consentStatus: 'confirmed' as const, username: null }, 'create_profile', 'confirmed'],
      ['approved minor, complete', { isMinor: true, consentStatus: 'confirmed' as const }, 'none', 'confirmed'],
      ['unverified adult', { verified: false, username: null }, 'verify_email', 'not_applicable'],
      ['verified adult, no username', { username: null }, 'create_profile', 'not_applicable'],
      ['verified adult, complete', {}, 'none', 'not_applicable'],
    ])('%s -> %s', async (label, opts, nextStep, consent) => {
      const u = await seedUser(app, { label: `onb-${rand()}`, ...(opts as object) });
      const res = await request(http()).get(`/users/${u.id}`).set(u.auth).expect(200);
      expect(res.body).toMatchObject({ nextStep, guardianConsentStatus: consent });
      expect(typeof res.body.profileComplete).toBe('boolean');
      void label;
    });
  });
});

// ---------------------------------------------------------------------------
describe('W3 gates e2e: login response routes the user on every login (B-030)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    app = await bootApp();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // Exactly 3 real logins: well under the shared 5/60s 'auth' bucket.
  it('login says restricted_pending for a pending minor, create_profile for an approved one with no username, none for a complete adult', async () => {
    const pending = await seedUser(app, { label: 'login-pending', isMinor: true, consentStatus: 'pending' });
    const approved = await seedUser(app, { label: 'login-approved', isMinor: true, consentStatus: 'confirmed', username: null });
    const adult = await seedUser(app, { label: 'login-adult' });

    const login = async (u: { email: string; password: string }) =>
      (await request(http()).post('/auth/login').send({ email: u.email, password: u.password }).expect(200)).body.user;

    expect(await login(pending)).toMatchObject({ nextStep: 'restricted_pending', guardianConsentStatus: 'pending', profileComplete: true });
    expect(await login(approved)).toMatchObject({ nextStep: 'create_profile', guardianConsentStatus: 'confirmed', profileComplete: false });
    expect(await login(adult)).toMatchObject({ nextStep: 'none', guardianConsentStatus: 'not_applicable', profileComplete: true });
  });
});

// ---------------------------------------------------------------------------
describe('W3 gates e2e: guardian approval email (B-028) and the incorrect-details flag (B-029)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();
  let approvedEmail: jest.SpyInstance;

  beforeAll(async () => {
    app = await bootApp();
    // Several modules declare their OWN RegistrationEmailService instance (the
    // convention in guardian-consent.module.ts), so app.get(RegistrationEmailService)
    // would return an arbitrary one. Spy on the very instance GuardianConsentService
    // is holding, which is the one that must send the approval email.
    const consentService = app.get(GuardianConsentService) as unknown as { emailService: RegistrationEmailService };
    approvedEmail = jest.spyOn(consentService.emailService, 'sendGuardianApprovedMinorEmail');
  });
  beforeEach(async () => {
    await resetDatabase();
    approvedEmail.mockClear();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('B-028: the real confirm route emails the MINOR once, and not again on a second click', async () => {
    const minor = await seedUser(app, { label: 'approve-mail', isMinor: true, consentStatus: 'pending' });
    await request(http()).post('/auth/guardian-consent').send({ consentToken: minor.consentToken }).expect(200);
    await request(http()).post('/auth/guardian-consent').send({ consentToken: minor.consentToken }).expect(200);
    await flush();
    expect(approvedEmail).toHaveBeenCalledTimes(1);
    expect(approvedEmail).toHaveBeenCalledWith(minor.email, 'Real Name approve-mail');
  });

  it('B-029: reporting incorrect details holds approval (400, row still pending, no email), decline stays available', async () => {
    const minor = await seedUser(app, { label: 'flag-hold', isMinor: true, consentStatus: 'pending' });
    const prisma = getTestPrismaClient();

    await request(http())
      .post('/auth/guardian-consent/report-incorrect-details')
      .send({ consentToken: minor.consentToken })
      .expect(200);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: minor.id } })).incorrectDetailsReportedAt).toBeInstanceOf(Date);

    const confirm = await request(http()).post('/auth/guardian-consent').send({ consentToken: minor.consentToken }).expect(400);
    expect(confirm.body.message).toMatch(/reported incorrect details/i);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: minor.id } })).consentStatus).toBe('pending');
    await flush();
    expect(approvedEmail).not.toHaveBeenCalled();

    // The request summary tells the page approval is on hold.
    const summary = await request(http())
      .get('/auth/guardian-consent/request-summary')
      .set('X-Consent-Token', minor.consentToken!)
      .expect(200);
    expect(summary.body.incorrectDetailsReported).toBe(true);

    // Decline is still available while the report is open.
    await request(http()).post('/auth/guardian-consent/decline').send({ consentToken: minor.consentToken }).expect(200);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: minor.id } })).consentStatus).toBe('declined');
  });

  it('B-029: the flag only accepts a token (extra body fields are rejected) and an unknown token gets the generic error', async () => {
    await request(http())
      .post('/auth/guardian-consent/report-incorrect-details')
      .send({ consentToken: 'x', dateOfBirth: '2012-01-01' })
      .expect(400);
    const res = await request(http())
      .post('/auth/guardian-consent/report-incorrect-details')
      .send({ consentToken: 'no-such-token' })
      .expect(400);
    expect(res.body.message).toBe('Invalid or expired consent token');
  });

  it('B-029: support sees the open report, role-gated, resolves it once (audited), and approval then works', async () => {
    const minor = await seedUser(app, { label: 'flag-resolve', isMinor: true, consentStatus: 'pending' });
    const moderator = await seedAdmin(app, 'moderator');
    const editor = await seedAdmin(app, 'editor');
    const prisma = getTestPrismaClient();

    await request(http())
      .post('/auth/guardian-consent/report-incorrect-details')
      .send({ consentToken: minor.consentToken })
      .expect(200);

    await request(http()).get('/admin/users/incorrect-details-reports').set(editor.auth).expect(403);
    await request(http()).get('/admin/users/incorrect-details-reports').set(minor.auth).expect(401);

    const list = await request(http()).get('/admin/users/incorrect-details-reports').set(moderator.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      userId: minor.id,
      guardianName: 'Guardian Person',
      consentStatus: 'pending',
    });
    // No date of birth and no consent token in the support list.
    expect(JSON.stringify(list.body)).not.toMatch(/dateOfBirth|consentToken|2012-03-03/);

    await request(http()).post(`/admin/users/${minor.id}/incorrect-details-report/resolve`).set(editor.auth).expect(403);
    await request(http()).post(`/admin/users/${minor.id}/incorrect-details-report/resolve`).set(moderator.auth).expect(200);
    await request(http()).post(`/admin/users/${minor.id}/incorrect-details-report/resolve`).set(moderator.auth).expect(404);

    const logs = await prisma.adminActionLog.findMany({ where: { action: 'guardian.incorrect_details_resolved' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ adminId: moderator.id, targetType: 'user', targetId: minor.id });

    const after = await request(http()).get('/admin/users/incorrect-details-reports').set(moderator.auth).expect(200);
    expect(after.body.items).toEqual([]);

    await request(http()).post('/auth/guardian-consent').send({ consentToken: minor.consentToken }).expect(200);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: minor.id } })).consentStatus).toBe('confirmed');
  });

  it('B-029: the flag survives a guardian-email change (it is about the minor, not the guardian)', async () => {
    const minor = await seedUser(app, { label: 'flag-persist', isMinor: true, consentStatus: 'pending' });
    const prisma = getTestPrismaClient();
    await request(http())
      .post('/auth/guardian-consent/report-incorrect-details')
      .send({ consentToken: minor.consentToken })
      .expect(200);

    await request(http())
      .post('/auth/guardian-consent/change-guardian-email')
      .set(minor.auth)
      .send({ name: 'New Guardian', email: `new-guardian-${rand()}@example.com`, relationship: 'Parent' })
      .expect(200);

    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: minor.id } })).incorrectDetailsReportedAt).toBeInstanceOf(Date);
  });
});
