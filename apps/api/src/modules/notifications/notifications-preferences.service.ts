import { Injectable } from '@nestjs/common';
import { NotificationType, EmailMode, Prisma } from '@prisma/client';
import {
  UpdatePreferencesInput,
  ChannelSettings,
  PreferenceChannel,
  NotificationPreferences,
} from '@repo/shared/schemas';
import {
  NotificationsRepository,
  NotificationPreferencesRow,
} from './notifications.repository';

const DEFAULT_PREFS = {
  emailMode: EmailMode.INSTANT as EmailMode,
  emailEnabled: true,
  channelSettings: {} as ChannelSettings,
  mutedProjectIds: [] as string[],
  mutedIssueIds: [] as string[],
};

/** Typed accessor for the `channelSettings` JSON column — centralizes the
 *  Prisma.JsonValue → ChannelSettings narrowing (see nestjs-type-safety). */
function getChannelSettings(value: Prisma.JsonValue): ChannelSettings {
  return (value ?? {}) as ChannelSettings;
}

function toPreferencesDto(
  row: NotificationPreferencesRow,
): NotificationPreferences {
  return {
    userId: row.userId,
    emailMode: row.emailMode,
    emailEnabled: row.emailEnabled,
    channelSettings: getChannelSettings(row.channelSettings),
    mutedProjectIds: row.mutedProjectIds,
    mutedIssueIds: row.mutedIssueIds,
  };
}

@Injectable()
export class NotificationsPreferencesService {
  constructor(private repo: NotificationsRepository) {}

  async get(userId: string): Promise<NotificationPreferences> {
    return toPreferencesDto(await this.repo.upsertPreferences(userId));
  }

  async update(
    userId: string,
    dto: UpdatePreferencesInput,
  ): Promise<NotificationPreferences> {
    const row = await this.repo.upsertPreferences(userId, {
      emailMode: dto.emailMode,
      emailEnabled: dto.emailEnabled,
      channelSettings: dto.channelSettings,
      mutedProjectIds: dto.mutedProjectIds,
      mutedIssueIds: dto.mutedIssueIds,
    });
    return toPreferencesDto(row);
  }

  async isMuted(userId: string, projectId?: string, issueId?: string): Promise<boolean> {
    const prefs = await this.get(userId);
    if (projectId && prefs.mutedProjectIds.includes(projectId)) return true;
    if (issueId && prefs.mutedIssueIds.includes(issueId)) return true;
    return false;
  }

  async getMany(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, NotificationPreferencesRow>();
    }

    const existing = await this.repo.findPreferencesByUserIds(userIds);
    const prefsMap = new Map(existing.map((p) => [p.userId, p]));

    const result = new Map<string, NotificationPreferencesRow>();
    for (const userId of userIds) {
      const found = prefsMap.get(userId);
      result.set(
        userId,
        found ?? {
          userId,
          ...DEFAULT_PREFS,
        },
      );
    }

    return result;
  }

  isMutedSync(
    prefs: { mutedProjectIds: string[]; mutedIssueIds: string[] },
    projectId?: string,
    issueId?: string,
  ): boolean {
    if (projectId && prefs.mutedProjectIds.includes(projectId)) return true;
    if (issueId && prefs.mutedIssueIds.includes(issueId)) return true;
    return false;
  }

  isChannelEnabled(
    channelSettings: ChannelSettings,
    type: NotificationType,
    channel: PreferenceChannel,
  ): boolean {
    const setting = channelSettings[type];
    if (!setting) return false;
    return setting[channel] ?? false;
  }
}
