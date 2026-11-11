import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { REPORT_RETENTION_MAX_PER_RUN } from '../src/modules/moderation/report-retention.config';
import { ReportRetentionService } from '../src/modules/moderation/report-retention.service';
import { RejectedMediaSweepService } from '../src/modules/post-media/rejected-media-sweep.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { InMemoryStorage } from './support/post-media-doubles';

// backend/b294-report-retention (B-294; Decision Log #487). The report retention sweep against REAL Postgres and an
// in-memory object store: a due report with removed content and its context rows is purged, a held one is not, and
// the action log is untouched. The clock is the `now` argument, never the wall clock; cron jobs are stopped.

const NOW = new Date('2030-06-15T04:15:00.000Z');
const DAY = 24 * 3600 * 1000;
const rand = () => Math.random().toString(36).slice(2, 10);

function monthsAgo(months: number, extraDays = 0): Date {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - months);
  return new Date(d.getTime() - extraDays * DAY);
}

describe('Report retention e2e (B-294)', () => {
  let app: INestApplication;
  let retention: ReportRetentionService;
  const storage = new InMemoryStorage();
  const prisma = () => getTestPrismaClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue({ now: () => new Date(NOW) })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DirectUploadStorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    retention = app.get(ReportRetentionService);
  });

  beforeEach(async () => {
    await resetDatabase();
    storage.objects.clear();
    storage.failDeleteFor.clear();
    storage.unavailable = false;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---- seeds ---------------------------------------------------------------------------------------------

  async function user(label: string) {
    return prisma().user.create({
      data: {
        email: `e2e-rrt-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        displayName: `Real ${label}`,
        username: `rrt_${label}_${rand()}`.slice(0, 24).toLowerCase(),
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      } as never,
    });
  }

  async function admin(label = 'a') {
    return prisma().adminUser.create({
      data: { email: `e2e-rrt-admin-${label}-${Date.now()}-${rand()}@example.com`, passwordHash: 'x', fullName: 'Admin', role: 'moderator' },
    });
  }

  /** A report closed `monthsClosed` months ago (a dismissed report: closure = reviewedAt). */
  async function report(over: Record<string, unknown> = {}) {
    return prisma().report.create({
      data: {
        reporterId: null,
        reporterContactEmail: 'rep@example.com',
        targetType: 'user',
        targetId: `t-${rand()}`,
        reason: 'e2e',
        reasonCategory: 'other',
        status: 'reviewed',
        reviewedAt: monthsAgo(13),
        actionTaken: 'dismissed',
        ...over,
      } as never,
    });
  }

  async function removedPost(authorId: string, reportId: string, media = false) {
    const post = await prisma().post.create({
      data: { authorId, contentText: `post ${rand()}`, removedByModerationAt: monthsAgo(14), removedByReportId: reportId } as never,
    });
    if (!media) return { post, mediaId: null as string | null };
    const id = `${rand()}${rand()}`;
    await prisma().postMedia.create({
      data: {
        id,
        uploaderId: authorId,
        kind: 'image',
        declaredContentType: 'image/jpeg',
        declaredSize: 10,
        uploadState: 'ready',
        status: 'approved',
        decisionSource: 'auto',
        decidedAt: monthsAgo(15),
        privateKey: `private-media/${authorId}/${id}.jpg`,
        publicKey: `post-media/${authorId}/${id}.jpg`,
        publicUrl: `https://cdn.test/post-media/${authorId}/${id}.jpg`,
        publishedAt: null,
        contentType: 'image/jpeg',
        byteSize: 10,
        confirmedAt: monthsAgo(15),
        postId: post.id,
        checkState: 'done',
      } as never,
    });
    storage.put(`private-media/${authorId}/${id}.jpg`, Buffer.from('x'), 'image/jpeg');
    return { post, mediaId: id };
  }

  async function conversation(a: string, b: string) {
    const ids = [a, b].sort();
    return prisma().conversation.create({ data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: monthsAgo(14) } });
  }
  const message = (conversationId: string, senderId: string, extra: Record<string, unknown> = {}) =>
    prisma().message.create({ data: { conversationId, senderId, contentText: 'hello', sentAt: monthsAgo(14), ...extra } as never });

  const reportExists = async (id: string) => (await prisma().report.count({ where: { id } })) === 1;

  // ---- the purge -----------------------------------------------------------------------------------------

  it('purges a due report with its removed post, media, comments, likes, saves, hashtag count and notifications', async () => {
    const author = await user('author');
    const fan = await user('fan');
    const mod = await admin();
    const r = await report({ targetType: 'post', actionTaken: 'content_removed', status: 'actioned' });
    const { post, mediaId } = await removedPost(author.id, r.id, true);
    await prisma().comment.create({ data: { postId: post.id, authorId: fan.id, contentText: 'nice' } as never });
    await prisma().like.create({ data: { userId: fan.id, postId: post.id } });
    await prisma().savedPost.create({ data: { userId: fan.id, postId: post.id } });
    const tag = await prisma().hashtag.create({ data: { tag: `tag${rand()}`, postCount: 3 } });
    await prisma().postHashtag.create({ data: { postId: post.id, hashtagId: tag.id } });
    await prisma().notification.createMany({
      data: [
        { userId: author.id, type: 'like', payloadRefId: post.id },
        { userId: author.id, type: 'comment', payloadRefId: post.id },
        { userId: author.id, type: 'moderation_decision', payloadRefId: r.id },
      ],
    });
    await prisma().pointsLedgerEntry.create({
      data: { userId: fan.id, source: 'engagement_like_given', refId: post.id, quarterPoints: 4, postId: post.id } as never,
    });
    const log = await prisma().adminActionLog.create({
      data: { adminId: mod.id, action: 'report.actioned', targetType: 'report', targetId: r.id, notes: 'content_removed' },
    });
    // actioned report with no appeal: closure = reviewedAt + 30 days; reviewedAt 14 months ago is long due.
    await prisma().report.update({ where: { id: r.id }, data: { reviewedAt: monthsAgo(14) } });

    const result = await retention.purgeDue(NOW);

    expect(result).toMatchObject({ deletedReports: 1, deletedPosts: 1, objectDeletesFailed: 0 });
    expect(await reportExists(r.id)).toBe(false);
    expect(await prisma().post.count({ where: { id: post.id } })).toBe(0);
    expect(await prisma().comment.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma().like.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma().savedPost.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma().postHashtag.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma().postMedia.count({ where: { id: mediaId as string } })).toBe(0);
    expect((await prisma().hashtag.findUniqueOrThrow({ where: { id: tag.id } })).postCount).toBe(2);
    // the like / comment notifications go; the decision notification, the ledger and the action log stay
    expect(await prisma().notification.count({ where: { type: { in: ['like', 'comment'] } } })).toBe(0);
    expect(await prisma().notification.count({ where: { type: 'moderation_decision' } })).toBe(1);
    expect(await prisma().pointsLedgerEntry.count({ where: { refId: post.id } })).toBe(1);
    expect(await prisma().adminActionLog.findUnique({ where: { id: log.id } })).not.toBeNull();
    // the stored object is gone and no deferral record is left behind
    expect(storage.has(`private-media/${author.id}/${mediaId}.jpg`)).toBe(false);
    expect(await prisma().postMediaDeferredDeletion.count()).toBe(0);
  });

  it('a message report: the removed message and the context rows go, the context messages and the conversation stay', async () => {
    const sender = await user('sender');
    const reporter = await user('reporter');
    const c = await conversation(sender.id, reporter.id);
    const before = await message(c.id, reporter.id);
    const reported = await message(c.id, sender.id);
    const r = await report({ targetType: 'message', targetId: reported.id, reporterId: reporter.id, status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    await prisma().message.update({ where: { id: reported.id }, data: { removedByModerationAt: monthsAgo(14), removedByReportId: r.id } });
    await prisma().reportContextMessage.create({ data: { reportId: r.id, messageId: before.id } });

    const result = await retention.purgeDue(NOW);

    expect(result).toMatchObject({ deletedReports: 1, deletedMessages: 1, deletedConversations: 0 });
    expect(await prisma().message.count({ where: { id: reported.id } })).toBe(0);
    expect(await prisma().message.count({ where: { id: before.id } })).toBe(1); // context message stays
    expect(await prisma().reportContextMessage.count()).toBe(0);
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(1);
    expect(await reportExists(r.id)).toBe(false);
  });

  it('a conversation left with no message is deleted with it', async () => {
    const sender = await user('sender');
    const other = await user('other');
    const c = await conversation(sender.id, other.id);
    const only = await message(c.id, sender.id);
    const r = await report({ targetType: 'message', targetId: only.id, reporterId: other.id, status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    await prisma().message.update({ where: { id: only.id }, data: { removedByModerationAt: monthsAgo(14), removedByReportId: r.id } });

    const result = await retention.purgeDue(NOW);
    expect(result).toMatchObject({ deletedMessages: 1, deletedConversations: 1 });
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(0);
  });

  it('a removed comment is deleted and its post and comment count are left alone', async () => {
    const author = await user('author');
    const fan = await user('fan');
    const post = await prisma().post.create({ data: { authorId: author.id, contentText: 'p', commentCount: 1 } });
    const r = await report({ targetType: 'comment', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const comment = await prisma().comment.create({
      data: { postId: post.id, authorId: fan.id, contentText: 'rude', removedByModerationAt: monthsAgo(14), removedByReportId: r.id } as never,
    });
    await prisma().report.update({ where: { id: r.id }, data: { targetId: comment.id } });
    await prisma().comment.create({ data: { postId: post.id, authorId: author.id, contentText: 'kept' } });

    const result = await retention.purgeDue(NOW);
    expect(result).toMatchObject({ deletedReports: 1, deletedComments: 1 });
    expect(await prisma().comment.count({ where: { postId: post.id } })).toBe(1);
    expect((await prisma().post.findUniqueOrThrow({ where: { id: post.id } })).commentCount).toBe(1);
  });

  it('a dismissed message report: the report and its context rows go; the reported and the context messages stay', async () => {
    const sender = await user('sender');
    const reporter = await user('reporter');
    const c = await conversation(sender.id, reporter.id);
    const ctx = await message(c.id, reporter.id);
    const reported = await message(c.id, sender.id);
    const r = await report({ targetType: 'message', targetId: reported.id, reporterId: reporter.id });
    await prisma().reportContextMessage.create({ data: { reportId: r.id, messageId: ctx.id } });

    const result = await retention.purgeDue(NOW);
    expect(result.deletedReports).toBe(1);
    expect(await prisma().message.count({ where: { id: { in: [ctx.id, reported.id] } } })).toBe(2);
    expect(await prisma().reportContextMessage.count()).toBe(0);
  });

  it('a suspended account stays suspended and only loses the link to the deleted report', async () => {
    const u = await user('suspended');
    const r = await report({ targetType: 'user', targetId: u.id, status: 'actioned', actionTaken: 'user_suspended', reviewedAt: monthsAgo(14) });
    await prisma().user.update({ where: { id: u.id }, data: { accountStatus: 'suspended', suspendedByReportId: r.id } });
    await retention.purgeDue(NOW);
    const after = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.accountStatus).toBe('suspended');
    expect(after.suspendedByReportId).toBeNull();
    expect(await reportExists(r.id)).toBe(false);
  });

  // ---- not due -------------------------------------------------------------------------------------------

  it('keeps a report that closed less than 12 months ago, an open one, an appeal pending and a reopened one', async () => {
    const young = await report({ reviewedAt: monthsAgo(11) });
    const open = await report({ status: 'open', reviewedAt: null, actionTaken: null });
    const pending = await report({ status: 'actioned', appealStatus: 'pending', reviewedAt: monthsAgo(40), actionTaken: 'warning_issued' });
    const reopened = await report({ status: 'open', appealStatus: 'overturned', reviewedAt: monthsAgo(40), appealReviewedAt: monthsAgo(39), actionTaken: null });
    const result = await retention.purgeDue(NOW);
    expect(result.deletedReports).toBe(0);
    for (const x of [young, open, pending, reopened]) expect(await reportExists(x.id)).toBe(true);
  });

  it('keeps a report about a minor for 6 years and deletes it after', async () => {
    const at5y = await report({ concernsMinor: true, reviewedAt: monthsAgo(60) });
    const over = await report({ concernsMinor: true, reviewedAt: monthsAgo(72, 1) });
    const result = await retention.purgeDue(NOW);
    expect(result.deletedReports).toBe(1);
    expect(await reportExists(at5y.id)).toBe(true);
    expect(await reportExists(over.id)).toBe(false);
  });

  it('an upheld appeal is anchored to appealReviewedAt', async () => {
    const recentAppeal = await report({ status: 'actioned', appealStatus: 'upheld', reviewedAt: monthsAgo(30), appealReviewedAt: monthsAgo(6), actionTaken: 'warning_issued' });
    const oldAppeal = await report({ status: 'actioned', appealStatus: 'upheld', reviewedAt: monthsAgo(30), appealReviewedAt: monthsAgo(13), actionTaken: 'warning_issued' });
    await retention.purgeDue(NOW);
    expect(await reportExists(recentAppeal.id)).toBe(true);
    expect(await reportExists(oldAppeal.id)).toBe(false);
  });

  // ---- skipped -------------------------------------------------------------------------------------------

  it('a held account keeps the report (and its content); a lifted or expired hold does not', async () => {
    const mod = await admin();
    const heldReporter = await user('held');
    const liftedReporter = await user('lifted');
    const expiredReporter = await user('expired');
    const a = await report({ reporterId: heldReporter.id });
    const b = await report({ reporterId: liftedReporter.id });
    const c = await report({ reporterId: expiredReporter.id });
    await prisma().accountHold.create({ data: { userId: heldReporter.id, type: 'legal_hold', placedByAdminId: mod.id, placeReason: 'x'.repeat(12) } as never });
    await prisma().accountHold.create({
      data: { userId: liftedReporter.id, type: 'legal_hold', placedByAdminId: mod.id, placeReason: 'x'.repeat(12), liftedAt: monthsAgo(1), liftedByAdminId: mod.id, liftReason: 'y'.repeat(12) } as never,
    });
    // a bad-faith hold must reference a report (DB CHECK); use a separate open report so it blocks none of the three
    const holdReport = await report({ status: 'open', reviewedAt: null, actionTaken: null });
    await prisma().accountHold.create({
      data: { userId: expiredReporter.id, reportId: holdReport.id, type: 'bad_faith', placedByAdminId: mod.id, placeReason: 'x'.repeat(12), expiresAt: monthsAgo(1) } as never,
    });
    const result = await retention.purgeDue(NOW);
    expect(result.skippedHold).toBe(1);
    expect(await reportExists(a.id)).toBe(true);
    expect(await reportExists(b.id)).toBe(false);
    expect(await reportExists(c.id)).toBe(false);
  });

  it('a hold on the OTHER participant of a reported message keeps the report and the message', async () => {
    const mod = await admin();
    const sender = await user('sender');
    const other = await user('other');
    const c = await conversation(sender.id, other.id);
    const m = await message(c.id, sender.id);
    const r = await report({ targetType: 'message', targetId: m.id, reporterId: sender.id, status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    await prisma().message.update({ where: { id: m.id }, data: { removedByModerationAt: monthsAgo(14), removedByReportId: r.id } });
    await prisma().accountHold.create({ data: { userId: other.id, type: 'legal_hold', placedByAdminId: mod.id, placeReason: 'x'.repeat(12) } as never });
    const result = await retention.purgeDue(NOW);
    expect(result.skippedHold).toBe(1);
    expect(await prisma().message.count({ where: { id: m.id } })).toBe(1);
    expect(await reportExists(r.id)).toBe(true);
  });

  it('an escalated report is kept', async () => {
    const mod = await admin();
    const r = await report({ escalatedAt: monthsAgo(14), escalatedByAdminId: mod.id });
    const result = await retention.purgeDue(NOW);
    expect(result.skippedEscalated).toBe(1);
    expect(await reportExists(r.id)).toBe(true);
  });

  it('another report on the removed post that is not closed keeps the post and the report; once it closes, both go', async () => {
    const author = await user('author');
    const a = await report({ targetType: 'post', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const { post } = await removedPost(author.id, a.id);
    await prisma().report.update({ where: { id: a.id }, data: { targetId: post.id } });
    const other = await report({ targetType: 'post', targetId: post.id, status: 'open', reviewedAt: null, actionTaken: null });
    let result = await retention.purgeDue(NOW);
    expect(result.skippedOtherReportOpen).toBe(1);
    expect(await prisma().post.count({ where: { id: post.id } })).toBe(1);
    await prisma().report.update({ where: { id: other.id }, data: { status: 'reviewed', reviewedAt: monthsAgo(2), actionTaken: 'dismissed' } });
    result = await retention.purgeDue(NOW);
    expect(result.deletedReports).toBe(1);
    expect(await prisma().post.count({ where: { id: post.id } })).toBe(0);
    expect(await reportExists(other.id)).toBe(true); // closed 2 months ago: its own clock, not due
  });

  it('a removed post whose uploader is under an active admin hold keeps the private copy, the post and the report', async () => {
    const mod = await admin();
    const author = await user('author');
    const r = await report({ targetType: 'post', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const { post, mediaId } = await removedPost(author.id, r.id, true);
    await prisma().report.update({ where: { id: r.id }, data: { targetId: post.id } });
    await prisma().accountHold.create({ data: { userId: author.id, type: 'legal_hold', placedByAdminId: mod.id, placeReason: 'x'.repeat(12) } as never });
    await retention.purgeDue(NOW);
    expect(await reportExists(r.id)).toBe(true);
    expect(await prisma().post.count({ where: { id: post.id } })).toBe(1);
    expect(storage.has(`private-media/${author.id}/${mediaId}.jpg`)).toBe(true);
  });

  // ---- blocked: a record outside the list depends on it -------------------------------------------------

  it('keeps the report AND the content, with nothing partially deleted, when something else depends on it', async () => {
    const mod = await admin();
    const author = await user('author');
    const reporter = await user('reporter');

    // (1) a lifted hold still references the report
    const r1 = await report({ targetType: 'post', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const p1 = (await removedPost(author.id, r1.id)).post;
    await prisma().report.update({ where: { id: r1.id }, data: { targetId: p1.id } });
    await prisma().accountHold.create({
      data: { userId: reporter.id, reportId: r1.id, type: 'bad_faith', placedByAdminId: mod.id, placeReason: 'x'.repeat(12), expiresAt: monthsAgo(1), liftedAt: monthsAgo(2), liftedByAdminId: mod.id, liftReason: 'y'.repeat(12) } as never,
    });

    // (2) a contact enquiry was escalated into it
    const r2 = await report({ targetType: 'enquiry' });
    await prisma().contactEnquiry.create({
      data: { name: 'n', email: 'e@example.com', category: 'feedback', subject: 's', message: 'm', escalatedReportId: r2.id } as never,
    });

    // (3) the removed post is a Contest entry
    const r3 = await report({ targetType: 'post', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const p3 = (await removedPost(author.id, r3.id)).post;
    await prisma().report.update({ where: { id: r3.id }, data: { targetId: p3.id } });
    const cycle = await prisma().contestCycle.create({
      data: { title: 'Nov', startsAt: monthsAgo(15), endsAt: monthsAgo(14) } as never,
    });
    const round = await prisma().contestRound.create({
      data: { cycleId: cycle.id, weekNumber: 1, opensAt: monthsAgo(15), closesAt: monthsAgo(14) } as never,
    });
    await prisma().contestEntry.create({ data: { cycleId: cycle.id, roundId: round.id, postId: p3.id, userId: author.id } as never });

    // (4) the removed message is context in a different report
    const c = await conversation(author.id, reporter.id);
    const m4 = await message(c.id, author.id);
    const r4 = await report({ targetType: 'message', targetId: m4.id, reporterId: reporter.id, status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    await prisma().message.update({ where: { id: m4.id }, data: { removedByModerationAt: monthsAgo(14), removedByReportId: r4.id } });
    const otherReport = await report({ targetType: 'user', targetId: reporter.id, status: 'open', reviewedAt: null, actionTaken: null });
    await prisma().reportContextMessage.create({ data: { reportId: otherReport.id, messageId: m4.id } });

    const result = await retention.purgeDue(NOW);

    expect(result).toMatchObject({
      deletedReports: 0,
      blockedHoldRecord: 1,
      blockedContactEnquiry: 1,
      blockedContestEntry: 1,
      blockedContextOfOtherReport: 1,
    });
    for (const id of [r1.id, r2.id, r3.id, r4.id]) expect(await reportExists(id)).toBe(true);
    expect(await prisma().post.count({ where: { id: { in: [p1.id, p3.id] } } })).toBe(2);
    expect(await prisma().message.count({ where: { id: m4.id } })).toBe(1);
    expect(await prisma().contestEntry.count()).toBe(1);
  });

  // ---- the stored objects after the commit ---------------------------------------------------------------

  it('a failed object delete is retried by the deferred-deletion sweep, not lost', async () => {
    const author = await user('author');
    const r = await report({ targetType: 'post', status: 'actioned', actionTaken: 'content_removed', reviewedAt: monthsAgo(14) });
    const { post, mediaId } = await removedPost(author.id, r.id, true);
    await prisma().report.update({ where: { id: r.id }, data: { targetId: post.id } });
    const key = `private-media/${author.id}/${mediaId}.jpg`;
    storage.failDeleteFor.add(key);

    const first = await retention.purgeDue(NOW);
    expect(first).toMatchObject({ deletedReports: 1, objectDeletesFailed: 1 });
    expect(await reportExists(r.id)).toBe(false);
    expect(await prisma().postMedia.count()).toBe(0); // the rows are gone
    expect(storage.has(key)).toBe(true); // the object is not
    expect(await prisma().postMediaDeferredDeletion.count({ where: { objectKey: key } })).toBe(1); // but it is recorded

    storage.failDeleteFor.clear();
    const swept = await app.get(RejectedMediaSweepService).processDeferred(NOW);
    expect(swept.deleted).toBe(1);
    expect(storage.has(key)).toBe(false);
    expect(await prisma().postMediaDeferredDeletion.count()).toBe(0);
  });

  // ---- the cap and idempotence ---------------------------------------------------------------------------

  it(`deletes at most ${REPORT_RETENTION_MAX_PER_RUN} per run, the oldest first, and the next run takes the rest`, async () => {
    const total = REPORT_RETENTION_MAX_PER_RUN + 1;
    await prisma().report.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        reporterContactEmail: 'rep@example.com',
        targetType: 'user',
        targetId: `t-${i}`,
        reason: 'e2e',
        reasonCategory: 'other',
        status: 'reviewed',
        actionTaken: 'dismissed',
        reviewedAt: new Date(monthsAgo(13).getTime() - i * 60_000), // i = 0 is the NEWEST
      })),
    });
    const first = await retention.purgeDue(NOW);
    expect(first.deletedReports).toBe(REPORT_RETENTION_MAX_PER_RUN);
    expect(first.capped).toBe(true);
    const left = await prisma().report.findMany();
    expect(left).toHaveLength(1);
    expect(left[0].targetId).toBe('t-0'); // the newest of them waited
    const second = await retention.purgeDue(NOW);
    expect(second.deletedReports).toBe(1);
    expect(await prisma().report.count()).toBe(0);
    expect((await retention.purgeDue(NOW)).deletedReports).toBe(0);
  });

  it('never touches the action log', async () => {
    const mod = await admin();
    const r = await report();
    await prisma().adminActionLog.create({ data: { adminId: mod.id, action: 'report.dismissed', targetType: 'report', targetId: r.id } });
    await retention.purgeDue(NOW);
    expect(await reportExists(r.id)).toBe(false);
    expect(await prisma().adminActionLog.count()).toBe(1);
  });
});
