import { Prisma } from '@prisma/client';
import { removedMediaDeletableNow, recordDeferrals } from '../post-media/rejected-media-evidence.util';
import { REPORT_RETENTION_MAX_PER_RUN } from './report-retention.config';
import { ReportRetentionService } from './report-retention.service';

// backend/b294-report-retention (B-294; Decision Log #487), periods changed by B-299 (Decision Log #490, #493).
// Mocked-Prisma unit spec: the closure anchor, the two periods (6 and 7 years), every skip rule, every blocked
// kind, the detaching of holds and escalated enquiries, the order of the deletion, the cap and the media step failing after
// the commit. The real-Postgres counterpart is test/report-retention.e2e-spec.ts.

jest.mock('../post-media/rejected-media-evidence.util', () => ({
  removedMediaDeletableNow: jest.fn(),
  recordDeferrals: jest.fn(),
}));

const NOW = new Date('2030-06-15T04:15:00.000Z');
const DAY = 24 * 3600 * 1000;

function monthsAgo(months: number, extraDays = 0): Date {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - months);
  return new Date(d.getTime() - extraDays * DAY);
}

interface Row {
  id: string;
  targetType: string;
  targetId: string;
  reporterId: string | null;
  concernsMinor: boolean;
  status: string;
  appealStatus: string | null;
  reviewedAt: Date | null;
  appealReviewedAt: Date | null;
  escalatedAt: Date | null;
}

function report(over: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    targetType: 'user',
    targetId: 'u-target',
    reporterId: 'u-reporter',
    concernsMinor: false,
    status: 'reviewed',
    appealStatus: null,
    reviewedAt: monthsAgo(73),
    appealReviewedAt: null,
    escalatedAt: null,
    ...over,
  };
}

interface State {
  candidates: Row[];
  // keyed by report id
  removedPosts: Record<string, string[]>;
  removedComments: Record<string, string[]>;
  removedMessages: Record<string, string[]>;
  holdsByUser: Record<string, boolean>;
  // how many scans a hold check is empty before the hold "appears" (to model a hold placed after the scan)
  holdAppearsAfterCalls?: number;
  holdRecords: number;
  enquiries: number;
  contestEntries: number;
  contextOfOther: number;
  otherReports: Pick<Row, 'status' | 'appealStatus' | 'reviewedAt' | 'appealReviewedAt'>[];
  otherCommentReports: Pick<Row, 'status' | 'appealStatus' | 'reviewedAt' | 'appealReviewedAt'>[];
  media: { id: string; uploaderId: string; publishedAt: Date | null; publicKey: string | null; privateKey: string | null; quarantineKey: string | null; postId?: string }[];
  messages: Record<string, { senderId: string; conversationId: string; participantIds: string[] }>;
  postAuthor: Record<string, string>;
  hashtagLinks: string[];
  conversationDeleteCount: number;
  failTx?: Error;
}

