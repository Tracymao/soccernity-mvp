import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPolicyDb, shouldCreateNotification } from './notification-policy.util';

// backend/b062-notification-preferences: the injectable face of the one rule in notification-policy.util.ts, for
// callers that hold the service rather than a transaction client. The three creators (like, comment, follow) call
// the util directly with their transaction client so the check and the insert are one unit and no creator gains a
// constructor dependency (which would change every existing spec that builds them by hand); this wrapper exists so
// any future creator that is not inside a transaction has the same single entry point.
@Injectable()
export class NotificationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  shouldCreate(recipientId: string, actorId: string, type: string, now?: Date): Promise<boolean> {
    return shouldCreateNotification(this.prisma as unknown as NotificationPolicyDb, recipientId, actorId, type, now);
  }
}
