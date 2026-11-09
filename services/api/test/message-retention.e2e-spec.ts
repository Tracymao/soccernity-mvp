import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { MessageRetentionService } from '../src/modules/messaging/message-retention.service';
import { MESSAGE_RETENTION_MAX_PER_RUN } from '../src/modules/messaging/messaging.constants';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/b287-message-retention (B-287; Decision Log #478). The retention job against REAL Postgres: the
// 12-month boundary, minors and adults alike, edited originals and messages deleted for everyone, the two
// report guards (a Report pointing at the message, and a ReportContextMessage row -- a RESTRICT foreign key),
// MessageHide going by cascade, the empty-conversation clean-up (and never an empty thread that never had a
// message), and the per-run cap. The clock is the `now` argument, never the wall clock.
describe('Message retention e2e (b287-message-retention)', () => {
  let app: INestApplication;
  let retention: MessageRetentionService;
  const NOW = new Date('2026-11-09T12:00:00.000Z');
  // 12 months before NOW, exactly.
  const CUTOFF = new Date('2025-11-09T12:00:00.000Z');
  const OLD = new Date('2025-06-01T10:00:00.000Z');
  const RECENT = new Date('2026-09-01T10:00:00.000Z');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    retention = app.get(MessageRetentionService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2);

  async function user(label: string, isMinor = false) {
    return prisma().user.create({
      data: {
        email: `e2e-msgret-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        displayName: `Real ${label}`,
        username: `mret_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob(isMinor ? '2012-03-03' : '1993-03-03'),
        isMinor,
      },
    });
  }

  async function conversation(a: string, b: string, lastMessageAt = RECENT) {
    const ids = [a, b].sort();
    return prisma().conversation.create({ data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt } });
  }

  const message = (conversationId: string, senderId: string, sentAt: Date, extra: Record<string, unknown> = {}) =>
    prisma().message.create({ data: { conversationId, senderId, contentText: 'hello', sentAt, ...extra } });

  const exists = async (id: string) => (await prisma().message.count({ where: { id } })) === 1;

  it('deletes a message older than 12 months and keeps one inside the window; the boundary instant itself is kept', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const old = await message(c.id, a.id, OLD);
    const justOlder = await message(c.id, a.id, new Date(CUTOFF.getTime() - 1));
    const atCutoff = await message(c.id, a.id, CUTOFF);
    const recent = await message(c.id, b.id, RECENT);

    const r = await retention.purgeExpired(NOW);

    expect(r.deletedMessageCount).toBe(2);
    expect(await exists(old.id)).toBe(false);
    expect(await exists(justOlder.id)).toBe(false);
    expect(await exists(atCutoff.id)).toBe(true);
    expect(await exists(recent.id)).toBe(true);
    // The conversation still has messages: it stays.
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(1);
    expect(r.deletedConversationCount).toBe(0);
  });

  it('applies to minors and adults alike', async () => {
    const adult = await user('adult');
    const minor = await user('minor', true);
    const c = await conversation(adult.id, minor.id);
    const fromMinor = await message(c.id, minor.id, OLD);
    const fromAdult = await message(c.id, adult.id, OLD);
    await message(c.id, adult.id, RECENT);
    await retention.purgeExpired(NOW);
    expect(await exists(fromMinor.id)).toBe(false);
    expect(await exists(fromAdult.id)).toBe(false);
  });

  it('removes the edited original with the row, and a message deleted for everyone', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const edited = await message(c.id, a.id, OLD, { contentText: 'new', originalContentText: 'ORIGINAL-SECRET', editedAt: new Date('2025-06-01T10:05:00Z') });
    const gone = await message(c.id, a.id, OLD, { deletedForEveryoneAt: new Date('2025-06-02T10:00:00Z') });
    await message(c.id, a.id, RECENT);
    await retention.purgeExpired(NOW);
    expect(await exists(edited.id)).toBe(false);
    expect(await exists(gone.id)).toBe(false);
    expect(await prisma().$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "Message" WHERE "originalContentText" = 'ORIGINAL-SECRET'`).toEqual([{ n: BigInt(0) }]);
  });

  it('never deletes a message a report points at (targetType message), however old', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const reported = await message(c.id, a.id, OLD);
    const plain = await message(c.id, a.id, OLD);
    await prisma().report.create({
      data: { reporterId: b.id, targetType: 'message', targetId: reported.id, reason: 'x', reasonCategory: 'other' },
    });
    const r = await retention.purgeExpired(NOW);
    expect(await exists(reported.id)).toBe(true);
    expect(await exists(plain.id)).toBe(false);
    expect(r.deletedMessageCount).toBe(1);
    // The conversation keeps its protected message, so it stays too.
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(1);
  });

  it('a report of another type with the same id does not protect a message', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const m = await message(c.id, a.id, OLD);
    await prisma().report.create({ data: { reporterId: b.id, targetType: 'post', targetId: m.id, reason: 'x', reasonCategory: 'other' } });
    await message(c.id, a.id, RECENT);
    await retention.purgeExpired(NOW);
    expect(await exists(m.id)).toBe(false);
  });

  it('never deletes a message attached to a report as context (ReportContextMessage)', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const reported = await message(c.id, a.id, RECENT);
    const context = await message(c.id, a.id, OLD);
    const other = await message(c.id, a.id, OLD);
    const report = await prisma().report.create({
      data: { reporterId: b.id, targetType: 'message', targetId: reported.id, reason: 'x', reasonCategory: 'other' },
    });
    await prisma().reportContextMessage.create({ data: { reportId: report.id, messageId: context.id } });
    const r = await retention.purgeExpired(NOW);
    expect(await exists(context.id)).toBe(true);
    expect(await exists(other.id)).toBe(false);
    expect(r.deletedMessageCount).toBe(1);
  });

  it('the report guards are repeated in the DELETE: a report filed after the SELECT still protects the message', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const m = await message(c.id, a.id, OLD);
    await message(c.id, a.id, RECENT);
    // Reach into the job's own transaction: wrap $transaction so a report appears between its two statements.
    const prismaService = (retention as unknown as { prisma: { $transaction: (cb: (tx: any) => Promise<unknown>) => Promise<unknown> } }).prisma;
    const original = prismaService.$transaction.bind(prismaService);
    let injected = false;
    prismaService.$transaction = (cb) =>
      original(async (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === '$queryRaw') {
              return async (...args: unknown[]) => {
                const sql = String((args[0] as TemplateStringsArray).join('?'));
                if (sql.includes('DELETE FROM "Message"') && !injected) {
                  injected = true;
                  await prisma().report.create({
                    data: { reporterId: b.id, targetType: 'message', targetId: m.id, reason: 'x', reasonCategory: 'other' },
                  });
                }
                return (target.$queryRaw as (...a: unknown[]) => unknown)(...args);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return cb(wrapped);
      });
    try {
      const r = await retention.purgeExpired(NOW);
      expect(injected).toBe(true);
      expect(await exists(m.id)).toBe(true);
      expect(r.deletedMessageCount).toBe(0);
    } finally {
      prismaService.$transaction = original;
    }
  });

  it('removes MessageHide rows with the message (cascade) and keeps the hides of a message that stays', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const old = await message(c.id, a.id, OLD);
    const recent = await message(c.id, a.id, RECENT);
    await prisma().messageHide.create({ data: { userId: b.id, messageId: old.id } });
    await prisma().messageHide.create({ data: { userId: b.id, messageId: recent.id } });
    await retention.purgeExpired(NOW);
    expect(await prisma().messageHide.count({ where: { messageId: old.id } })).toBe(0);
    expect(await prisma().messageHide.count({ where: { messageId: recent.id } })).toBe(1);
  });

  it('deletes a conversation left with no messages, and its ConversationHide rows with it', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id, OLD);
    await message(c.id, a.id, OLD);
    await message(c.id, b.id, new Date('2025-06-02T10:00:00Z'));
    await prisma().conversationHide.create({ data: { userId: a.id, conversationId: c.id } });
    const r = await retention.purgeExpired(NOW);
    expect(r).toEqual({ deletedMessageCount: 2, deletedConversationCount: 1, capped: false });
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(0);
    expect(await prisma().conversationHide.count({ where: { conversationId: c.id } })).toBe(0);
    // The participants can start a fresh thread: the unique participant key is free again.
    const again = await conversation(a.id, b.id);
    expect(again.id).not.toBe(c.id);
  });

  it('never deletes a conversation that never had a message (a thread just started)', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await user('c');
    const fresh = await conversation(a.id, b.id, RECENT);
    const other = await conversation(a.id, c.id);
    await message(other.id, a.id, OLD);
    const r = await retention.purgeExpired(NOW);
    expect(r.deletedConversationCount).toBe(1);
    expect(await prisma().conversation.count({ where: { id: fresh.id } })).toBe(1);
    expect(await prisma().conversation.count({ where: { id: other.id } })).toBe(0);
  });

  it('keeps a conversation whose only old message is protected by a report', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id, OLD);
    const reported = await message(c.id, a.id, OLD);
    await prisma().report.create({ data: { reporterId: b.id, targetType: 'message', targetId: reported.id, reason: 'x', reasonCategory: 'other' } });
    const r = await retention.purgeExpired(NOW);
    expect(r).toEqual({ deletedMessageCount: 0, deletedConversationCount: 0, capped: false });
    expect(await prisma().conversation.count({ where: { id: c.id } })).toBe(1);
  });

  it('is idempotent: a second run finds nothing', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    await message(c.id, a.id, OLD);
    await message(c.id, a.id, RECENT);
    await retention.purgeExpired(NOW);
    expect(await retention.purgeExpired(NOW)).toEqual({ deletedMessageCount: 0, deletedConversationCount: 0, capped: false });
  });

  it('is capped per run, oldest first, and the next run finishes the rest', async () => {
    const a = await user('a');
    const b = await user('b');
    const c = await conversation(a.id, b.id);
    const total = MESSAGE_RETENTION_MAX_PER_RUN + 3;
    const base = new Date('2025-01-01T00:00:00.000Z').getTime();
    await prisma().message.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        conversationId: c.id,
        senderId: a.id,
        contentText: `m${i}`,
        sentAt: new Date(base + i * 60_000),
      })),
    });
    await message(c.id, a.id, RECENT);
    const first = await retention.purgeExpired(NOW);
    expect(first.deletedMessageCount).toBe(MESSAGE_RETENTION_MAX_PER_RUN);
    expect(first.capped).toBe(true);
    // Oldest first: the three newest of the old batch are the ones left.
    const left = await prisma().message.findMany({ where: { sentAt: { lt: CUTOFF } }, orderBy: { sentAt: 'asc' } });
    expect(left.map((m) => m.contentText)).toEqual([`m${total - 3}`, `m${total - 2}`, `m${total - 1}`]);
    const second = await retention.purgeExpired(NOW);
    expect(second).toEqual({ deletedMessageCount: 3, deletedConversationCount: 0, capped: false });
  });
});