function build(state: Partial<State> = {}) {
  const s: State = {
    candidates: [report()],
    removedPosts: {},
    removedComments: {},
    removedMessages: {},
    holdsByUser: {},
    holdRecords: 0,
    enquiries: 0,
    contestEntries: 0,
    contextOfOther: 0,
    otherReports: [],
    otherCommentReports: [],
    media: [],
    messages: {},
    postAuthor: {},
    hashtagLinks: [],
    conversationDeleteCount: 0,
    ...state,
  };
  const calls: string[] = [];
  let holdChecks = 0;

  const db: any = {
    report: {
      findMany: jest.fn(async (args: any) => {
        if (args.where?.status) return s.candidates; // the scan
        return s.otherReports; // the "other unclosed report" lookup
      }),
      findUnique: jest.fn(async ({ where }: any) => s.candidates.find((c) => c.id === where.id) ?? null),
      delete: jest.fn(async () => {
        calls.push('report.delete');
      }),
    },
    post: {
      findMany: jest.fn(async ({ where }: any) => (s.removedPosts[where.removedByReportId] ?? []).map((id) => ({ id }))),
      findUnique: jest.fn(async ({ where }: any) => (s.postAuthor[where.id] ? { authorId: s.postAuthor[where.id] } : null)),
      delete: jest.fn(async () => {
        calls.push('post.delete');
      }),
    },
    comment: {
      findMany: jest.fn(async ({ where }: any) => (s.removedComments[where.removedByReportId] ?? []).map((id) => ({ id }))),
      findUnique: jest.fn(async () => null),
      deleteMany: jest.fn(async () => {
        calls.push('comment.deleteMany');
        return { count: 1 };
      }),
    },
    message: {
      findMany: jest.fn(async ({ where }: any) => (s.removedMessages[where.removedByReportId] ?? []).map((id) => ({ id }))),
      findUnique: jest.fn(async ({ where }: any) => {
        const m = s.messages[where.id];
        if (!m) return null;
        return { senderId: m.senderId, conversationId: m.conversationId, conversation: { participantIds: m.participantIds } };
      }),
      delete: jest.fn(async () => {
        calls.push('message.delete');
      }),
    },
    user: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    banterRoom: { findUnique: jest.fn(async () => null) },
    grassrootsTeam: { findUnique: jest.fn(async () => null) },
    fixture: { findUnique: jest.fn(async () => null) },
    accountHold: {
      findMany: jest.fn(async ({ where }: any) => {
        holdChecks += 1;
        const appears = s.holdAppearsAfterCalls === undefined || holdChecks > s.holdAppearsAfterCalls;
        return appears && s.holdsByUser[where.userId]
          ? [{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]
          : [];
      }),
      updateMany: jest.fn(async () => {
        calls.push('accountHold.updateMany');
        return { count: s.holdRecords };
      }),
    },
    contactEnquiry: {
      updateMany: jest.fn(async () => {
        calls.push('contactEnquiry.updateMany');
        return { count: s.enquiries };
      }),
    },
    contestEntry: { count: jest.fn(async () => s.contestEntries) },
    reportContextMessage: {
      count: jest.fn(async () => s.contextOfOther),
      deleteMany: jest.fn(async () => {
        calls.push('reportContextMessage.deleteMany');
        return { count: 0 };
      }),
    },
    postMedia: { findMany: jest.fn(async () => s.media) },
    postHashtag: { findMany: jest.fn(async () => s.hashtagLinks.map((hashtagId) => ({ hashtagId }))) },
    hashtag: {
      updateMany: jest.fn(async () => {
        calls.push('hashtag.updateMany');
        return { count: 1 };
      }),
    },
    notification: {
      deleteMany: jest.fn(async () => {
        calls.push('notification.deleteMany');
        return { count: 0 };
      }),
    },
    conversation: {
      deleteMany: jest.fn(async () => {
        calls.push('conversation.deleteMany');
        return { count: s.conversationDeleteCount };
      }),
    },
    postMediaDeferredDeletion: {
      deleteMany: jest.fn(async () => {
        calls.push('deferral.deleteMany');
        return { count: 1 };
      }),
    },
    $queryRaw: jest.fn(async () => s.otherCommentReports),
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      if (s.failTx) throw s.failTx;
      return fn(db);
    }),
  };

  const storage = { delete: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const clock = { now: () => NOW };
  const service = new ReportRetentionService(db, config as any, storage as any, clock);
  return { service, db, storage, calls, state: s };
}

beforeEach(() => {
  jest.clearAllMocks();
  (removedMediaDeletableNow as jest.Mock).mockResolvedValue({ free: [], waiting: [] });
  (recordDeferrals as jest.Mock).mockImplementation(async () => undefined);
});

