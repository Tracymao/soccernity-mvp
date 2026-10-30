import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { limitKey, normaliseEmail } from '../auth/rate-limit/auth-limits/auth-limits.store';
import { ADMIN_CONTACT_INBOX_PATH, ContactService } from './contact.service';
import { CONTACT_EMAIL_RATE_LIMITED_CODE } from './contact.constants';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

// backend/w7-contact-us-enquiry (B-046). Unit level: rate limit, userId handling, notification content and
// the "email failure never fails the submission" rule. The real-Postgres/Redis behaviour is in
// test/contact.e2e-spec.ts.

const dto: CreateContactEnquiryDto = {
  name: 'Ada Obi',
  email: 'Ada@Example.com',
  category: 'technical_issues',
  subject: 'The match page will not load',
  message: 'SECRET-MESSAGE-TEXT it spins forever on my phone',
};

function build(env: Record<string, string | undefined> = {}) {
  const prisma = {
    contactEnquiry: { create: jest.fn().mockResolvedValue({ id: 'enq-1' }) },
    user: { findUnique: jest.fn() },
  };
  const store = { hit: jest.fn().mockResolvedValue({ count: 1, windowSeconds: 3600 }) };
  const email = { sendContactEnquiryNotificationEmail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const service = new ContactService(prisma as never, store as never, email as never, config);
  return { service, prisma, store, email };
}

describe('ContactService.submit', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores a guest enquiry with userId null and returns only { received: true }', async () => {
    const { service, prisma } = build();
    await expect(service.submit(dto)).resolves.toEqual({ received: true });
    expect(prisma.contactEnquiry.create).toHaveBeenCalledWith({
      data: { name: dto.name, email: dto.email, category: dto.category, subject: dto.subject, message: dto.message, userId: null },
      select: { id: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('links a signed-in sender whose account is active', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', accountStatus: 'active' });
    await service.submit(dto, 'user-1');
    expect(prisma.contactEnquiry.create.mock.calls[0][0].data.userId).toBe('user-1');
  });

  it.each(['deactivated', 'pending_deletion', 'suspended', 'deleted'])(
    'stores the enquiry as a guest\'s when the token\'s account is %s',
    async (accountStatus) => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', accountStatus });
      await service.submit(dto, 'user-1');
      expect(prisma.contactEnquiry.create.mock.calls[0][0].data.userId).toBeNull();
    },
  );

  it('stores the enquiry as a guest\'s when the token\'s account no longer exists', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await service.submit(dto, 'gone');
    expect(prisma.contactEnquiry.create.mock.calls[0][0].data.userId).toBeNull();
  });

  describe('per-email limit', () => {
    it('counts against a hashed, normalised key for 1 hour by default', async () => {
      const { service, store } = build();
      await service.submit(dto);
      expect(store.hit).toHaveBeenCalledWith(limitKey('contact-email', normaliseEmail(dto.email)), 3600);
      // never the raw address in the key
      expect(store.hit.mock.calls[0][0]).not.toContain('example.com');
    });

    it('allows the 3rd and refuses the 4th with a plain 429 coded contact_email_rate_limited, storing nothing', async () => {
      const { service, store, prisma } = build();
      store.hit.mockResolvedValue({ count: 3, windowSeconds: 3600 });
      await expect(service.submit(dto)).resolves.toEqual({ received: true });
      store.hit.mockResolvedValue({ count: 4, windowSeconds: 3600 });
      prisma.contactEnquiry.create.mockClear();
      await expect(service.submit(dto)).rejects.toMatchObject({
        status: 429,
        response: { statusCode: 429, code: CONTACT_EMAIL_RATE_LIMITED_CODE },
      });
      expect(prisma.contactEnquiry.create).not.toHaveBeenCalled();
    });

    it('the limit message names no number, no address and no hint about the message', async () => {
      const { service, store } = build();
      store.hit.mockResolvedValue({ count: 99, windowSeconds: 3600 });
      const err = (await service.submit(dto).catch((e) => e)) as { response: { message: string } };
      expect(err.response.message).not.toMatch(/\d/);
      expect(err.response.message).not.toContain('@');
    });

    it('is configurable: max and window come from CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_*', async () => {
      const { service, store } = build({
        CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX: '1',
        CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS: '120000',
      });
      store.hit.mockResolvedValue({ count: 2, windowSeconds: 120 });
      await expect(service.submit(dto)).rejects.toMatchObject({ status: 429 });
      expect(store.hit.mock.calls[0][1]).toBe(120);
    });

    it('a blank or invalid configured value falls back to the default instead of disabling the limit', async () => {
      const { service, store } = build({ CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX: '0', CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS: 'abc' });
      store.hit.mockResolvedValue({ count: 4, windowSeconds: 3600 });
      await expect(service.submit(dto)).rejects.toMatchObject({ status: 429 });
      expect(store.hit.mock.calls[0][1]).toBe(3600);
    });

    it('fails open when the limiter store has no answer (Redis and its fallback both down)', async () => {
      const { service, store } = build();
      store.hit.mockResolvedValue(null);
      await expect(service.submit(dto)).resolves.toEqual({ received: true });
    });
  });

  describe('support notification', () => {
    it('sends ONE email to the default support mailbox with the category label and the admin inbox link', async () => {
      const { service, email } = build({ ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' });
      await service.submit(dto);
      expect(email.sendContactEnquiryNotificationEmail).toHaveBeenCalledTimes(1);
      expect(email.sendContactEnquiryNotificationEmail).toHaveBeenCalledWith(
        'support@soccernity.com',
        'Technical issues',
        `https://admin.soccernity.com${ADMIN_CONTACT_INBOX_PATH}`,
      );
    });

    it('SUPPORT_INBOX_EMAIL overrides the mailbox', async () => {
      const { service, email } = build({ SUPPORT_INBOX_EMAIL: 'help@soccernity.test' });
      await service.submit(dto);
      expect(email.sendContactEnquiryNotificationEmail.mock.calls[0][0]).toBe('help@soccernity.test');
    });

    it('passes NOTHING from the sender: no name, email, subject or message text reaches the email call', async () => {
      const { service, email } = build({ ADMIN_APP_BASE_URL: 'https://admin.soccernity.com' });
      await service.submit(dto);
      const args = email.sendContactEnquiryNotificationEmail.mock.calls[0];
      const joined = JSON.stringify(args);
      for (const secret of [dto.name, dto.email, dto.subject, 'SECRET-MESSAGE-TEXT', 'example.com']) {
        expect(joined).not.toContain(secret);
      }
    });

    it('still sends (without a link) when ADMIN_APP_BASE_URL is unusable', async () => {
      const { service, email } = build({ ADMIN_APP_BASE_URL: 'replace-me' });
      await service.submit(dto);
      expect(email.sendContactEnquiryNotificationEmail.mock.calls[0][2]).toBeNull();
    });

    it('sends no acknowledgement to the enquirer (the only email goes to the support mailbox)', async () => {
      const { service, email } = build();
      await service.submit(dto);
      expect(email.sendContactEnquiryNotificationEmail).toHaveBeenCalledTimes(1);
      expect(email.sendContactEnquiryNotificationEmail.mock.calls[0][0]).not.toBe(dto.email);
    });

    it('a failing notification never fails the submission, and the warning carries no personal data', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service, email } = build();
      email.sendContactEnquiryNotificationEmail.mockRejectedValue(new Error('postmark down'));
      await expect(service.submit(dto)).resolves.toEqual({ received: true });
      await new Promise((r) => setImmediate(r));
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0][0]);
      expect(logged).toContain('failed');
      for (const secret of [dto.name, dto.email, dto.subject, 'SECRET-MESSAGE-TEXT']) {
        expect(logged).not.toContain(secret);
      }
    });

    it('is not sent when the enquiry was refused by the limit', async () => {
      const { service, store, email } = build();
      store.hit.mockResolvedValue({ count: 4, windowSeconds: 3600 });
      await service.submit(dto).catch(() => undefined);
      expect(email.sendContactEnquiryNotificationEmail).not.toHaveBeenCalled();
    });
  });

  it('never logs the message body on a normal submission', async () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) => jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined));
    const { service } = build();
    await service.submit(dto);
    for (const s of spies) for (const call of s.mock.calls) expect(String(call[0])).not.toContain('SECRET-MESSAGE-TEXT');
  });
});
