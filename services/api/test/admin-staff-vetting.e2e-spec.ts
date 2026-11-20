import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// schema/report-severity-escalation-admin-vetting-application —
// PATCH /admin/users/:id/child-safety-vetting. Hits test/README.md's
// third e2e trigger: AdminUser.vettedByAdminId is a genuinely NEW
// self-relation FK (AdminUser -> AdminUser) that no application code has
// ever written to before this PR — a mock can't tell you whether Prisma's
// self-relation write actually round-trips against a real Postgres table,
// or whether the real AdminRolesGuard('superadmin') genuinely rejects a
// moderator (not just an editor, the only negative case every other
// role-gated e2e test in this codebase proves).
//
// Admins are seeded directly via Prisma + a real AdminTokenService-minted
// access token (createAdmin) — same pattern moderation.e2e-spec.ts /
// admin-users.e2e-spec.ts use. This route carries no @AuthRateLimit() at
// all (see admin-staff-vetting.controller.ts), so there is no shared-
// throttler workaround needed here.
describe('Admin Staff Vetting e2e: PATCH /admin/users/:id/child-safety-vetting against real Postgres', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  function server() {
    return app.getHttpServer();
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createAdmin(label: string, role: string): Promise<{ adminId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-vet-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Vetting Admin ${label}`,
        role,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  it('rejects an editor and a moderator with 403 -- superadmin ONLY, unlike every other role-gated route in this codebase', async () => {
    const target = await createAdmin('target-1', 'moderator');
    const editor = await createAdmin('editor-1', 'editor');
    const moderator = await createAdmin('moderator-1', 'moderator');

    await request(server())
      .patch(`/admin/users/${target.adminId}/child-safety-vetting`)
      .set(auth(editor.accessToken))
      .send({ childSafetyVetted: true })
      .expect(403);

    await request(server())
      .patch(`/admin/users/${target.adminId}/child-safety-vetting`)
      .set(auth(moderator.accessToken))
      .send({ childSafetyVetted: true })
      .expect(403);

    const prisma = getTestPrismaClient();
    const untouched = await prisma.adminUser.findUniqueOrThrow({ where: { id: target.adminId } });
    expect(untouched.childSafetyVetted).toBe(false);
  });

  it('404s when the target admin does not exist', async () => {
    const superadmin = await createAdmin('super-404', 'superadmin');

    await request(server())
      .patch('/admin/users/11111111-1111-4111-8111-111111111111/child-safety-vetting')
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: true })
      .expect(404);
  });

  it('a superadmin sets childSafetyVetted true on ANOTHER admin, genuinely persisting vettedAt/vettedByAdminId against real Postgres, including the new self-relation FK', async () => {
    const superadmin = await createAdmin('super-set', 'superadmin');
    const target = await createAdmin('target-set', 'moderator');
    const prisma = getTestPrismaClient();

    const res = await request(server())
      .patch(`/admin/users/${target.adminId}/child-safety-vetting`)
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: true })
      .expect(200);

    expect(res.body.id).toBe(target.adminId);
    expect(res.body.childSafetyVetted).toBe(true);
    expect(res.body.vettedByAdminId).toBe(superadmin.adminId);
    expect(res.body.passwordHash).toBeUndefined();

    // Real FK proof, not just the HTTP response: vettedByAdminId
    // genuinely references the real, seeded superadmin AdminUser row.
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: target.adminId } });
    expect(row.childSafetyVetted).toBe(true);
    expect(row.vettedAt).not.toBeNull();
    expect(row.vettedByAdminId).toBe(superadmin.adminId);

    const vettingSuperadminRow = await prisma.adminUser.findUnique({ where: { id: row.vettedByAdminId! } });
    expect(vettingSuperadminRow?.id).toBe(superadmin.adminId);
  });

  it('a superadmin unsets childSafetyVetted false, clearing vettedAt and vettedByAdminId back to null', async () => {
    const superadmin = await createAdmin('super-unset', 'superadmin');
    const target = await createAdmin('target-unset', 'moderator');
    const prisma = getTestPrismaClient();

    await request(server())
      .patch(`/admin/users/${target.adminId}/child-safety-vetting`)
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: true })
      .expect(200);

    const res = await request(server())
      .patch(`/admin/users/${target.adminId}/child-safety-vetting`)
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: false })
      .expect(200);

    expect(res.body.childSafetyVetted).toBe(false);
    expect(res.body.vettedAt).toBeNull();
    expect(res.body.vettedByAdminId).toBeNull();

    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: target.adminId } });
    expect(row.childSafetyVetted).toBe(false);
    expect(row.vettedAt).toBeNull();
    expect(row.vettedByAdminId).toBeNull();
  });

  it('a superadmin may vet themselves', async () => {
    const superadmin = await createAdmin('super-self', 'superadmin');
    const prisma = getTestPrismaClient();

    await request(server())
      .patch(`/admin/users/${superadmin.adminId}/child-safety-vetting`)
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: true })
      .expect(200);

    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: superadmin.adminId } });
    expect(row.childSafetyVetted).toBe(true);
    expect(row.vettedByAdminId).toBe(superadmin.adminId);
  });

  it('this endpoint alone is what unlocks the moderation queue gate: a newly-vetted admin can now see and action a concernsMinor report', async () => {
    const superadmin = await createAdmin('super-unlock', 'superadmin');
    const moderator = await createAdmin('moderator-unlock', 'moderator');
    const prisma = getTestPrismaClient();

    const reporter = await prisma.user.create({
      data: {
        email: `e2e-vet-reporter-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        displayName: 'E2E Vet Reporter',
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
      },
    });
    const reported = await prisma.user.create({
      data: {
        email: `e2e-vet-reported-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        displayName: 'E2E Vet Reported',
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
      },
    });
    const post = await prisma.post.create({
      data: { authorId: reported.id, contentText: `some post ${rand()}`, mediaUrls: [] },
    });
    const report = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetType: 'post',
        targetId: post.id,
        reason: 'concerning content involving a minor',
        concernsMinor: true,
      },
    });

    // Before vetting: blocked, both from the list and from direct access.
    const beforeList = await request(server())
      .get('/admin/moderation/reports')
      .set(auth(moderator.accessToken))
      .expect(200);
    expect(beforeList.body.items.map((r: { id: string }) => r.id)).not.toContain(report.id);

    await request(server())
      .patch(`/admin/moderation/reports/${report.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'content_removed' })
      .expect(403);

    // The vetting decision, recorded outside the report-review flow entirely.
    await request(server())
      .patch(`/admin/users/${moderator.adminId}/child-safety-vetting`)
      .set(auth(superadmin.accessToken))
      .send({ childSafetyVetted: true })
      .expect(200);

    // The SAME moderator, with the SAME access token (no re-login), can
    // now see and action the report -- proving this endpoint's effect is
    // read fresh from Postgres on the very next request, not cached in
    // the token.
    const afterList = await request(server())
      .get('/admin/moderation/reports')
      .set(auth(moderator.accessToken))
      .expect(200);
    expect(afterList.body.items.map((r: { id: string }) => r.id)).toContain(report.id);

    const actionRes = await request(server())
      .patch(`/admin/moderation/reports/${report.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'content_removed' })
      .expect(200);
    expect(actionRes.body.status).toBe('actioned');
  });
});