describe('ReportRetentionService - the closure anchor', () => {
  it('a dismissed report is due 6 years after reviewedAt, not before', async () => {
    const due = build({ candidates: [report({ reviewedAt: monthsAgo(72, 1) })] });
    expect((await due.service.purgeDue(NOW)).deletedReports).toBe(1);
    const notDue = build({ candidates: [report({ reviewedAt: monthsAgo(72, -1) })] });
    expect((await notDue.service.purgeDue(NOW)).deletedReports).toBe(0);
  });

  it('exactly at closure + 6 years is kept (due strictly after)', async () => {
    const { service } = build({ candidates: [report({ reviewedAt: monthsAgo(72) })] });
    expect((await service.purgeDue(NOW)).deletedReports).toBe(0);
  });

  it('an actioned report with no appeal closes when the appeal window lapses (reviewedAt + 30 days)', async () => {
    // closure = reviewedAt + 30d. reviewedAt 6 years + 10 days ago -> closure 6 years - 20 days ago -> not due.
    const notDue = build({ candidates: [report({ status: 'actioned', reviewedAt: monthsAgo(72, 10) })] });
    expect((await notDue.service.purgeDue(NOW)).deletedReports).toBe(0);
    // reviewedAt 6 years + 40 days ago -> closure 6 years + 10 days ago -> due.
    const due = build({ candidates: [report({ status: 'actioned', reviewedAt: monthsAgo(72, 40) })] });
    expect((await due.service.purgeDue(NOW)).deletedReports).toBe(1);
  });

  it('an appealed-and-upheld report is anchored to appealReviewedAt, not reviewedAt', async () => {
    const early = build({
      candidates: [report({ status: 'actioned', appealStatus: 'upheld', reviewedAt: monthsAgo(96), appealReviewedAt: monthsAgo(6) })],
    });
    expect((await early.service.purgeDue(NOW)).deletedReports).toBe(0);
    const late = build({
      candidates: [report({ status: 'actioned', appealStatus: 'upheld', reviewedAt: monthsAgo(96), appealReviewedAt: monthsAgo(73) })],
    });
    expect((await late.service.purgeDue(NOW)).deletedReports).toBe(1);
  });

  it('an overturned-and-reopened report (status open) and an appeal still pending are never due', async () => {
    const reopened = build({
      candidates: [report({ status: 'open', appealStatus: 'overturned', reviewedAt: monthsAgo(100), appealReviewedAt: monthsAgo(99) })],
    });
    expect((await reopened.service.purgeDue(NOW)).deletedReports).toBe(0);
    const pending = build({ candidates: [report({ status: 'actioned', appealStatus: 'pending', reviewedAt: monthsAgo(100) })] });
    expect((await pending.service.purgeDue(NOW)).deletedReports).toBe(0);
    const open = build({ candidates: [report({ status: 'open', reviewedAt: null })] });
    expect((await open.service.purgeDue(NOW)).deletedReports).toBe(0);
  });

  it('a closed state missing its timestamp counts as not closed (fail safe)', async () => {
    const { service } = build({ candidates: [report({ status: 'reviewed', reviewedAt: null })] });
    expect((await service.purgeDue(NOW)).deletedReports).toBe(0);
  });
});

describe('ReportRetentionService - 6 years versus 7 years', () => {
  it('a report that concerns a minor is kept 7 years after it closed', async () => {
    const at73m = build({ candidates: [report({ concernsMinor: true, reviewedAt: monthsAgo(73) })] });
    expect((await at73m.service.purgeDue(NOW)).deletedReports).toBe(0);
    const at83m = build({ candidates: [report({ concernsMinor: true, reviewedAt: monthsAgo(83) })] });
    expect((await at83m.service.purgeDue(NOW)).deletedReports).toBe(0);
    const exactly = build({ candidates: [report({ concernsMinor: true, reviewedAt: monthsAgo(84) })] });
    expect((await exactly.service.purgeDue(NOW)).deletedReports).toBe(0);
    const over = build({ candidates: [report({ concernsMinor: true, reviewedAt: monthsAgo(84, 1) })] });
    expect((await over.service.purgeDue(NOW)).deletedReports).toBe(1);
  });

  it('the same report without the flag is already gone just after 6 years', async () => {
    const { service } = build({ candidates: [report({ concernsMinor: false, reviewedAt: monthsAgo(72, 1) })] });
    expect((await service.purgeDue(NOW)).deletedReports).toBe(1);
  });

  it('a report without the flag is not due before 6 years (71 months)', async () => {
    const { service } = build({ candidates: [report({ concernsMinor: false, reviewedAt: monthsAgo(71) })] });
    expect((await service.purgeDue(NOW)).deletedReports).toBe(0);
  });

  it('the periods come from REPORT_RETENTION_YEARS and REPORT_RETENTION_CONCERNS_MINOR_YEARS', async () => {
    const env: Record<string, string> = { REPORT_RETENTION_YEARS: '2', REPORT_RETENTION_CONCERNS_MINOR_YEARS: '3' };
    const asked: string[] = [];
    const db: any = { report: { findMany: jest.fn(async () => []) } };
    const config = {
      get: (k: string) => {
        asked.push(k);
        return env[k];
      },
    };
    const service = new ReportRetentionService(db, config as any, undefined, { now: () => NOW });
    await service.purgeDue(NOW);
    // exactly these two settings are read, and nothing else
    expect([...new Set(asked)].sort()).toEqual(['REPORT_RETENTION_CONCERNS_MINOR_YEARS', 'REPORT_RETENTION_YEARS']);
    // the pre-filter is "now - the SHORTER period" = 2 years
    const where = db.report.findMany.mock.calls[0][0].where;
    const cut = new Date(NOW);
    cut.setUTCMonth(cut.getUTCMonth() - 24);
    expect(where.reviewedAt.lt.getTime()).toBe(cut.getTime());
  });
});

