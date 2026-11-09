import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MessageRetentionService } from './message-retention.service';
import { MESSAGE_RETENTION_MAX_PER_RUN } from './messaging.constants';
import { readMessagingConfig } from './messaging.config';

// backend/b287-message-retention (B-287; Decision Log #478). Unit level, mocked clock: the cutoff, the report
// guards in BOTH statements, the cap, the conversation clean-up and the config. The SQL itself (the guards
// really protect a row, the cascade really removes MessageHide) runs against real Postgres in
// test/message-retention.e2e-spec.ts.

type Call = { sql: string; values: unknown[] };

function build(env: Record<string, string | undefined> = {}) {
  const raw: Call[] = [];
  const queue: unknown[][] = [];
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      raw.push({ sql: strings.join('?'), values });
      return queue.shift() ?? [];
    }),
    conversation: {
      deleteMany: jest.fn().mockImplementation(async () => ({ count: 0 })),
    },
  };
  const prisma = { $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return { service: new MessageRetentionService(prisma as never, config), prisma, tx, raw, queue };
}

const NOW = new Date('2026-11-09T12:00:00.000Z');
const CUTOFF = new Date('2025-11-09T12:00:00.000Z');

describe('MessageRetentionService.purgeExpired', () => {
  afterEach(() => jest.restoreAllMocks());

  it('selects messages sent strictly before NOW minus 12 calendar months, oldest first', async () => {
    const { service, raw } = build();
    await service.purgeExpired(NOW);
    expect(raw).toHaveLength(1);
    expect(raw[0].sql).toContain('m."sentAt" <');
    expect(raw[0].sql).toMatch(/ORDER BY m\."sentAt" ASC, m\."id" ASC/);
    expect(raw[0].values[0]).toEqual(CUTOFF);
  });

  it('keeps the boundary strict: the cutoff is the instant itself (a message sent exactly then is NOT before it)', async () => {
    const { service, raw } = build();
    await service.purgeExpired(new Date('2026-11-09T12:00:00.000Z'));
    expect((raw[0].values[0] as Date).toISOString()).toBe('2025-11-09T12:00:00.000Z');
    expect(raw[0].sql).toContain('<'); // strictly older, never <=
    expect(raw[0].sql).not.toContain('<=');
  });

  it('uses calendar months in UTC, not a fixed day count (a leap-day anchor lands on the real date)', async () => {
    const { service, raw } = build();
    await service.purgeExpired(new Date('2028-02-29T00:00:00.000Z'));
    // setUTCMonth(-12) from 29 Feb 2028 is 29 Feb 2027, which does not exist -> 1 Mar 2027 (JS rollover).
    expect((raw[0].values[0] as Date).toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('honours MESSAGE_RETENTION_MONTHS', async () => {
    const { service, raw } = build({ MESSAGE_RETENTION_MONTHS: '6' });
    await service.purgeExpired(NOW);
    expect(raw[0].values[0]).toEqual(new Date('2026-05-09T12:00:00.000Z'));
  });

  it('never selects a message a report points at, or that a report attached as context', async () => {
    const { service, raw } = build();
    await service.purgeExpired(NOW);
    expect(raw[0].sql).toContain(`r."targetType" = 'message' AND r."targetId" = m."id"`);
    expect(raw[0].sql).toContain(`FROM "ReportContextMessage" c WHERE c."messageId" = m."id"`);
    expect(raw[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "Report"/);
    expect(raw[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "ReportContextMessage"/);
  });

  it('repeats the age and both report guards in the DELETE statement, so a report filed in between protects the message', async () => {
    const { service, raw, queue } = build();
    queue.push([{ id: 'a' }, { id: 'b' }], [{ conversationId: 'c1' }, { conversationId: 'c1' }]);
    await service.purgeExpired(NOW);
    expect(raw).toHaveLength(2);
    const del = raw[1];
    expect(del.sql).toContain('DELETE FROM "Message" m');
    expect(del.sql).toContain('m."sentAt" <');
    expect(del.sql).toContain(`r."targetType" = 'message' AND r."targetId" = m."id"`);
    expect(del.sql).toContain(`c."messageId" = m."id"`);
    expect(del.values).toEqual([['a', 'b'], CUTOFF]);
  });

  it('does not filter by age of the sender, edit state, deletedForEveryone or minor status (applies to all)', async () => {
    const { service, raw } = build();
    await service.purgeExpired(NOW);
    for (const forbidden of ['isMinor', 'deletedForEveryoneAt', 'editedAt', 'originalContentText', 'senderId']) {
      expect(raw[0].sql).not.toContain(forbidden);
    }
  });

  it('does nothing further (no DELETE, no conversation clean-up) when nothing is due', async () => {
    const { service, raw, tx } = build();
    await expect(service.purgeExpired(NOW)).resolves.toEqual({ deletedMessageCount: 0, deletedConversationCount: 0, capped: false });
    expect(raw).toHaveLength(1);
    expect(tx.conversation.deleteMany).not.toHaveBeenCalled();
  });

  it('runs the whole thing in one transaction', async () => {
    const { service, prisma } = build();
    await service.purgeExpired(NOW);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is capped per run: deletes only the oldest MESSAGE_RETENTION_MAX_PER_RUN and reports capped', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, raw, queue } = build();
    const many = Array.from({ length: MESSAGE_RETENTION_MAX_PER_RUN + 1 }, (_, i) => ({ id: `m${i}` }));
    queue.push(many, []);
    const r = await service.purgeExpired(NOW);
    expect(r.capped).toBe(true);
    expect(raw[0].values[raw[0].values.length - 1]).toBe(MESSAGE_RETENTION_MAX_PER_RUN + 1);
    const ids = raw[1].values[0] as string[];
    expect(ids).toHaveLength(MESSAGE_RETENTION_MAX_PER_RUN);
    expect(ids).not.toContain(`m${MESSAGE_RETENTION_MAX_PER_RUN}`);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('the rest wait for the next run'));
  });

  it('is not capped when exactly the cap is due', async () => {
    const { service, queue } = build();
    queue.push(Array.from({ length: MESSAGE_RETENTION_MAX_PER_RUN }, (_, i) => ({ id: `m${i}` })), []);
    expect((await service.purgeExpired(NOW)).capped).toBe(false);
  });

  it('then deletes only the conversations that LOST messages and are now empty, with the empty-check in the DELETE', async () => {
    const { service, tx, queue } = build();
    queue.push([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ conversationId: 'c1' }, { conversationId: 'c2' }, { conversationId: 'c1' }]);
    tx.conversation.deleteMany.mockResolvedValue({ count: 1 });
    const r = await service.purgeExpired(NOW);
    expect(tx.conversation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] }, messages: { none: {} } },
    });
    expect(r).toEqual({ deletedMessageCount: 3, deletedConversationCount: 1, capped: false });
  });

  it('counts only messages the DELETE really removed (a message protected in between is not counted)', async () => {
    const { service, queue, tx } = build();
    queue.push([{ id: 'a' }, { id: 'b' }], [{ conversationId: 'c1' }]);
    const r = await service.purgeExpired(NOW);
    expect(r.deletedMessageCount).toBe(1);
    expect(tx.conversation.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('skips the conversation clean-up if the DELETE removed nothing (every due message was protected in between)', async () => {
    const { service, queue, tx } = build();
    queue.push([{ id: 'a' }], []);
    await expect(service.purgeExpired(NOW)).resolves.toEqual({ deletedMessageCount: 0, deletedConversationCount: 0, capped: false });
    expect(tx.conversation.deleteMany).not.toHaveBeenCalled();
  });

  it('never logs ids, names or text, only counts', async () => {
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, queue } = build();
    queue.push([{ id: 'secret-message-id' }], [{ conversationId: 'secret-conversation-id' }]);
    await service.runDailyPurge();
    const logged = info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('messages=1');
    expect(logged).not.toContain('secret-');
  });

  it('logs a failure once and does not throw out of the cron entry point', async () => {
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(service.runDailyPurge()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('will run again tomorrow'));
  });
});

describe('readMessagingConfig', () => {
  const read = (v: string | undefined) => readMessagingConfig({ get: () => v }).retentionMonths;

  it('defaults to 12 when unset, blank, zero, negative, fractional or not a number', () => {
    for (const v of [undefined, '', '  ', '0', '-3', '1.5', 'abc']) expect(read(v)).toBe(12);
  });

  it('reads a positive whole number', () => {
    expect(read('24')).toBe(24);
    expect(read('1')).toBe(1);
  });
});
