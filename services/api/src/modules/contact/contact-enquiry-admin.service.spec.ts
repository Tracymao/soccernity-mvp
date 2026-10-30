import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from '../moderation/moderation.constants';
import { ContactEnquiryAdminService, buildEnquiryReportReason } from './contact-enquiry-admin.service';
import { encodeContactEnquiryCursor } from './cursor.util';

// backend/w7-contact-enquiry-admin-escalate (B-046 part B). Mocked Prisma: the branching and the exact writes.
// The real constraints (RESTRICT FKs, the CHECKs, the transaction, the queue and no-hold behaviour) are proven
// in test/contact-enquiry-admin.e2e-spec.ts.

const ADMIN = 'admin-1';
const REASON = 'This looks like a safeguarding concern.';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    name: 'Sam Sender',
    email: 'sam@example.com',
    category: 'enquiries_feedback',
    subject: 'Hello',
    message: 'A message.',
    status: 'new',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    lastMessageAt: new Date('2026-10-01T10:00:00.000Z'),
    handledAt: null,
    handledByAdminId: null,
    userId: null,
    escalatedReportId: null,
    ...over,
  };
}

function buildPrisma() {
  const prisma = {
    contactEnquiry: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    report: { create: jest.fn().mockResolvedValue({ id: 'r1', status: 'open', severity: 'high', concernsMinor: false }) },
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: true }) },
    adminActionLog: { create: jest.fn().mockResolvedValue({}) },
  };
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}
const asPrisma = (p: ReturnType<typeof buildPrisma>) => p as unknown as PrismaService;
const make = (p: ReturnType<typeof buildPrisma>) => new ContactEnquiryAdminService(asPrisma(p));

describe('ContactEnquiryAdminService.list', () => {
  it('orders newest first, takes limit+1, defaults to 20 and builds a next cursor when there is more', async () => {
    const prisma = buildPrisma();
    const rows = Array.from({ length: 3 }, (_, i) => row({ id: `e${i}`, createdAt: new Date(`2026-10-0${3 - i}T00:00:00.000Z`) }));
    prisma.contactEnquiry.findMany.mockResolvedValue(rows);

    const page = await make(prisma).list({ limit: 2 });

    const args = prisma.contactEnquiry.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(3);
    expect(args.where).toEqual({});
    expect(page.items.map((i) => i.id)).toEqual(['e0', 'e1']);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('defaults the page size to 20 and caps it at 50', async () => {
    const prisma = buildPrisma();
    await make(prisma).list({});
    expect(prisma.contactEnquiry.findMany.mock.calls[0][0].take).toBe(21);
    await make(prisma).list({ limit: 500 });
    expect(prisma.contactEnquiry.findMany.mock.calls[1][0].take).toBe(51);
  });

  it('ANDs the status and category filters and the cursor', async () => {
    const prisma = buildPrisma();
    const cursor = encodeContactEnquiryCursor({ createdAt: new Date('2026-10-01T00:00:00.000Z'), id: 'e9' });

    await make(prisma).list({ status: 'handled', category: 'data', cursor });

    expect(prisma.contactEnquiry.findMany.mock.calls[0][0].where).toEqual({
      AND: [
        { status: 'handled' },
        { category: 'data' },
        { OR: [{ createdAt: { lt: new Date('2026-10-01T00:00:00.000Z') } }, { createdAt: new Date('2026-10-01T00:00:00.000Z'), id: { lt: 'e9' } }] },
      ],
    });
  });

  it('rejects a malformed cursor with a 400', async () => {
    await expect(make(buildPrisma()).list({ cursor: 'not-a-cursor' })).rejects.toThrow(BadRequestException);
  });

  it('shows hasEscalation and the submitter kind, and never the message text', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findMany.mockResolvedValue([
      row({ id: 'a', userId: 'u1', escalatedReportId: 'r9' }),
      row({ id: 'b' }),
    ]);

    const { items } = await make(prisma).list({});

    expect(items[0]).toMatchObject({ id: 'a', submitter: 'signed_in', hasEscalation: true });
    expect(items[1]).toMatchObject({ id: 'b', submitter: 'guest', hasEscalation: false });
    expect(items[0]).not.toHaveProperty('message');
  });
});

describe('ContactEnquiryAdminService.getById', () => {
  it('404s for an unknown id', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(null);
    await expect(make(prisma).getById('nope')).rejects.toThrow(NotFoundException);
  });

  it('returns the message, userId and escalatedReportId on the detail', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(row({ userId: 'u1', escalatedReportId: 'r1' }));
    expect(await make(prisma).getById('e1')).toMatchObject({ message: 'A message.', userId: 'u1', escalatedReportId: 'r1', hasEscalation: true });
  });
});