describe('ReportRetentionService - skip rules (the report and its content are kept)', () => {
  it('an escalated report is kept', async () => {
    const { service, db } = build({ candidates: [report({ escalatedAt: monthsAgo(14) })] });
    const r = await service.purgeDue(NOW);
    expect(r.skippedEscalated).toBe(1);
    expect(r.deletedReports).toBe(0);
    expect(db.report.delete).not.toHaveBeenCalled();
  });

  it('an active hold on the reporter keeps it', async () => {
    const { service, db } = build({ holdsByUser: { 'u-reporter': true } });
    const r = await service.purgeDue(NOW);
    expect(r.skippedHold).toBe(1);
    expect(db.report.delete).not.toHaveBeenCalled();
  });

  it('an active hold on the account behind the target keeps it (a post report: the post author)', async () => {
    const { service, db } = build({
      candidates: [report({ targetType: 'post', targetId: 'p1' })],
      postAuthor: { p1: 'u-author' },
      holdsByUser: { 'u-author': true },
      removedPosts: { r1: ['p1'] },
    });
    const r = await service.purgeDue(NOW);
    expect(r.skippedHold).toBe(1);
    expect(db.post.delete).not.toHaveBeenCalled();
    expect(db.report.delete).not.toHaveBeenCalled();
  });

  it('for a message report, a hold on the sender or on any OTHER participant keeps it', async () => {
    const messages = { m1: { senderId: 'u-sender', conversationId: 'c1', participantIds: ['u-sender', 'u-other'] } };
    for (const heldUser of ['u-sender', 'u-other']) {
      const { service, db } = build({
        candidates: [report({ targetType: 'message', targetId: 'm1' })],
        messages,
        holdsByUser: { [heldUser]: true },
        removedMessages: { r1: ['m1'] },
      });
      const r = await service.purgeDue(NOW);
      expect(r.skippedHold).toBe(1);
      expect(db.message.delete).not.toHaveBeenCalled();
      expect(db.report.delete).not.toHaveBeenCalled();
    }
  });

  it("a post whose media is not deletable now (the B-206 hook) keeps the WHOLE report and the post", async () => {
    const { service, db } = build({
      candidates: [report({ targetType: 'post', targetId: 'p1' })],
      postAuthor: { p1: 'u-author' },
      removedPosts: { r1: ['p1'] },
      media: [{ id: 'm1', uploaderId: 'u-author', publishedAt: null, publicKey: null, privateKey: 'private-media/u/m1', quarantineKey: null }],
    });
    (removedMediaDeletableNow as jest.Mock).mockResolvedValue({ free: [], waiting: [{ mediaId: 'm1' }] });
    const r = await service.purgeDue(NOW);
    expect(r.skippedMedia).toBe(1);
    expect(db.post.delete).not.toHaveBeenCalled();
    expect(db.report.delete).not.toHaveBeenCalled();
  });

  it('another report that is not closed yet on the removed post keeps it; one on a comment under it does too', async () => {
    const openOther = { status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null };
    const a = build({ candidates: [report({ targetType: 'post', targetId: 'p1' })], removedPosts: { r1: ['p1'] }, otherReports: [openOther] });
    expect((await a.service.purgeDue(NOW)).skippedOtherReportOpen).toBe(1);
    const b = build({ candidates: [report({ targetType: 'post', targetId: 'p1' })], removedPosts: { r1: ['p1'] }, otherCommentReports: [openOther] });
    expect((await b.service.purgeDue(NOW)).skippedOtherReportOpen).toBe(1);
    expect(a.db.post.delete).not.toHaveBeenCalled();
    expect(b.db.report.delete).not.toHaveBeenCalled();
  });

  it('another report that is already closed does not hold the deletion back', async () => {
    const closedOther = { status: 'reviewed', appealStatus: null, reviewedAt: monthsAgo(2), appealReviewedAt: null };
    const { service } = build({
      candidates: [report({ targetType: 'post', targetId: 'p1' })],
      postAuthor: { p1: 'u-author' },
      removedPosts: { r1: ['p1'] },
      otherReports: [closedOther],
    });
    expect((await service.purgeDue(NOW)).deletedReports).toBe(1);
  });
});

