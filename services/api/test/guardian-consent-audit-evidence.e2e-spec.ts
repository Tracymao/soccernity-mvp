import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { CONSENT_SCREEN_VERSION } from '../src/modules/auth/guardian-consent/consent-screen-version.constants';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Decision Log #348 (UK GDPR Art. 7(1)): the consent-screen version and a
// coarse device type must be captured by the REAL confirm route, stored on
// the Guardian row, and survive into ConsentAuditRecord when the minor's
// account is later anonymized. Real Postgres because the value has to
// cross two tables and a real transaction (Guardian delete + audit create).
describe('Guardian consent audit evidence e2e: screen version + device type (real Postgres)', () => {
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

  async function seed(label: string) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consentToken = `consent-${label}-${suffix}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-audit-${label}-${suffix}@example.com`,
        passwordHash: 'unused',
        displayName: `Audit ${label}`,
        dateOfBirth: new Date('2015-01-01'),
        isMinor: true,
      },
    });
    await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'Guardian',
        email: `g-${suffix}@example.com`,
        relationship: 'Parent',
        consentToken,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      },
    });
    return { userId: user.id, consentToken };
  }

  it('records version + device type at confirm, and they survive into ConsentAuditRecord after anonymization', async () => {
    const prisma = getTestPrismaClient();
    const { userId, consentToken } = await seed('mobile');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')
      .send({ consentToken })
      .expect(200);

    const guardian = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(guardian?.consentStatus).toBe('confirmed');
    expect(guardian?.consentScreenVersion).toBe(CONSENT_SCREEN_VERSION);
    expect(guardian?.consentDeviceType).toBe('mobile');

    await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) },
    });
    await app.get(AccountDeletionSweepService).sweepPendingDeletions();

    const [record] = await prisma.consentAuditRecord.findMany({ where: { minorUserId: userId } });
    expect(record?.consentScreenVersion).toBe(CONSENT_SCREEN_VERSION);
    expect(record?.deviceType).toBe('mobile');
    expect(record?.consentConfirmedAt).not.toBeNull();
  });

  it('a second (idempotent) confirm from a different device does not overwrite the original evidence', async () => {
    const prisma = getTestPrismaClient();
    const { userId, consentToken } = await seed('idem');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')
      .send({ consentToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')
      .send({ consentToken })
      .expect(200);

    const guardian = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(guardian?.consentDeviceType).toBe('desktop');
  });

  it('an unrecognised or absent User-Agent is stored as "unknown", never the raw string', async () => {
    const prisma = getTestPrismaClient();
    const { userId, consentToken } = await seed('unknown');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .set('User-Agent', 'curl/8.4.0')
      .send({ consentToken })
      .expect(200);

    const guardian = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(guardian?.consentDeviceType).toBe('unknown');
  });
});
