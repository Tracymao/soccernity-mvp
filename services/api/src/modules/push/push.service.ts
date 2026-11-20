import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { isAllowedPushEndpoint } from './push-endpoint.util';
import { PushConfig } from './push.config';
import { PUSH_NOT_CONFIGURED_CODE } from './push.constants';

export const PUSH_ENDPOINT_NOT_ACCEPTED_CODE = 'push_endpoint_not_accepted';

export interface PushStatus {
  available: boolean;
  publicKey?: string;
}

// backend/b285-web-push (B-285; Decision Log #472 adopted default (e)): the three settings calls. Self-scoped by the
// token subject; the subscription's keys are never returned or logged.
@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PushConfig,
  ) {}

  /** `{ available: false }` when the VAPID keys are unset; otherwise the PUBLIC key the browser subscribes with. */
  getStatus(): PushStatus {
    const vapid = this.config.vapid();
    return vapid ? { available: true, publicKey: vapid.publicKey } : { available: false };
  }

  // One row per browser (the endpoint is unique): subscribing again from the same browser is a no-op that refreshes
  // the keys. DEFAULT, founder-veto-able: if the endpoint already belongs to ANOTHER account (one browser, two
  // sign-ins) the row moves to the current account, so the previous account stops receiving this browser's pushes.
  async subscribe(userId: string, dto: CreatePushSubscriptionDto): Promise<{ subscribed: true }> {
    this.assertAvailable();
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: PUSH_ENDPOINT_NOT_ACCEPTED_CODE,
        message: 'This browser address cannot be used for notifications.',
      });
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      select: { id: true },
    });
    return { subscribed: true };
  }

  // Only the caller's own row: another account's endpoint is a silent no-op (never reveals that it exists).
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    this.assertAvailable();
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  private assertAvailable(): void {
    if (!this.config.isConfigured()) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: PUSH_NOT_CONFIGURED_CODE,
        message: 'Notifications on this device are not available right now.',
      });
    }
  }
}
