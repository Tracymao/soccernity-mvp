import { Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_PAYLOAD, PushSweepService } from './push-sweep.service';
import { PushConfig } from './push.config';
import { PUSH_BODY, PUSH_MAX_ROWS_PER_RUN, PUSH_TITLE, PUSH_WINDOW_MS } from './push.constants';
import { PushSendError, WebPushSender } from './web-push-sender';

const VAPID = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:support@soccernity.com' };
const NOW = new Date('2026-11-06T12:00:00.000Z');

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
const sub = (id: string): Sub => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: `p-${id}`, auth: `a-${id}` });

function build(opts: {
  vapid?: typeof VAPID | null;
  rows?: Array<{ id: string; userId: string }>;
  subsByUser?: Record<string, Sub[]>;
  claimCount?: (ids: string[]) => number;
  send?: jest.Mock;
}) {
  const subsByUser = opts.subsByUser ?? {};
  const prisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue(opts.rows ?? []),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        // the claim has pushSentAt: null in where; the release has pushSentAt: <date>
        if (where.pushSentAt === null) return Promise.resolve({ count: opts.claimCount ? opts.claimCount(where.id.in) : where.id.in.length });
        return Promise.resolve({ count: where.id.in.length, data });
      }),
    },
    pushSubscription: {
      findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(subsByUser[where.userId] ?? [])),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = { vapid: jest.fn().mockReturnValue(opts.vapid === undefined ? VAPID : opts.vapid) } as unknown as PushConfig;
  const send = opts.send ?? jest.fn().mockResolvedValue(undefined);
  const sender = { send } as unknown as WebPushSender;
  const service = new PushSweepService(prisma as unknown as PrismaService, config, sender, { now: () => NOW });
  return { prisma, send, service };
}