describe('ReportRetentionService - blocked by a dependent record (kept, counted, a finding)', () => {
  it.each([
    ['the removed post is a Contest entry', { contestEntries: 1, removedPosts: { r1: ['p1'] }, postAuthor: { p1: 'u' } }, 'blockedContestEntry'],
    [
      'the removed message is context in a different report',
      { contextOfOther: 1, removedMessages: { r1: ['m1'] }, messages: { m1: { senderId: 'u', conversationId: 'c', participantIds: ['u'] } } },
      'blockedContextOfOtherReport',
    ],
  ] as const)('%s', async (_label, patch, counter) => {
    const targetType = 'contestEntries' in patch ? 'post' : 'removedMessages' in patch ? 'message' : 'user';
    const targetId = targetType === 'post' ? 'p1' : targetType === 'message' ? 'm1' : 'u-target';
    const { service, db } = build({ ...(patch as unknown as Partial<State>), candidates: [report({ targetType, targetId })] });
    const r = await service.purgeDue(NOW);
    expect(r[counter]).toBe(1);
    expect(r.deletedReports).toBe(0);
    expect(db.report.delete).not.toHaveBeenCalled();
    expect(db.post.delete).not.toHaveBeenCalled();
    expect(db.message.delete).not.toHaveBeenCalled();
  });
});

describe('ReportRetentionService - holds and escalated enquiries are detached, not blocking (B-299)', () => {
  it('a report with hold rows and an escalated enquiry is deleted; both are detached first and counted', async () => {
    const { service, db, calls } = build({ holdRecords: 2, enquiries: 1 });
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(r.detachedHolds).toBe(2);
    expect(r.detachedEnquiries).toBe(1);
    expect(db.accountHold.updateMany).toHaveBeenCalledWith({ where: { reportId: 'r1' }, data: { reportId: null } });
    expect(db.contactEnquiry.updateMany).toHaveBeenCalledWith({ where: { escalatedReportId: 'r1' }, data: { escalatedReportId: null } });
    // only the link is written: nothing is deleted from the hold or enquiry tables
    expect(calls.indexOf('accountHold.updateMany')).toBeLessThan(calls.indexOf('report.delete'));
    expect(calls.indexOf('contactEnquiry.updateMany')).toBeLessThan(calls.indexOf('report.delete'));
  });

  it('the result no longer has a hold-record or contact-enquiry block reason', async () => {
    const { service } = build({ holdRecords: 1, enquiries: 1 });
    const r = (await service.purgeDue(NOW)) as unknown as Record<string, unknown>;
    expect(r).not.toHaveProperty('blockedHoldRecord');
    expect(r).not.toHaveProperty('blockedContactEnquiry');
  });

  it('a report that is skipped detaches nothing', async () => {
    const escalated = build({ candidates: [report({ escalatedAt: monthsAgo(80) })], holdRecords: 1, enquiries: 1 });
    await escalated.service.purgeDue(NOW);
    expect(escalated.db.accountHold.updateMany).not.toHaveBeenCalled();
    expect(escalated.db.contactEnquiry.updateMany).not.toHaveBeenCalled();
    const held = build({ holdsByUser: { 'u-reporter': true }, holdRecords: 1, enquiries: 1 });
    await held.service.purgeDue(NOW);
    expect(held.db.accountHold.updateMany).not.toHaveBeenCalled();
  });
});

