import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_PREFERENCE_KEYS, NotificationPreferenceKey } from './notification-policy.constants';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

export type NotificationSettings = Record<NotificationPreferenceKey, boolean>;

const DEFAULTS: NotificationSettings = {
  qualityFilter: false,
  muteNonFollowing: false,
  muteNonFollowers: false,
  muteNewAccounts: false,
};

const SELECT = {
  qualityFilter: true,
  muteNonFollowing: true,
  muteNonFollowers: true,
  muteNewAccounts: true,
} as const;

// backend/b062-notification-preferences (B-062; Decision Log #472 adopted default (c)).
// GET and PATCH /notification-settings: the caller's own four filter options. An absent row means all false, so a
// person who never opened the screen has no row. Self-scoped by the token subject; there is no :id.
@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationSettings> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId }, select: SELECT });
    return row ?? { ...DEFAULTS };
  }

  // Partial: only the keys sent are written; the rest keep their stored value (or false for a new row). An empty
  // body writes nothing and returns the current values.
  async update(userId: string, dto: UpdateNotificationSettingsDto): Promise<NotificationSettings> {
    const data: Partial<NotificationSettings> = {};
    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (Object.keys(data).length === 0) return this.get(userId);

    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: SELECT,
    });
    return row;
  }
}
