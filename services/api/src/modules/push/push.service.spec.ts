import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushConfig } from './push.config';
import { PUSH_NOT_CONFIGURED_CODE } from './push.constants';
import { PUSH_ENDPOINT_NOT_ACCEPTED_CODE, PushService } from './push.service';

const VAPID = { publicKey: 'PUBLIC-KEY', privateKey: 'private', subject: 'mailto:support@soccernity.com' };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const DTO = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } };

function build(vapid: typeof VAPID | null = VAPID) {
  const prisma = {
    pushSubscription: {
      upsert: jest.fn().mockResolvedValue({ id: 's1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    vapid: jest.fn().mockReturnValue(vapid),
    isConfigured: jest.fn().mockReturnValue(vapid !== null),
  } as unknown as PushConfig;
  return { prisma, service: new PushService(prisma as unknown as PrismaService, config) };
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return (err as { getResponse(): { code?: string } }).getResponse().code;
  }
  throw new Error('did not throw');
}

describe('PushService', () => {
  describe('getStatus', () => {
    it('returns the PUBLIC key when configured, and never the private key', () => {
      const { service } = build();
      const status = service.getStatus();
      expect(status).toEqual({ available: true, publicKey: 'PUBLIC-KEY' });
      expect(JSON.stringify(status)).not.toContain('private');
    });

    it('reports unavailable, with no key, when the VAPID keys are unset', () => {
      const { service } = build(null);
      expect(service.getStatus()).toEqual({ available: false });
    });
  });

  describe('subscribe', () => {
    it('stores one row for the browser, owned by the caller', async () => {
      const { service, prisma } = build();
      await expect(service.subscribe('user-1', DTO)).resolves.toEqual({ subscribed: true });
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: ENDPOINT },
        create: { userId: 'user-1', endpoint: ENDPOINT, p256dh: 'p256dh-value', auth: 'auth-value' },
        update: { userId: 'user-1', p256dh: 'p256dh-value', auth: 'auth-value' },
        select: { id: true },
      });
    });

    it('is idempotent: every call is an upsert keyed on the endpoint, never a plain insert', async () => {
      const { service, prisma } = build();
      await service.subscribe('user-1', DTO);
      await service.subscribe('user-1', DTO);
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledTimes(2);
      for (const [arg] of prisma.pushSubscription.upsert.mock.calls) expect(arg.where).toEqual({ endpoint: ENDPOINT });
    });

    it('moves the row to the current account when another account used the same browser', async () => {
      const { service, prisma } = build();
      await service.subscribe('user-2', DTO);
      expect(prisma.pushSubscription.upsert.mock.calls[0][0].update.userId).toBe('user-2');
    });

    it('answers 503 push_not_configured and writes nothing when the keys are unset', async () => {
      const { service, prisma } = build(null);
      await expect(service.subscribe('user-1', DTO)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await codeOf(service.subscribe('user-1', DTO))).toBe(PUSH_NOT_CONFIGURED_CODE);
      expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    });

    it('refuses an endpoint that is not a known browser push service (400, coded) and writes nothing', async () => {
      const { service, prisma } = build();
      const bad = { ...DTO, endpoint: 'https://169.254.169.254/latest' };
      await expect(service.subscribe('user-1', bad)).rejects.toBeInstanceOf(BadRequestException);
      expect(await codeOf(service.subscribe('user-1', bad))).toBe(PUSH_ENDPOINT_NOT_ACCEPTED_CODE);
      expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('deletes only the callers own row for that endpoint', async () => {
      const { service, prisma } = build();
      await service.unsubscribe('user-1', ENDPOINT);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', endpoint: ENDPOINT } });
    });

    it('is a quiet no-op when nothing matches (also for another accounts endpoint)', async () => {
      const { service, prisma } = build();
      prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unsubscribe('user-1', ENDPOINT)).resolves.toBeUndefined();
    });

    it('answers 503 push_not_configured when the keys are unset', async () => {
      const { service, prisma } = build(null);
      expect(await codeOf(service.unsubscribe('user-1', ENDPOINT))).toBe(PUSH_NOT_CONFIGURED_CODE);
      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });
  });
});
