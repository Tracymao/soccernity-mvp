import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { CardVerificationGateway } from '../src/payments/card-verification.gateway';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-1/coppa-card-verification. A technical control, not a legal
// conclusion. Real Postgres for the parts a mock cannot show: the real
// register -> Guardian row branching, the confirm gate over real rows, and
// the audit fields surviving into ConsentAuditRecord across the sweep's
// snapshot-then-delete transaction. Stripe itself is faked at the
// CardVerificationGateway seam (no real network, no real keys).
describe('COPPA card verification e2e (real Postgres, Stripe faked)', () => {
  let app: INestApplication;
  const intents = new Map<string, { status: string; refunded: boolean }>();
  const gateway = {
    publishableKey: () => 'pk_test_e2e',
    createVerificationIntent: jest.fn(async () => {
      intents.set('pi_e2e', { status: 'requires_payment_method', refunded: false });
      return { id: 'pi_e2e', clientSecret: 'pi_e2e_secret' };
    }),
    retrieveIntent: jest.fn(async (id: string) => ({
      id,
      amount: 50,
      currency: 'usd',
      status: intents.get(id)!.status,
      refunded: intents.get(id)!.refunded,
    })),
    refundIntent: jest.fn(async (id: string) => {
      intents.get(id)!.refunded = true;
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CardVerificationGateway)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    intents.clear();
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // Seeds the Guardian row directly (register is throttled to 5/60s by the
  // shared 'auth' bucket, see test/README.md); the register-time branching
  // itself is covered against the real service in registration.service.spec.
  async function seed(label: string, cardVerificationRequired: boolean, declaredCountry: string | null) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consentToken = `consent-${label}-${suffix}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-coppa-${label}-${suffix}@example.com`,
        passwordHash: 'unused',
        displayName: `Coppa ${label}`,
        dateOfBirth: new Date('2018-01-01'),
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
        cardVerificationRequired,
        declaredCountry,
      },
    });
    return { userId: user.id, consentToken };
  }

  it('in-scope guardian: the email link ALONE is refused; card step then link succeeds; audit trail records both', async () => {
    const prisma = getTestPrismaClient();
    const { userId, consentToken } = await seed('us', true, 'US');
    const post = (path: string) => request(app.getHttpServer()).post(`/auth/guardian-consent/${path}`);

    await post('verification').send({ consentToken }).expect(200).expect({ cardRequired: true, cardVerified: false });

    // link alone -> refused, nothing written
    await request(app.getHttpServer()).post('/auth/guardian-consent').send({ consentToken }).expect(400);
    expect((await prisma.guardian.findUnique({ where: { minorUserId: userId } }))?.consentStatus).toBe('pending');

    const intent = await post('card/intent').send({ consentToken }).expect(200);
    expect(intent.body).toEqual({ clientSecret: 'pi_e2e_secret', publishableKey: 'pk_test_e2e' });

    // completing before the guardian actually paid is not verification
    await post('card/complete').send({ consentToken }).expect(400);
    expect(gateway.refundIntent).not.toHaveBeenCalled();

    intents.get('pi_e2e')!.status = 'succeeded'; // the guardian pays in Stripe Elements
    await post('card/complete').send({ consentToken }).expect(200).expect({ cardRequired: true, cardVerified: true });
    expect(gateway.refundIntent).toHaveBeenCalledTimes(1);

    await request(app.getHttpServer()).post('/auth/guardian-consent').send({ consentToken }).expect(200);

    const g = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(g).toMatchObject({
      consentStatus: 'confirmed',
      stripePaymentIntentId: 'pi_e2e',
      consentVerificationMethod: 'email_link_plus_card_charge',
    });
    expect(g?.cardVerifiedAt).not.toBeNull();
    expect(g?.cardRefundedAt).not.toBeNull();
    expect(g?.consentVerificationAt?.getTime()).toBe(g?.consentTimestamp?.getTime());

    // audit fields survive the snapshot-then-delete
    await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) },
    });
    await app.get(AccountDeletionSweepService).sweepPendingDeletions();
    const [record] = await prisma.consentAuditRecord.findMany({ where: { minorUserId: userId } });
    expect(record?.verificationMethod).toBe('email_link_plus_card_charge');
    expect(record?.verificationAt).not.toBeNull();
    // and no Stripe id / card anything is copied into the audit record
    expect(JSON.stringify(record)).not.toContain('pi_e2e');
  });

  it('out-of-scope guardian: today\'s link-only flow is unchanged, Stripe is never touched, method recorded as email_link', async () => {
    const prisma = getTestPrismaClient();
    const { userId, consentToken } = await seed('gb', false, 'GB');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent/card/intent')
      .send({ consentToken })
      .expect(400);
    await request(app.getHttpServer()).post('/auth/guardian-consent').send({ consentToken }).expect(200);

    expect(gateway.createVerificationIntent).not.toHaveBeenCalled();
    const g = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(g?.consentVerificationMethod).toBe('email_link');
    expect(g?.stripePaymentIntentId).toBeNull();
  });

  it('a legacy Guardian row (column default) keeps the link-only flow', async () => {
    const prisma = getTestPrismaClient();
    const { userId } = await seed('legacy', false, null);
    const g = await prisma.guardian.findUnique({ where: { minorUserId: userId } });
    expect(g?.cardVerificationRequired).toBe(false);
  });
});