describe('ContactEnquiryAdminService.setHandled', () => {
  it('marks a new enquiry handled with handledAt and the acting admin, and audits it', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique
      .mockResolvedValueOnce({ id: 'e1', status: 'new' })
      .mockResolvedValueOnce(row({ status: 'handled' }));

    const result = await make(prisma).setHandled('e1', ADMIN, true);

    expect(prisma.contactEnquiry.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'new' },
      data: { status: 'handled', handledAt: expect.any(Date), handledByAdminId: ADMIN },
    });
    expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
      data: {
        adminId: ADMIN,
        action: ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_HANDLED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.CONTACT_ENQUIRY,
        targetId: 'e1',
        notes: null,
      },
    });
    expect(result.status).toBe('handled');
  });

  it('reopens a handled enquiry, clearing both handled columns together, and audits it', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique
      .mockResolvedValueOnce({ id: 'e1', status: 'handled' })
      .mockResolvedValueOnce(row());

    await make(prisma).setHandled('e1', ADMIN, false);

    expect(prisma.contactEnquiry.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'handled' },
      data: { status: 'new', handledAt: null, handledByAdminId: null },
    });
    expect(prisma.adminActionLog.create.mock.calls[0][0].data.action).toBe(ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_REOPENED);
  });

  it('is idempotent: setting the state it is already in writes and audits nothing', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique
      .mockResolvedValueOnce({ id: 'e1', status: 'handled' })
      .mockResolvedValueOnce(row({ status: 'handled' }));

    await make(prisma).setHandled('e1', ADMIN, true);

    expect(prisma.contactEnquiry.updateMany).not.toHaveBeenCalled();
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('writes no audit row when it loses a race (the conditional update matched nothing)', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique
      .mockResolvedValueOnce({ id: 'e1', status: 'new' })
      .mockResolvedValueOnce(row({ status: 'handled' }));
    prisma.contactEnquiry.updateMany.mockResolvedValue({ count: 0 });

    await make(prisma).setHandled('e1', ADMIN, true);

    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown enquiry', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(null);
    await expect(make(prisma).setHandled('nope', ADMIN, true)).rejects.toThrow(NotFoundException);
  });
});

