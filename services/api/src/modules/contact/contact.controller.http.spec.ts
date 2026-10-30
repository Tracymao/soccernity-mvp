import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
} from './contact.constants';

// HTTP layer: routing, DTO validation (trim, limits, control characters, the six categories) and the
// optional-auth hand-off. The throttle and the guards are overridden; their real behaviour is covered by
// auth-rate-limit.decorator.spec.ts, the e2e spec and write-route-guards.spec.ts.
describe('ContactController (HTTP layer)', () => {
  let app: INestApplication;
  const contact = { submit: jest.fn() };
  let signedInAs: string | undefined;

  const valid = {
    name: 'Ada Obi',
    email: 'ada@example.com',
    category: 'suggestions',
    subject: 'A suggestion',
    message: 'Please add dark mode.',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: contact }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          if (signedInAs) ctx.switchToHttp().getRequest().user = { sub: signedInAs, role: 'user' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signedInAs = undefined;
    contact.submit.mockResolvedValue({ received: true });
  });
  afterEach(() => jest.clearAllMocks());

  const post = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/contact').send(body);

  it('accepts a guest submission: 201 { received: true }, no caller id', async () => {
    const res = await post(valid).expect(201);
    expect(res.body).toEqual({ received: true });
    expect(contact.submit).toHaveBeenCalledWith(valid, undefined);
  });

  it('hands the signed-in caller id to the service', async () => {
    signedInAs = 'user-1';
    await post(valid).expect(201);
    expect(contact.submit).toHaveBeenCalledWith(valid, 'user-1');
  });

  it.each(['technical_issues', 'editorial_complaints', 'data', 'livescores_issues', 'suggestions', 'enquiries_feedback'])(
    'accepts category %s',
    async (category) => {
      await post({ ...valid, category }).expect(201);
    },
  );

  it('rejects a category outside the six, and a missing one', async () => {
    await post({ ...valid, category: 'billing' }).expect(400);
    const { category: _omit, ...rest } = valid;
    void _omit;
    await post(rest).expect(400);
    expect(contact.submit).not.toHaveBeenCalled();
  });

  it.each(['name', 'email', 'subject', 'message'])('rejects a missing %s', async (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    await post(body).expect(400);
  });

  it('trims every text field before validating and before the service sees it', async () => {
    await post({ ...valid, name: '  Ada Obi  ', email: ' ada@example.com ', subject: '\tA suggestion ', message: '\n Please add dark mode.  ' }).expect(201);
    expect(contact.submit).toHaveBeenCalledWith(valid, undefined);
  });

  it.each(['name', 'email', 'subject', 'message'])('rejects a whitespace-only %s', async (field) => {
    await post({ ...valid, [field]: '   \n  ' }).expect(400);
  });

  it('rejects a malformed email', async () => {
    await post({ ...valid, email: 'not-an-email' }).expect(400);
  });

  describe('length limits (name 200, email 254, subject 200, message 500)', () => {
    it('accepts a message of exactly the limit and refuses one character more', async () => {
      await post({ ...valid, message: 'a'.repeat(CONTACT_MESSAGE_MAX_LENGTH) }).expect(201);
      await post({ ...valid, message: 'a'.repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) }).expect(400);
    });
    it('name', async () => {
      await post({ ...valid, name: 'a'.repeat(CONTACT_NAME_MAX_LENGTH) }).expect(201);
      await post({ ...valid, name: 'a'.repeat(CONTACT_NAME_MAX_LENGTH + 1) }).expect(400);
    });
    it('subject', async () => {
      await post({ ...valid, subject: 'a'.repeat(CONTACT_SUBJECT_MAX_LENGTH) }).expect(201);
      await post({ ...valid, subject: 'a'.repeat(CONTACT_SUBJECT_MAX_LENGTH + 1) }).expect(400);
    });
    it('email', async () => {
      const tooLong = `${'a'.repeat(CONTACT_EMAIL_MAX_LENGTH)}@example.com`;
      await post({ ...valid, email: tooLong }).expect(400);
    });
  });

  describe('control characters', () => {
    it.each(['name', 'subject'])('rejects a line break or any control character in %s', async (field) => {
      await post({ ...valid, [field]: 'line one\nline two' }).expect(400);
      await post({ ...valid, [field]: 'bell\u0007' }).expect(400);
      await post({ ...valid, [field]: 'nul\u0000' }).expect(400);
      await post({ ...valid, [field]: 'del\u007F' }).expect(400);
    });

    it('rejects control characters in the email', async () => {
      await post({ ...valid, email: 'ada@exam\u0000ple.com' }).expect(400);
    });

    it('allows line breaks and tabs in the message but rejects every other control character', async () => {
      await post({ ...valid, message: 'one\r\ntwo\tthree\nfour' }).expect(201);
      await post({ ...valid, message: 'escape\u001B[31m' }).expect(400);
      await post({ ...valid, message: 'nul\u0000' }).expect(400);
      // trim() removes a vertical tab / form feed at the ends, so only one inside the text can be refused
      await post({ ...valid, message: 'v\u000Bt' }).expect(400);
      await post({ ...valid, message: 'f\u000Cf' }).expect(400);
      await post({ ...valid, message: 'de\u007Fl' }).expect(400);
    });
  });

  it('rejects fields it does not know (forbidNonWhitelisted): no userId, status or escalation can be smuggled in', async () => {
    await post({ ...valid, userId: 'someone-else' }).expect(400);
    await post({ ...valid, status: 'handled' }).expect(400);
    await post({ ...valid, escalatedReportId: 'r' }).expect(400);
    expect(contact.submit).not.toHaveBeenCalled();
  });

  it('propagates the service\'s 429 unchanged', async () => {
    const { HttpException } = await import('@nestjs/common');
    contact.submit.mockRejectedValue(
      new HttpException({ statusCode: 429, error: 'Too Many Requests', code: 'contact_email_rate_limited', message: 'x' }, 429),
    );
    const res = await post(valid).expect(429);
    expect(res.body.code).toBe('contact_email_rate_limited');
  });
});
