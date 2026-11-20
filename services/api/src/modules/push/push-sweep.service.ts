import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { PushConfig } from './push.config';
import {
  PUSH_BODY,
  PUSH_GONE_STATUS_CODES,
  PUSH_MAX_ROWS_PER_RUN,
  PUSH_TITLE,
  PUSH_WINDOW_MS,
} from './push.constants';
import { PushSendError, WebPushSender } from './web-push-sender';

export interface PushSweepResult {
  /** Accounts that had unpushed notifications and at least one subscription. */
  users: number;
  /** Pushes the push services accepted (one per subscription). */
  sent: number;
  /** Subscriptions deleted because the push service said they are gone (404 or 410). */
  removed: number;
  /** Subscriptions that failed for another reason (kept; retried next minute while rows are in the window). */
  failed: number;
}

/** The exact push body. Fixed text: nothing about the notification's content, names or type ever goes in. */
export const PUSH_PAYLOAD = JSON.stringify({ title: PUSH_TITLE, body: PUSH_BODY });

// backend/b285-web-push (B-285; Decision Log #472 adopted default (e)). A per-minute sweep sends the generic web
// push, so the thirteen places that WRITE a Notification row are untouched. The trade-off is a delay of up to one
// minute between a notification and its push.
//
// Rows that qualify: pushSentAt NULL, created within the last PUSH_WINDOW_MS, owner has at least one subscription.
// A notification the B-062 preference rule suppresses is never STORED, so it never reaches this sweep: nothing here
// re-checks that rule.
//
// ONE push per user per run to each of their subscriptions, however many rows were waiting. The rows are CLAIMED
// first (updateMany ... pushSentAt NULL -> now), so two API instances never send the same push; if every send then
// fails for a transient reason the claim is released and the rows are retried next minute (until they leave the
// window). If the account has no subscription left (all gone) the rows stay marked: there is nothing to retry.
//
// A failure never throws out of the sweep and never logs an endpoint or key: only counts and status codes are logged.
@Injectable()
export class PushSweepService {
  private readonly logger = new Logger(PushSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PushConfig,
    private readonly sender: WebPushSender,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(now: Date = this.clock.now()): Promise<PushSweepResult> {
    const result: PushSweepResult = { users: 0, sent: 0, removed: 0, failed: 0 };
    try {
      const vapid = this.config.vapid();
      if (!vapid) return result;

      const since = new Date(now.getTime() - PUSH_WINDOW_MS);
      const rows = await this.prisma.notification.findMany({
        where: { pushSentAt: null, createdAt: { gte: since }, user: { pushSubscriptions: { some: {} } } },
        select: { id: true, userId: true },
        orderBy: { createdAt: 'asc' },
        take: PUSH_MAX_ROWS_PER_RUN,
      });
      const byUser = new Map<string, string[]>();
      for (const row of rows) {
        const ids = byUser.get(row.userId) ?? [];
        ids.push(row.id);
        byUser.set(row.userId, ids);
      }

      for (const [userId, ids] of byUser) {
        try {
          await this.pushToUser(userId, ids, now, vapid, result);
        } catch (err) {
          this.logger.warn(`Push for one account failed (${(err as Error)?.name ?? 'Error'}); continuing.`);
        }
      }
      if (result.users > 0) {
        this.logger.log(
          `Push sweep: ${result.users} accounts, ${result.sent} sent, ${result.removed} subscriptions removed, ${result.failed} failed.`,
        );
      }
    } catch (err) {
      this.logger.warn(`Push sweep failed (${(err as Error)?.name ?? 'Error'}); it will run again.`);
    }
    return result;
  }

  private async pushToUser(
    userId: string,
    ids: string[],
    now: Date,
    vapid: NonNullable<ReturnType<PushConfig['vapid']>>,
    result: PushSweepResult,
  ): Promise<void> {
    const claim = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, pushSentAt: null },
      data: { pushSentAt: now },
    });
    if (claim.count === 0) return; // another instance took them

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return; // gone since the query; rows stay marked, nothing to retry

    result.users += 1;
    let accepted = 0;
    let transientFailures = 0;
    for (const sub of subscriptions) {
      try {
        await this.sender.send({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, PUSH_PAYLOAD, vapid);
        accepted += 1;
        result.sent += 1;
      } catch (err) {
        const status = err instanceof PushSendError ? err.statusCode : null;
        if (status !== null && PUSH_GONE_STATUS_CODES.includes(status)) {
          await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          result.removed += 1;
        } else {
          transientFailures += 1;
          result.failed += 1;
        }
      }
    }

    // Every send failed for a transient reason: give the claim back so the next run tries again.
    if (accepted === 0 && transientFailures > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: ids }, pushSentAt: now },
        data: { pushSentAt: null },
      });
    }
  }
}
