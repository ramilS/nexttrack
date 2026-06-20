import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsPreferencesService } from './notifications-preferences.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationType } from '@prisma/client';
import { ChannelSettings, UpdatePreferencesInput } from '@repo/shared/schemas';

describe('NotificationsPreferencesService', () => {
  let service: NotificationsPreferencesService;
  let repo: Record<string, jest.Mock>;

  const basePref = {
    userId: 'user-1',
    emailEnabled: true,
    emailMode: 'INSTANT',
    channelSettings: {},
    mutedProjectIds: [],
    mutedIssueIds: [],
  };

  beforeEach(async () => {
    repo = {
      upsertPreferences: jest.fn().mockResolvedValue(basePref),
      findPreferencesByUserIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsPreferencesService,
        { provide: NotificationsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(NotificationsPreferencesService);
  });

  describe('get', () => {
    it('should delegate to repo.upsertPreferences', async () => {
      const result = await service.get('user-1');

      expect(result).toEqual(basePref);
      expect(repo.upsertPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('update', () => {
    it('should pass mapped patch to repo', async () => {
      const dto: UpdatePreferencesInput = {
        emailMode: 'DIGEST',
        emailEnabled: false,
        channelSettings: {
          [NotificationType.ISSUE_ASSIGNED]: { inApp: true, email: false },
        },
      };

      await service.update('user-1', dto);

      expect(repo.upsertPreferences).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          emailMode: 'DIGEST',
          emailEnabled: false,
          channelSettings: dto.channelSettings,
        }),
      );
    });
  });

  describe('isMuted', () => {
    it('should return true when projectId is muted', async () => {
      repo.upsertPreferences.mockResolvedValue({
        ...basePref,
        mutedProjectIds: ['proj-muted'],
      });

      const result = await service.isMuted('user-1', 'proj-muted');

      expect(result).toBe(true);
    });

    it('should return true when issueId is muted', async () => {
      repo.upsertPreferences.mockResolvedValue({
        ...basePref,
        mutedIssueIds: ['issue-muted'],
      });

      const result = await service.isMuted('user-1', undefined, 'issue-muted');

      expect(result).toBe(true);
    });

    it('should return false when neither is muted', async () => {
      const result = await service.isMuted('user-1', 'proj-x', 'issue-x');

      expect(result).toBe(false);
    });
  });

  describe('isMutedSync', () => {
    it('should return true when project in muted list', () => {
      const prefs = { mutedProjectIds: ['p1'], mutedIssueIds: [] };

      expect(service.isMutedSync(prefs, 'p1')).toBe(true);
    });

    it('should return false when no project/issue is muted', () => {
      const prefs = { mutedProjectIds: [], mutedIssueIds: [] };

      expect(service.isMutedSync(prefs, 'p1', 'i1')).toBe(false);
    });
  });

  describe('getMany', () => {
    it('should fill defaults for users without prefs', async () => {
      repo.findPreferencesByUserIds.mockResolvedValue([
        { ...basePref, userId: 'user-1' },
      ]);

      const result = await service.getMany(['user-1', 'user-2']);

      expect(result.get('user-1')).toMatchObject({ userId: 'user-1' });
      expect(result.get('user-2')).toMatchObject({
        userId: 'user-2',
        emailEnabled: true,
        emailMode: 'INSTANT',
      });
    });

    it('should return empty map for empty input', async () => {
      const result = await service.getMany([]);

      expect(result.size).toBe(0);
      expect(repo.findPreferencesByUserIds).not.toHaveBeenCalled();
    });
  });

  describe('isChannelEnabled', () => {
    it('returns the channel flag from settings', () => {
      const channelSettings: ChannelSettings = {
        [NotificationType.ISSUE_ASSIGNED]: { inApp: true, email: false },
      };

      expect(
        service.isChannelEnabled(channelSettings, NotificationType.ISSUE_ASSIGNED, 'inApp'),
      ).toBe(true);
      expect(
        service.isChannelEnabled(channelSettings, NotificationType.ISSUE_ASSIGNED, 'email'),
      ).toBe(false);
    });

    it('returns false when type is missing from settings', () => {
      expect(
        service.isChannelEnabled({}, NotificationType.ISSUE_ASSIGNED, 'inApp'),
      ).toBe(false);
    });
  });
});