describe('ReportRetentionService - the order of the deletion', () => {
  it('a post: deferral records, hashtag counts, notifications, the post, THEN the context rows, THEN the report', async () => {
    const { service, calls } = build({
      candidates: [report({ targetType: 'post', targetId: 'p1' })],
      postAuthor: { p1: 'u-author' },
      removedPosts: { r1: ['p1'] },
      hashtagLinks: ['h1', 'h2'],
      media: [
        { id: 'm1', uploaderId: 'u-author', publishedAt: new Date(), publicKey: 'post-media/u/m1.jpg', privateKey: null, quarantineKey: null },
        { id: 'm2', uploaderId: 'u-author', publishedAt: null, publicKey: 'post-media/u/m2.jpg', privateKey: 'private-media/u/m2.jpg', quarantineKey: 'quarantine/u/m2' },
      ],
    });
    (recordDeferrals as jest.Mock).mockImplementation(async () => {
      calls.push('recordDeferrals');
    });
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(r.deletedPosts).toBe(1);
    expect(calls.slice(0, 6)).toEqual([
      'recordDeferrals',
      'hashtag.updateMany',
      'hashtag.updateMany',
      'notification.deleteMany',
      'post.delete',
      'reportContextMessage.deleteMany',
    ]);
    expect(calls[calls.indexOf('report.delete') - 1]).toBe('contactEnquiry.updateMany');
    expect(calls[calls.indexOf('report.delete') - 3]).toBe('reportContextMessage.deleteMany');
    // the public key of an UNPUBLISHED file is not a stored object; the others are
    const items = (recordDeferrals as jest.Mock).mock.calls[0][1] as { key: string }[];
    expect(items.map((i) => i.key).sort()).toEqual(['post-media/u/m1.jpg', 'private-media/u/m2.jpg', 'quarantine/u/m2']);
  });

  it('a message: the message, then the context rows, then the now-empty conversation, then the report; the context messages are not touched', async () => {
    const { service, calls, db } = build({
      candidates: [report({ targetType: 'message', targetId: 'm1' })],
      messages: { m1: { senderId: 'u-sender', conversationId: 'c1', participantIds: ['u-sender', 'u-other'] } },
      removedMessages: { r1: ['m1'] },
      conversationDeleteCount: 1,
    });
    const r = await service.purgeDue(NOW);
    expect(r.deletedMessages).toBe(1);
    expect(r.deletedConversations).toBe(1);
    expect(calls).toEqual([
      'message.delete',
      'reportContextMessage.deleteMany',
      'conversation.deleteMany',
      'accountHold.updateMany',
      'contactEnquiry.updateMany',
      'report.delete',
    ]);
    // exactly one message delete: the reported one (the context messages are rows of ReportContextMessage only)
    expect(db.message.delete).toHaveBeenCalledTimes(1);
    expect(db.conversation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] }, messages: { none: {} } } });
  });

  it('a removed comment: the comment, then the report; Post.commentCount is not touched a second time', async () => {
    const { service, calls, db } = build({
      candidates: [report({ targetType: 'comment', targetId: 'c1' })],
      removedComments: { r1: ['c1'] },
    });
    const r = await service.purgeDue(NOW);
    expect(r.deletedComments).toBe(1);
    expect(calls).toEqual(['comment.deleteMany', 'reportContextMessage.deleteMany', 'accountHold.updateMany', 'contactEnquiry.updateMany', 'report.delete']);
    expect(db.post.delete).not.toHaveBeenCalled();
  });

  it('a report that removed nothing (dismissed) deletes just the report and its context rows', async () => {
    const { service, calls } = build();
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(calls).toEqual(['reportContextMessage.deleteMany', 'accountHold.updateMany', 'contactEnquiry.updateMany', 'report.delete']);
  });

  it('never reads or writes AdminActionLog (the fake database does not even have one)', async () => {
    const { service, db } = build();
    expect(db.adminActionLog).toBeUndefined();
    await expect(service.purgeDue(NOW)).resolves.toBeDefined();
  });
});

