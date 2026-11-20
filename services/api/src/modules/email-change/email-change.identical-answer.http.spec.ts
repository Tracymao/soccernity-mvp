import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PasswordService } from '../auth/password/password.service';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { TokenService } from '../auth/token/token.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeLimiter } from './email-change.limiter';
import { EmailChangeService } from './email-change.service';

// Decision Log #476: the REAL controller and the REAL service, over HTTP, with only the collaborators faked. Proves
// that once identity is proven the status, the body AND the response headers are byte-identical whatever the new
// address is: usable, already used by an account, malformed, longer than 254 characters, the same as the current
// address, or a minor's guardian address. What differs is only what is emailed, and that happens after the response.
describe('POST /users/me/email-change answers identically for every kind of address (Decision Log #476)', () => {
  let app: INestApplication;
  let service: EmailChangeService;
  const sent: Array<{ method: string; args: unknown[] }> = [];
  let takenEmail: string | null = null;
  let guardianEmail: string | null = null;
  let isMinor = false;

  const email = {
    isWebAppBaseUrlUsable: () => true,
    sendEmailChangeVerifyEmail: async (...args: unknown[]) => {
      sent.push({ method: 'verify', args });
      return true;
    },
    sendEmailChangeNoticeEmail: async (...args: unknown[]) => {
      sent.push({ method: 'notice', args });
    },
    sendEmailChangeUnavailableEmail: async (...args: unknown[]) => {
      sent.push({ method: 'unavailable', args });
    },
  };
  const prisma = {
    user: {
      findUnique: async () => ({ id: 'u1', email: 'old@example.com', passwordHash: 'h', isMinor }),
      findFirst: async (args: { where: { email: { equals: string } } }) =>
        takenEmail !== null && args.where.email.equals.toLowerCase() === takenEmail.toLowerCase() ? { id: 'other', email: takenEmail } : null,
    },
    guardian: { findUnique: async () => (guardianEmail ? { email: guardianEmail } : null) },
    emailChangeRequest: { deleteMany: async () => ({ count: 0 }), create: async () => ({ id: 'req1' }) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  // Every limiter call is allowed; the caps are proved in the limiter and e2e specs.
  const limiter = {
    reserve: async () => undefined,
    release: async () => undefined,
    reserveRequest: async () => undefined,
    claimRecipientSlot: async () => true,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmailChangeController],
      providers: [
        EmailChangeService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: { verify: async () => true } },
        { provide: TokenService, useValue: {} },
        { provide: TwoFactorService, useValue: { isEnabledForUser: async () => false } },
        { provide: RegistrationEmailService, useValue: email },
        { provide: GuardianSecurityNoticeService, useValue: { notifyInBackground: () => undefined } },
        { provide: EmailChangeLimiter, useValue: limiter },
      ],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { sub: 'u1', role: 'fan' };
          return true;
        },
      })
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    service = moduleRef.get(EmailChangeService);
  });

  beforeEach(() => {
    sent.length = 0;
    takenEmail = null;
    guardianEmail = null;
    isMinor = false;
  });

  afterAll(async () => {
    await app.close();
  });

  const ask = async (newEmail: string) => {
    const res = await request(app.getHttpServer()).post('/users/me/email-change').send({ password: 'pw', newEmail });
    await service.whenIdle();
    return res;
  };
  // Everything the caller can see, except the Date header (it changes by the second).
  const visible = (res: request.Response) => {
    const headers = { ...res.headers };
    delete headers.date;
    return JSON.stringify({ status: res.status, body: res.body, headers });
  };

  it('the same status, body and headers for usable, taken, malformed, too long, same-as-current and guardian addresses', async () => {
    const answers: Array<[string, string]> = [];

    answers.push(['usable', visible(await ask('fresh@example.com'))]);

    takenEmail = 'Someone@Example.com';
    answers.push(['taken', visible(await ask('someone@example.com'))]);

    answers.push(['malformed', visible(await ask('not-an-address'))]);
    answers.push(['blank', visible(await ask('   '))]);
    answers.push(['too long', visible(await ask(`${'a'.repeat(250)}@example.com`))]);
    answers.push(['same as the current address', visible(await ask(' OLD@Example.com '))]);

    isMinor = true;
    guardianEmail = 'Parent@Example.com';
    answers.push(["a minor's guardian address", visible(await ask('parent@example.com'))]);

    const first = answers[0][1];
    for (const [kind, answer] of answers) expect({ kind, answer }).toEqual({ kind, answer: first });
    expect(JSON.parse(first)).toMatchObject({ status: 202, body: { status: 'verification_sent' } });
  });

  it('what differs is only the emails: link to a usable address, "cannot be used" to a taken one, nothing for the rest', async () => {
    await ask('fresh@example.com');
    expect(sent.filter((s) => s.method === 'verify').map((s) => s.args[0])).toEqual(['fresh@example.com']);
    expect(sent.filter((s) => s.method === 'unavailable')).toHaveLength(0);
    sent.length = 0;

    takenEmail = 'someone@example.com';
    await ask('someone@example.com');
    expect(sent.filter((s) => s.method === 'unavailable').map((s) => s.args)).toEqual([['someone@example.com']]);
    expect(sent.filter((s) => s.method === 'verify')).toHaveLength(0);
    sent.length = 0;
    takenEmail = null;

    for (const address of ['not-an-address', `${'a'.repeat(250)}@example.com`, 'old@example.com']) {
      await ask(address);
      expect(sent.filter((s) => s.method === 'verify' || s.method === 'unavailable')).toHaveLength(0);
      // The current address is told for every one of them.
      expect(sent.filter((s) => s.method === 'notice').map((s) => s.args)).toEqual([['old@example.com']]);
      sent.length = 0;
    }
  });
});
