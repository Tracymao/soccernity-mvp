import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ContactEnquiryRetentionService } from './contact-enquiry-retention.service';
import { CONTACT_RETENTION_MAX_PER_RUN } from './contact.constants';

// backend/w7-contact-us-enquiry (B-046; #440, #444). Unit level; the boundary, the escalated exception and the
// cap against real rows are in test/contact.e2e-spec.ts.

function build(env: Record<string, string | undefined> = {}) {
  const prisma = {
    contactEnquiry: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length })),
    },
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return { service: new ContactEnquiryRetentionService(prisma as never, config), prisma };
}

const NOW = new Date('2026-10-30T12:00:00.000Z');

describe('ContactEnquiryRetentionService.purgeExpired', () => {
  afterEach(() => jest.restoreAllMocks());

  it('selects enquiries whose LAST message is strictly older than 12 months, never an escalated one', async () => {
    const { service, prisma } = build();
    await service.purgeExpired(NOW);
    const where = prisma.contactEnquiry.findMany.mock.calls[0][0].where;
    expect(where.escalatedReportId).toBeNull();
    expect(where.lastMessageAt).toEqual({ lt: new Date('2025-10-30T12:00:00.000Z') });
  });

  it('uses lastMessageAt, not createdAt', async () => {
    const { service, prisma } = build();
    await service.purgeExpired(NOW);
    expect(JSON.stringify(prisma.contactEnquiry.findMany.mock.calls[0][0].where)).not.toContain('createdAt');
  });

  it('repeats the escalated and age guards in the DELETE, so an enquiry escalated in between survives', async () => {
    const { service, prisma } = build();
    prisma.contactEnquiry.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const r = await service.purgeExpired(NOW);
    expect(prisma.contactEnquiry.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, lastMessageAt: { lt: new Date('2025-10-30T12:00:00.000Z') }, escalatedReportId: null },
    });
    expect(r).toEqual({ deletedCount: 2, capped: false });
  });

  it('does nothing (no DELETE) when nothing is due', async () => {
    const { service, prisma } = build();
    await expect(service.purgeExpired(NOW)).resolves.toEqual({ deletedCount: 0, capped: false });
    expect(prisma.contactEnquiry.deleteMany).not.toHaveBeenCalled();
  });

  it('is capped per run: deletes the oldest CONTACT_RETENTION_MAX_PER_RUN and reports capped', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, prisma } = build();
    const many = Array.from({ length: CONTACT_RETENTION_MAX_PER_RUN + 1 }, (_, i) => ({ id: `e${i}` }));
    prisma.contactEnquiry.findMany.mockResolvedValue(many);
    const r = await service.purgeExpired(NOW);
    expect(prisma.contactEnquiry.findMany.mock.calls[0][0].take).toBe(CONTACT_RETENTION_MAX_PER_RUN + 1);
    expect(prisma.contactEnquiry.findMany.mock.calls[0][0].orderBy).toEqual([{ lastMessageAt: 'asc' }, { id: 'asc' }]);
    expect(prisma.contactEnquiry.deleteMany.mock.calls[0][0].where.id.in).toHaveLength(CONTACT_RETENTION_MAX_PER_RUN);
    expect(r).toEqual({ deletedCount: CONTACT_RETENTION_MAX_PER_RUN, capped: true });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('wait for the next run'));
  });

  it('the retention is configurable (CONTACT_ENQUIRY_RETENTION_MONTHS) and an invalid value falls back to 12', async () => {
    const six = build({ CONTACT_ENQUIRY_RETENTION_MONTHS: '6' });
    await six.service.purgeExpired(NOW);
    expect(six.prisma.contactEnquiry.findMany.mock.calls[0][0].where.lastMessageAt).toEqual({ lt: new Date('2026-04-30T12:00:00.000Z') });

    for (const bad of ['0', '-3', 'abc', '', '1.5']) {
      const b = build({ CONTACT_ENQUIRY_RETENTION_MONTHS: bad });
      await b.service.purgeExpired(NOW);
      expect(b.prisma.contactEnquiry.findMany.mock.calls[0][0].where.lastMessageAt).toEqual({ lt: new Date('2025-10-30T12:00:00.000Z') });
    }
  });

  it('logs counts only: no id, name, email or text', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, prisma } = build();
    prisma.contactEnquiry.findMany.mockResolvedValue([{ id: 'secret-id-123' }]);
    await service.runDailyPurge();
    const logged = info.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('deleted=1');
    expect(logged).not.toContain('secret-id-123');
  });

  it('runDailyPurge never throws: a failing run is logged and retried the next day', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, prisma } = build();
    prisma.contactEnquiry.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.runDailyPurge()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });
});
