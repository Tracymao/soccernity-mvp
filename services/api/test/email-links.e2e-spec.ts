import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

// B-016: the verification and guardian-consent emails must carry a working link
// into apps/web. This drives the REAL register route, captures what the real
// RegistrationEmailService hands to Postmark (Postmark itself is faked -- no
// network, no key), then FOLLOWS the links it was given: the token in each URL
// must actually verify the email / confirm the consent against real Postgres.
const mockSendEmail = jest.fn();
jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

// Make the email service "live" and give it a base URL BEFORE AppModule loads.
process.env.EMAIL_PROVIDER_API_KEY = 'e2e-fake-postmark-key';
process.env.POSTMARK_FROM_EMAIL = 'no-reply@soccernity.example';
process.env.WEB_APP_BASE_URL = 'https://app.soccernity.com';

import { AppModule } from '../src/app.module';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
};

describe('Email links e2e (B-016)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ MessageID: 'm' });
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function waitForEmails(count: number): Promise<Array<{ To: string; Subject: string; TextBody: string; HtmlBody: string }>> {
    // Registration sends fire-and-forget; give the queued sends a moment.
    for (let i = 0; i < 50 && mockSendEmail.mock.calls.length < count; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return mockSendEmail.mock.calls.map((c) => c[0]);
  }

  const linkIn = (text: string, pathPrefix: string): URL => {
    const m = text.match(new RegExp(`https://app\\.soccernity\\.com${pathPrefix}\\?token=[^\\s"<]+`));
    expect(m).not.toBeNull();
    return new URL(m![0]);
  };

  it('an ADULT registration emails a verification link that really verifies the account', async () => {
    const email = `e2e-links-adult-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123', displayName: 'Adult', dateOfBirth: yearsAgo(30) })
      .expect(201);

    const emails = await waitForEmails(1);
    expect(emails).toHaveLength(1);
    expect(emails[0].To).toBe(email);
    const link = linkIn(emails[0].TextBody, '/verify-email');
    expect(linkIn(emails[0].HtmlBody, '/verify-email').toString()).toBe(link.toString());
    expect(emails[0].TextBody).not.toMatch(/verification code/i);

    const prisma = getTestPrismaClient();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).verificationStatus).toBe('unverified');
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: link.searchParams.get('token') }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).verificationStatus).toBe('verified');
  });

  it('a MINOR registration also emails the guardian a consent link that really confirms consent', async () => {
    const email = `e2e-links-minor-${Date.now()}@example.com`;
    const guardianEmail = `grace-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Forwarded-For', '198.18.9.1')
      .send({
        email,
        password: 'password123',
        displayName: 'Minor',
        dateOfBirth: yearsAgo(15),
        guardian: { name: 'Grace Parent', email: guardianEmail, relationship: 'Parent' },
      })
      .expect(201);

    const emails = await waitForEmails(2);
    expect(emails).toHaveLength(2);
    const consentEmail = emails.find((e) => e.To === guardianEmail)!;
    expect(consentEmail).toBeDefined();
    const link = linkIn(consentEmail.TextBody, '/guardian-consent/confirm');
    expect(consentEmail.TextBody).not.toMatch(/consent code/i);

    const prisma = getTestPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: user.id } })).consentStatus).toBe('pending');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .send({ consentToken: link.searchParams.get('token') })
      .expect(200);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { minorUserId: user.id } })).consentStatus).toBe('confirmed');
  });

  it('a manual resend emails a fresh consent link, and the old link stops working', async () => {
    const email = `e2e-links-resend-${Date.now()}@example.com`;
    const guardianEmail = `grace-resend-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Forwarded-For', '198.18.9.2')
      .send({
        email,
        password: 'password123',
        displayName: 'Minor',
        dateOfBirth: yearsAgo(15),
        guardian: { name: 'Grace Parent', email: guardianEmail, relationship: 'Parent' },
      })
      .expect(201);
    const first = linkIn((await waitForEmails(2)).find((e) => e.To === guardianEmail)!.TextBody, '/guardian-consent/confirm');

    mockSendEmail.mockClear();
    await request(app.getHttpServer()).post('/auth/guardian-consent/resend').set('X-Forwarded-For', '198.18.9.3').send({ email }).expect(200);
    const second = linkIn((await waitForEmails(1))[0].TextBody, '/guardian-consent/confirm');

    expect(second.searchParams.get('token')).not.toBe(first.searchParams.get('token'));
    await request(app.getHttpServer()).post('/auth/guardian-consent').send({ consentToken: first.searchParams.get('token') }).expect(400);
    await request(app.getHttpServer()).post('/auth/guardian-consent').send({ consentToken: second.searchParams.get('token') }).expect(200);
  });
});