describe('ReportRetentionService - the transaction and the cap', () => {
  it('re-checks inside the transaction: a hold placed after the scan stops the deletion', async () => {
    // the scan sees no hold; the in-transaction re-check does
    const { service, db } = build({ holdsByUser: { 'u-reporter': true, 'u-target': true }, holdAppearsAfterCalls: 2 });
    const r = await service.purgeDue(NOW);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(r.deletedReports).toBe(0);
    expect(r.skippedHold).toBe(1);
    expect(db.report.delete).not.toHaveBeenCalled();
  });

  it('a serialization conflict keeps the report and retries next run', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'x' });
    const { service } = build({ failTx: err });
    const r = await service.purgeDue(NOW);
    expect(r.retryLater).toBe(1);
    expect(r.deletedReports).toBe(0);
  });

  it('an unexpected foreign key refusal keeps the report (a finding), it does not crash the run', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' });
    const { service } = build({ failTx: err });
    const r = await service.purgeDue(NOW);
    expect(r.retryLater).toBe(1);
    expect(r.deletedReports).toBe(0);
  });

  it('any other error is not swallowed', async () => {
    const { service } = build({ failTx: new Error('boom') });
    await expect(service.purgeDue(NOW)).rejects.toThrow('boom');
  });

  it(`deletes at most ${REPORT_RETENTION_MAX_PER_RUN} reports a run and says it was capped`, async () => {
    const many = Array.from({ length: REPORT_RETENTION_MAX_PER_RUN + 1 }, (_, i) => report({ id: `r${i}` }));
    const { service } = build({ candidates: many });
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(REPORT_RETENTION_MAX_PER_RUN);
    expect(r.capped).toBe(true);
  });

  it('skipped and blocked reports do not use up the cap', async () => {
    const kept = Array.from({ length: REPORT_RETENTION_MAX_PER_RUN + 5 }, (_, i) => report({ id: `k${i}`, escalatedAt: monthsAgo(20) }));
    const due = report({ id: 'due' });
    const { service } = build({ candidates: [...kept, due] });
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(r.skippedEscalated).toBe(REPORT_RETENTION_MAX_PER_RUN + 5);
    expect(r.capped).toBe(false);
  });
});

describe('ReportRetentionService - stored objects go after the commit', () => {
  const withMedia = () =>
    build({
      candidates: [report({ targetType: 'post', targetId: 'p1' })],
      postAuthor: { p1: 'u-author' },
      removedPosts: { r1: ['p1'] },
      media: [{ id: 'm1', uploaderId: 'u-author', publishedAt: null, publicKey: null, privateKey: 'private-media/u/m1.jpg', quarantineKey: null }],
    });

  it('deletes the object only after the transaction, then removes its deferral record', async () => {
    const { service, storage, calls, db } = withMedia();
    storage.delete.mockImplementation(async () => {
      expect(calls).toContain('report.delete'); // the rows are already gone
    });
    const r = await service.purgeDue(NOW);
    expect(storage.delete).toHaveBeenCalledWith('private-media/u/m1.jpg');
    expect(db.postMediaDeferredDeletion.deleteMany).toHaveBeenCalledWith({ where: { objectKey: 'private-media/u/m1.jpg' } });
    expect(r.objectDeletesFailed).toBe(0);
  });

  it('a failing object delete leaves its deferral record in place (retried, never lost) and still counts the report as deleted', async () => {
    const { service, storage, db } = withMedia();
    storage.delete.mockRejectedValue(new Error('storage down'));
    const r = await service.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(r.objectDeletesFailed).toBe(1);
    expect(db.postMediaDeferredDeletion.deleteMany).not.toHaveBeenCalled();
    expect((recordDeferrals as jest.Mock)).toHaveBeenCalledTimes(1); // written inside the transaction
  });

  it('with no object store wired the records stay for the daily sweep', async () => {
    const b = withMedia();
    const noStorage = new ReportRetentionService(b.db, { get: () => undefined } as any, undefined, { now: () => NOW });
    const r = await noStorage.purgeDue(NOW);
    expect(r.deletedReports).toBe(1);
    expect(b.storage.delete).not.toHaveBeenCalled();
  });
});

describe('ReportRetentionService - logging', () => {
  it('the cron logs counts only', async () => {
    const { service } = build();
    const spy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    await service.runDailyPurge();
    const line = String(spy.mock.calls[0][0]);
    expect(line).toMatch(/^Report retention complete: examined=1 reports=1/);
    expect(line).not.toMatch(/r1|u-target|u-reporter/);
  });
});