describe('PushSweepService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('the push text is exactly the generic line and carries nothing else', () => {
    expect(PUSH_TITLE).toBe('Soccernity');
    expect(PUSH_BODY).toBe('You have a new notification');
    expect(JSON.parse(PUSH_PAYLOAD)).toEqual({ title: 'Soccernity', body: 'You have a new notification' });
  });

  it('does nothing, and reads nothing, when the VAPID keys are unset', async () => {
    const { service, prisma, send } = build({ vapid: null, rows: [{ id: 'n1', userId: 'u1' }] });
    const result = await service.run();
    expect(result).toEqual({ users: 0, sent: 0, removed: 0, failed: 0 });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('selects only unpushed rows from the last 10 minutes whose owner has a subscription', async () => {
    const { service, prisma } = build({});
    await service.run();
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        pushSentAt: null,
        createdAt: { gte: new Date(NOW.getTime() - PUSH_WINDOW_MS) },
        user: { pushSubscriptions: { some: {} } },
      },
      select: { id: true, userId: true },
      orderBy: { createdAt: 'asc' },
      take: PUSH_MAX_ROWS_PER_RUN,
    });
    expect(PUSH_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('sends ONE push per subscription per user however many notifications are waiting, and marks every row', async () => {
    const { service, prisma, send } = build({
      rows: [
        { id: 'n1', userId: 'u1' },
        { id: 'n2', userId: 'u1' },
        { id: 'n3', userId: 'u1' },
        { id: 'n4', userId: 'u2' },
      ],
      subsByUser: { u1: [sub('s1'), sub('s2')], u2: [sub('s3')] },
    });
    const result = await service.run();
    expect(send).toHaveBeenCalledTimes(3); // u1: 2 browsers, u2: 1 browser; not 4
    expect(result).toEqual({ users: 2, sent: 3, removed: 0, failed: 0 });

    // The rows are marked with the run time, per user, before sending.
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2', 'n3'] }, pushSentAt: null },
      data: { pushSentAt: NOW },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n4'] }, pushSentAt: null },
      data: { pushSentAt: NOW },
    });
    // Nothing was released: every send was accepted.
    const releases = prisma.notification.updateMany.mock.calls.filter(([a]) => a.where.pushSentAt !== null);
    expect(releases).toHaveLength(0);
  });

  it('sends the exact payload, with the stored keys, and nothing about the notification', async () => {
    const { service, send } = build({ rows: [{ id: 'n1', userId: 'u1' }], subsByUser: { u1: [sub('s1')] } });
    await service.run();
    expect(send).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/s1', p256dh: 'p-s1', auth: 'a-s1' },
      '{"title":"Soccernity","body":"You have a new notification"}',
      VAPID,
    );
  });

  it('deletes a subscription the push service says is gone (404 and 410) and keeps the rows marked', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new PushSendError(410))
      .mockRejectedValueOnce(new PushSendError(404))
      .mockResolvedValueOnce(undefined);
    const { service, prisma } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1'), sub('s2'), sub('s3')] },
      send,
    });
    const result = await service.run();
    expect(result).toEqual({ users: 1, sent: 1, removed: 2, failed: 0 });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 's2' } });
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalledWith({ where: { id: 's3' } });
  });

  it('when every subscription is gone the rows stay marked (nothing left to retry)', async () => {
    const { service, prisma } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1')] },
      send: jest.fn().mockRejectedValue(new PushSendError(410)),
    });
    await service.run();
    expect(prisma.notification.updateMany.mock.calls.filter(([a]) => a.where.pushSentAt !== null)).toHaveLength(0);
  });

  it('a transient failure on every subscription releases the claim so the next run retries', async () => {
    const { service, prisma } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1'), sub('s2')] },
      send: jest.fn().mockRejectedValue(new PushSendError(503)),
    });
    const result = await service.run();
    expect(result).toEqual({ users: 1, sent: 0, removed: 0, failed: 2 });
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled(); // a 503 never deletes a subscription
    expect(prisma.notification.updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['n1'] }, pushSentAt: NOW },
      data: { pushSentAt: null },
    });
  });

  it('a network failure with no status counts as transient too', async () => {
    const { service, prisma } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1')] },
      send: jest.fn().mockRejectedValue(new PushSendError(null)),
    });
    const result = await service.run();
    expect(result.failed).toBe(1);
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps the rows marked when at least one of the person\'s browsers accepted the push', async () => {
    const send = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new PushSendError(500));
    const { service, prisma } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1'), sub('s2')] },
      send,
    });
    await service.run();
    expect(prisma.notification.updateMany.mock.calls.filter(([a]) => a.where.pushSentAt !== null)).toHaveLength(0);
  });

  it('a failure for one account does not stop the others', async () => {
    const send = jest.fn().mockImplementation((target: { endpoint: string }) =>
      target.endpoint.endsWith('/s1') ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );
    const { service } = build({
      rows: [
        { id: 'n1', userId: 'u1' },
        { id: 'n2', userId: 'u2' },
      ],
      subsByUser: { u1: [sub('s1')], u2: [sub('s2')] },
      send,
    });
    const result = await service.run();
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('an unexpected database error for one account is swallowed and the rest still run', async () => {
    const { service, prisma, send } = build({
      rows: [
        { id: 'n1', userId: 'u1' },
        { id: 'n2', userId: 'u2' },
      ],
      subsByUser: { u1: [sub('s1')], u2: [sub('s2')] },
    });
    prisma.pushSubscription.findMany.mockImplementationOnce(() => Promise.reject(new Error('db down')));
    await expect(service.run()).resolves.toEqual(expect.objectContaining({ sent: 1 }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a failing query never throws out of the sweep', async () => {
    const { service, prisma } = build({});
    prisma.notification.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.run()).resolves.toEqual({ users: 0, sent: 0, removed: 0, failed: 0 });
  });

  it('skips an account whose rows another instance already claimed', async () => {
    const { service, send } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1')] },
      claimCount: () => 0,
    });
    await service.run();
    expect(send).not.toHaveBeenCalled();
  });

  it('never logs an endpoint, a key or the payload', async () => {
    const { service } = build({
      rows: [{ id: 'n1', userId: 'u1' }],
      subsByUser: { u1: [sub('s1')] },
      send: jest.fn().mockRejectedValue(new PushSendError(500)),
    });
    await service.run();
    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('fcm.googleapis.com');
    expect(logged).not.toContain('p-s1');
    expect(logged).not.toContain('a-s1');
    expect(logged).not.toContain('priv');
  });

  it('is scheduled every minute', () => {
    const cron = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PushSweepService.prototype.run);
    expect(cron.cronTime).toBe(CronExpression.EVERY_MINUTE);
  });
});