describe('ContactEnquiryAdminService.escalate', () => {
  const dto = (over: Record<string, unknown> = {}) =>
    ({ severity: 'high', concernsMinor: false, reason: REASON, ...over }) as never;

  it('creates an open enquiry Report with no reporter account, copies the contact details, links the enquiry and audits - in one transaction', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ escalatedReportId: 'r1' }));

    const result = await make(prisma).escalate('e1', ADMIN, dto());

    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: {
        reporterId: null,
        reporterContactName: 'Sam Sender',
        reporterContactEmail: 'sam@example.com',
        targetType: 'enquiry',
        targetId: 'e1',
        reason: 'Contact enquiry (Enquiries / feedback) - Hello: A message.',
        severity: 'high',
        concernsMinor: false,
        status: 'open',
      },
      select: { id: true, status: true, severity: true, concernsMinor: true },
    });
    expect(prisma.contactEnquiry.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', escalatedReportId: null }, data: { escalatedReportId: 'r1' } });
    expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
      data: {
        adminId: ADMIN,
        action: ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_ESCALATED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.CONTACT_ENQUIRY,
        targetId: 'e1',
        notes: `report=r1; severity=high; concernsMinor=false; reason=${REASON}`,
      },
    });
    expect(result.report).toEqual({ id: 'r1', status: 'open', severity: 'high', concernsMinor: false });
    expect(result.enquiry.escalatedReportId).toBe('r1');
  });

  it('never sets the Report escalation-trail fields (those mean escalation to a child-safety lead or an authority)', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(row());
    await make(prisma).escalate('e1', ADMIN, dto());
    const data = prisma.report.create.mock.calls[0][0].data;
    for (const key of ['escalatedAt', 'escalatedByAdminId', 'escalationNotes', 'escalatedToAuthority']) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('409s when the enquiry is already escalated, before creating anything', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(row({ escalatedReportId: 'r0' }));

    await expect(make(prisma).escalate('e1', ADMIN, dto())).rejects.toThrow(ConflictException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('409s and rolls back when a concurrent escalation wins the guarded update', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(row());
    prisma.contactEnquiry.updateMany.mockResolvedValue({ count: 0 });

    await expect(make(prisma).escalate('e1', ADMIN, dto())).rejects.toMatchObject({ response: { code: 'contact_enquiry_already_escalated' } });
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown enquiry, before the vetting gate', async () => {
    const prisma = buildPrisma();
    prisma.contactEnquiry.findUnique.mockResolvedValue(null);
    await expect(make(prisma).escalate('nope', ADMIN, dto({ concernsMinor: true }))).rejects.toThrow(NotFoundException);
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  describe('child-safety vetting gate (applies only when concernsMinor is true)', () => {
    it('403s a non-vetted admin with the coded error and creates nothing', async () => {
      const prisma = buildPrisma();
      prisma.contactEnquiry.findUnique.mockResolvedValue(row());
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });

      await expect(make(prisma).escalate('e1', ADMIN, dto({ concernsMinor: true }))).rejects.toMatchObject({
        response: { code: CHILD_SAFETY_VETTING_REQUIRED_CODE },
      });
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('lets a vetted admin escalate a minor-concerning enquiry', async () => {
      const prisma = buildPrisma();
      prisma.contactEnquiry.findUnique.mockResolvedValue(row());
      prisma.report.create.mockResolvedValue({ id: 'r1', status: 'open', severity: 'critical', concernsMinor: true });

      const result = await make(prisma).escalate('e1', ADMIN, dto({ concernsMinor: true, severity: 'critical' }));

      expect(prisma.report.create.mock.calls[0][0].data).toMatchObject({ concernsMinor: true, severity: 'critical' });
      expect(result.report.concernsMinor).toBe(true);
    });

    it('does not even look the admin up when concernsMinor is false', async () => {
      const prisma = buildPrisma();
      prisma.contactEnquiry.findUnique.mockResolvedValue(row());
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });

      await expect(make(prisma).escalate('e1', ADMIN, dto())).resolves.toBeDefined();
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('applies the gate before the already-escalated 409', async () => {
      const prisma = buildPrisma();
      prisma.contactEnquiry.findUnique.mockResolvedValue(row({ escalatedReportId: 'r0' }));
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      await expect(make(prisma).escalate('e1', ADMIN, dto({ concernsMinor: true }))).rejects.toThrow(ForbiddenException);
    });
  });

  it('refuses a reason that is only spaces with a coded 400', async () => {
    const prisma = buildPrisma();
    await expect(make(prisma).escalate('e1', ADMIN, dto({ reason: '                ' }))).rejects.toMatchObject({
      response: { code: 'escalation_reason_invalid' },
    });
    expect(prisma.contactEnquiry.findUnique).not.toHaveBeenCalled();
  });
});

describe('buildEnquiryReportReason', () => {
  it('joins category label, subject and message', () => {
    expect(buildEnquiryReportReason('data', 'S', 'M')).toBe('Contact enquiry (Data) - S: M');
  });

  it('is capped at 500 characters with an ellipsis, never longer, even for a 3000-character message', () => {
    const text = buildEnquiryReportReason('data', 'S'.repeat(200), 'M'.repeat(3000));
    expect(text).toHaveLength(500);
    expect(text.endsWith('…')).toBe(true);
  });

  it('falls back to the raw key for an unknown category', () => {
    expect(buildEnquiryReportReason('mystery', 'S', 'M')).toContain('(mystery)');
  });
});
