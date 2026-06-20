import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { ActivitiesRepository } from './activities.repository';
import { ActivityType } from '@prisma/client';
import { ActivityEntry } from './activity-builder';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let repo: {
    createMany: jest.Mock;
    create: jest.Mock;
    findByIssue: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      createMany: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      findByIssue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: ActivitiesRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(ActivitiesService);
  });

  describe('record', () => {
    const issueId = 'issue-1';
    const actorId = 'user-1';

    it('should call repo.createMany with mapped entries', async () => {
      const entries: ActivityEntry[] = [
        { type: 'TITLE_CHANGE', payload: { from: 'Old', to: 'New' } },
        { type: 'PRIORITY_CHANGE', payload: { from: 'LOW', to: 'HIGH' } },
      ];

      await service.record(issueId, actorId, entries);

      expect(repo.createMany).toHaveBeenCalledWith(
        [
          { issueId, actorId, type: 'TITLE_CHANGE', payload: { from: 'Old', to: 'New' } },
          { issueId, actorId, type: 'PRIORITY_CHANGE', payload: { from: 'LOW', to: 'HIGH' } },
        ],
        undefined,
      );
    });

    it('should pass tx through to repo.createMany', async () => {
      const txSentinel = { sentinel: 'tx' } as never;
      const entries: ActivityEntry[] = [
        { type: 'TITLE_CHANGE', payload: { from: 'Old', to: 'New' } },
      ];

      await service.record(issueId, actorId, entries, txSentinel);

      expect(repo.createMany).toHaveBeenCalledWith(expect.anything(), txSentinel);
    });

    it('should return early and not call repo when entries array is empty', async () => {
      await service.record(issueId, actorId, []);

      expect(repo.createMany).not.toHaveBeenCalled();
    });

    it('should propagate repo errors', async () => {
      const entries: ActivityEntry[] = [
        { type: 'TITLE_CHANGE', payload: { from: 'A', to: 'B' } },
      ];

      repo.createMany.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.record(issueId, actorId, entries)).rejects.toThrow(
        'DB connection lost',
      );
    });
  });

  describe('recordOne', () => {
    const issueId = 'issue-1';
    const actorId = 'user-1';
    const type: ActivityType = 'ISSUE_CREATED';
    const payload = { title: 'New Issue' };

    it('should call repo.create with input', async () => {
      const created = {
        id: 'act-1',
        issueId,
        type,
        payload,
        createdAt: new Date(),
        actor: { id: actorId, name: 'A', email: 'a@b.c', avatarUrl: null },
      };
      repo.create.mockResolvedValue(created);

      const result = await service.recordOne(issueId, actorId, type, payload);

      expect(repo.create).toHaveBeenCalledWith(
        { issueId, actorId, type, payload },
        undefined,
      );
      expect(result).toBe(created);
    });

    it('should pass tx through to repo.create', async () => {
      const txSentinel = { sentinel: 'tx' } as never;
      repo.create.mockResolvedValue({} as never);

      await service.recordOne(issueId, actorId, type, payload, txSentinel);

      expect(repo.create).toHaveBeenCalledWith(expect.anything(), txSentinel);
    });

    it('should propagate repo errors', async () => {
      repo.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        service.recordOne(issueId, actorId, type, payload),
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('findByIssue', () => {
    it('should delegate to repo.findByIssue', async () => {
      const result = { items: [], meta: { nextCursor: null, pageSize: 50, hasNextPage: false } };
      repo.findByIssue.mockResolvedValue(result);

      const out = await service.findByIssue('issue-1', { pageSize: 10 });

      expect(repo.findByIssue).toHaveBeenCalledWith('issue-1', { pageSize: 10 });
      expect(out).toEqual(result);
    });

    it('maps each row to the response shape (createdAt → ISO)', async () => {
      const createdAt = new Date('2026-01-02T03:04:05.000Z');
      repo.findByIssue.mockResolvedValue({
        items: [
          {
            id: 'act-1',
            issueId: 'issue-1',
            type: ActivityType.STATUS_CHANGE,
            payload: { from: 'a', to: 'b' },
            createdAt,
            actor: { id: 'u1', name: 'U', email: 'u@x.io', avatarUrl: null },
          },
        ],
        meta: { nextCursor: null, pageSize: 50, hasNextPage: false },
      });

      const out = await service.findByIssue('issue-1');

      expect(out.items[0]).toEqual({
        id: 'act-1',
        issueId: 'issue-1',
        type: ActivityType.STATUS_CHANGE,
        payload: { from: 'a', to: 'b' },
        createdAt: '2026-01-02T03:04:05.000Z',
        actor: { id: 'u1', name: 'U', email: 'u@x.io', avatarUrl: null },
      });
    });
  });
});
