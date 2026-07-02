import { Test, TestingModule } from '@nestjs/testing';
import { ConflictError, NotFoundError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { MigrationService } from './migration.service';
import { MigrationRepository } from './migration.repository';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { CustomFieldsRepository } from '@/modules/custom-fields/custom-fields.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { RolesRepository } from '@/modules/roles/roles.repository';
import { TagsService } from '@/modules/tags/tags.service';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { IssueLinksService } from '@/modules/issue-links/issue-links.service';
import { TimeLogsService } from '@/modules/time-tracking/time-logs.service';
import { migrationConfig } from '@/config';

describe('MigrationService', () => {
  let service: MigrationService;
  let repo: Record<string, jest.Mock>;
  let issuesRepo: { getNextNumber: jest.Mock };
  let customFieldsRepo: { findManyByProject: jest.Mock };
  let workflowsReader: { findDefaultStatuses: jest.Mock };
  let projectMembersRepo: { createManyIgnoreDuplicates: jest.Mock };
  let rolesRepo: { findAll: jest.Mock };
  let tagsService: { create: jest.Mock };
  let issueLinksService: { create: jest.Mock };
  let timeLogsService: { importMany: jest.Mock };
  let tagsRepo: {
    findByNameInsensitive: jest.Mock;
    replaceIssueLinksBulk: jest.Mock;
  };

  const now = new Date();

  const baseUser = {
    id: 'user-1',
    email: 'john@example.com',
    name: 'John Doe',
    avatarUrl: null,
    isBlocked: false,
    hasPassword: false,
    migratedFrom: 'youtrack',
    ytId: 'yt-user-1',
    role: 'USER',
    blockedAt: null,
    blockReason: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const mockUser = (overrides?: Partial<typeof baseUser>) => ({
    ...baseUser,
    ...overrides,
  });

  const baseIssue = {
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    projectId: 'proj-1',
    ytId: 'yt-issue-1',
    createdAt: now,
    updatedAt: now,
  };

  const mockIssue = (overrides?: Partial<typeof baseIssue>) => ({
    ...baseIssue,
    ...overrides,
  });

  beforeEach(async () => {
    issuesRepo = { getNextNumber: jest.fn().mockResolvedValue(1) };
    customFieldsRepo = { findManyByProject: jest.fn().mockResolvedValue([]) };
    workflowsReader = { findDefaultStatuses: jest.fn().mockResolvedValue([]) };
    projectMembersRepo = {
      createManyIgnoreDuplicates: jest.fn().mockResolvedValue(0),
    };
    rolesRepo = {
      findAll: jest.fn().mockResolvedValue([
        { id: '00000000-0000-0000-0000-000000000002', name: 'Developer' },
        { id: 'role-qa', name: 'QA' },
      ]),
    };
    tagsService = { create: jest.fn() };
    issueLinksService = { create: jest.fn() };
    timeLogsService = { importMany: jest.fn().mockResolvedValue(0) };
    tagsRepo = {
      findByNameInsensitive: jest.fn().mockResolvedValue(null),
      replaceIssueLinksBulk: jest.fn().mockResolvedValue(undefined),
    };

    repo = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
      createUser: jest.fn(),
      findProjectByKey: jest.fn().mockResolvedValue(null),
      findIssueByYtId: jest.fn().mockResolvedValue(null),
      ensureCounterAtLeast: jest.fn().mockResolvedValue(undefined),
      createIssue: jest.fn(),
      setIssueTimestamps: jest.fn().mockResolvedValue(undefined),
      setIssueParent: jest.fn().mockResolvedValue(undefined),
      createFieldValues: jest.fn().mockResolvedValue(undefined),
      existsIssue: jest.fn().mockResolvedValue(false),
      findIssueProjectId: jest.fn().mockResolvedValue(null),
      createComment: jest.fn(),
      setCommentTimestamp: jest.fn().mockResolvedValue(undefined),
      getProjectStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationService,
        { provide: MigrationRepository, useValue: repo },
        { provide: IssuesRepository, useValue: issuesRepo },
        { provide: CustomFieldsRepository, useValue: customFieldsRepo },
        { provide: WorkflowsReader, useValue: workflowsReader },
        { provide: ProjectMembersRepository, useValue: projectMembersRepo },
        { provide: RolesRepository, useValue: rolesRepo },
        { provide: TagsService, useValue: tagsService },
        { provide: TagsRepository, useValue: tagsRepo },
        { provide: IssueLinksService, useValue: issueLinksService },
        { provide: TimeLogsService, useValue: timeLogsService },
        { provide: migrationConfig.KEY, useValue: { allowBackdatedRecords: true } },
      ],
    }).compile();

    service = module.get(MigrationService);
  });

  describe('createUser', () => {
    const dto = {
      email: 'john@example.com',
      name: 'John Doe',
      ytId: 'yt-user-1',
      isBlocked: false,
      migratedFrom: 'youtrack' as const,
    };

    it('should return existing user with existed=true when email exists', async () => {
      repo.findUserByEmail.mockResolvedValue(mockUser());

      const result = await service.createUser(dto);

      expect(result.existed).toBe(true);
      expect(result.data.email).toBe('john@example.com');
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it('should create new user with existed=false when email not found', async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockResolvedValue(mockUser());

      const result = await service.createUser(dto);

      expect(result.existed).toBe(false);
      expect(repo.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john@example.com',
          name: 'John Doe',
          migratedFrom: 'youtrack',
        }),
      );
    });
  });

  describe('createIssue', () => {
    const dto = {
      title: 'Test Issue',
      type: 'TASK' as const,
      priority: 'MEDIUM' as const,
      statusId: 'status-1',
      reporterId: 'user-1',
      ytId: 'yt-issue-1',
      fieldValues: [],
    };

    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(service.createIssue('NOPROJECT', dto)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should pass project key through to repository', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      try {
        await service.createIssue('test', dto);
      } catch {
        // expected
      }

      expect(repo.findProjectByKey).toHaveBeenCalledWith('test');
    });

    it('should return existing issue with existed=true when ytId already exists', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.findIssueByYtId.mockResolvedValue(mockIssue());

      const result = await service.createIssue('TEST', dto);

      expect(result.existed).toBe(true);
      expect(repo.createIssue).not.toHaveBeenCalled();
    });

    it('should create issue with number from issuesRepo', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.findIssueByYtId.mockResolvedValue(null);
      repo.createIssue.mockResolvedValue(mockIssue());
      issuesRepo.getNextNumber.mockResolvedValue(42);

      const result = await service.createIssue('TEST', dto);

      expect(result.existed).toBe(false);
      expect(issuesRepo.getNextNumber).toHaveBeenCalledWith('proj-1');
      expect(repo.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          number: 42,
          title: 'Test Issue',
          projectId: 'proj-1',
        }),
      );
    });

    it('should use ytNumber instead of issuesRepo when provided', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.findIssueByYtId.mockResolvedValue(null);
      repo.createIssue.mockResolvedValue(mockIssue({ number: 100 }));

      await service.createIssue('TEST', { ...dto, ytNumber: 100 });

      expect(issuesRepo.getNextNumber).not.toHaveBeenCalled();
      expect(repo.ensureCounterAtLeast).toHaveBeenCalledWith('proj-1', 100);
      expect(repo.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({ number: 100 }),
      );
    });

    it('should set original timestamps via repo when provided', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.findIssueByYtId.mockResolvedValue(null);
      repo.createIssue.mockResolvedValue(mockIssue());

      await service.createIssue('TEST', {
        ...dto,
        originalCreatedAt: '2023-01-01T00:00:00.000Z',
        originalUpdatedAt: '2023-06-01T00:00:00.000Z',
      });

      expect(repo.setIssueTimestamps).toHaveBeenCalledWith(
        'issue-1',
        expect.objectContaining({
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-06-01T00:00:00.000Z',
        }),
      );
    });

    it('should create custom field values when fieldValues are provided', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.findIssueByYtId.mockResolvedValue(null);
      repo.createIssue.mockResolvedValue(mockIssue());

      await service.createIssue('TEST', {
        ...dto,
        fieldValues: [{ fieldId: 'field-1', value: 'test-value' }],
      });

      expect(repo.createFieldValues).toHaveBeenCalledWith('issue-1', [
        { fieldId: 'field-1', value: 'test-value' },
      ]);
    });
  });

  describe('findByYtId', () => {
    it('should return issue when found', async () => {
      const issue = mockIssue();
      repo.findIssueByYtId.mockResolvedValue(issue);

      const result = await service.findByYtId('yt-issue-1');

      expect(result).toEqual({
        data: {
          ...issue,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
        },
      });
    });

    it('should return { data: null } when not found', async () => {
      repo.findIssueByYtId.mockResolvedValue(null);

      const result = await service.findByYtId('non-existent');

      expect(result).toEqual({ data: null });
    });
  });

  describe('findUserByEmail', () => {
    it('should return user when found', async () => {
      repo.findUserByEmail.mockResolvedValue(mockUser());

      const result = await service.findUserByEmail('john@example.com');

      expect(result.data?.email).toBe('john@example.com');
    });

    it('should return { data: null } when not found', async () => {
      repo.findUserByEmail.mockResolvedValue(null);

      const result = await service.findUserByEmail('nobody@example.com');

      expect(result).toEqual({ data: null });
    });
  });

  describe('setOriginalDates', () => {
    const dto = {
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-06-01T00:00:00.000Z',
    };

    it('should throw NotFoundError when issue not found', async () => {
      repo.existsIssue.mockResolvedValue(false);

      await expect(service.setOriginalDates('missing', dto)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should call repo.setIssueTimestamps when issue exists', async () => {
      repo.existsIssue.mockResolvedValue(true);

      const result = await service.setOriginalDates('issue-1', dto);

      expect(repo.setIssueTimestamps).toHaveBeenCalledWith('issue-1', expect.objectContaining({
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      }));
      expect(result).toEqual({ success: true });
    });
  });

  describe('setIssueParent', () => {
    it('should call repo.setIssueParent', async () => {
      await service.setIssueParent('issue-1', 'parent-1');

      expect(repo.setIssueParent).toHaveBeenCalledWith('issue-1', 'parent-1');
    });
  });

  describe('addProjectMembers', () => {
    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(
        service.addProjectMembers('NOPROJECT', [{ userId: 'user-1' }]),
      ).rejects.toThrow(NotFoundError);
    });

    it('defaults members with no/unknown role to Developer', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      projectMembersRepo.createManyIgnoreDuplicates.mockResolvedValue(2);

      const result = await service.addProjectMembers('TEST', [
        { userId: 'u1' },
        { userId: 'u2', roleName: 'Nonexistent' },
      ]);

      expect(projectMembersRepo.createManyIgnoreDuplicates).toHaveBeenCalledWith([
        { userId: 'u1', projectId: 'proj-1', roleId: '00000000-0000-0000-0000-000000000002' },
        { userId: 'u2', projectId: 'proj-1', roleId: '00000000-0000-0000-0000-000000000002' },
      ]);
      expect(result).toEqual({ added: 2 });
    });

    it('resolves a known role name case-insensitively to its id', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      projectMembersRepo.createManyIgnoreDuplicates.mockResolvedValue(1);

      await service.addProjectMembers('TEST', [{ userId: 'u1', roleName: 'qa' }]);

      expect(projectMembersRepo.createManyIgnoreDuplicates).toHaveBeenCalledWith([
        { userId: 'u1', projectId: 'proj-1', roleId: 'role-qa' },
      ]);
    });
  });

  describe('getStatusMap', () => {
    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(service.getStatusMap('NOPROJECT')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should map default workflow statuses to id/name pairs', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      workflowsReader.findDefaultStatuses.mockResolvedValue([
        { id: 'st-1', name: 'Open', category: 'UNSTARTED' },
        { id: 'st-2', name: 'Done', category: 'DONE' },
      ]);

      const result = await service.getStatusMap('TEST');

      expect(result).toEqual({
        data: [
          { id: 'st-1', name: 'Open' },
          { id: 'st-2', name: 'Done' },
        ],
      });
    });
  });

  describe('createTag', () => {
    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(
        service.createTag('NOPROJECT', { name: 'bug', color: 'red' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('returns the existing tag with existed=true (idempotent re-run)', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      tagsRepo.findByNameInsensitive.mockResolvedValue({ id: 'tag-1', name: 'bug' });

      const result = await service.createTag('TEST', { name: 'bug', color: 'red' });

      expect(result).toEqual({ data: { id: 'tag-1', name: 'bug' }, existed: true });
      expect(tagsService.create).not.toHaveBeenCalled();
    });

    it('creates a new tag via TagsService when none exists', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      tagsRepo.findByNameInsensitive.mockResolvedValue(null);
      tagsService.create.mockResolvedValue({ id: 'tag-2', name: 'regression' });

      const result = await service.createTag('TEST', {
        name: 'regression',
        color: 'blue',
      });

      expect(tagsService.create).toHaveBeenCalledWith('proj-1', {
        name: 'regression',
        color: 'blue',
      });
      expect(result).toEqual({
        data: { id: 'tag-2', name: 'regression' },
        existed: false,
      });
    });
  });

  describe('linkIssueTags', () => {
    it('should throw NotFoundError when issue not found', async () => {
      repo.findIssueProjectId.mockResolvedValue(null);

      await expect(service.linkIssueTags('missing', ['tag-1'])).rejects.toThrow(
        NotFoundError,
      );
    });

    it('bulk-links tags within the issue project', async () => {
      repo.findIssueProjectId.mockResolvedValue('proj-1');

      const result = await service.linkIssueTags('issue-1', ['tag-1', 'tag-2']);

      expect(tagsRepo.replaceIssueLinksBulk).toHaveBeenCalledWith(
        ['issue-1'],
        ['tag-1', 'tag-2'],
        'proj-1',
      );
      expect(result).toEqual({ linked: 2 });
    });
  });

  describe('createIssueLink', () => {
    const dto = { type: 'RELATES_TO' as const, targetIssueId: 'issue-2' };

    it('creates the link and returns its id', async () => {
      issueLinksService.create.mockResolvedValue({ id: 'link-1' });

      const result = await service.createIssueLink('issue-1', dto, 'admin-1');

      expect(issueLinksService.create).toHaveBeenCalledWith('issue-1', dto, 'admin-1');
      expect(result).toEqual({ data: { id: 'link-1' }, existed: false });
    });

    it('treats a duplicate link as existed=true (idempotent re-run)', async () => {
      issueLinksService.create.mockRejectedValue(
        new ConflictError(ErrorCode.LINK_DUPLICATE, 'exists'),
      );

      const result = await service.createIssueLink('issue-1', dto, 'admin-1');

      expect(result).toEqual({ data: null, existed: true });
    });

    it('rethrows non-duplicate errors', async () => {
      issueLinksService.create.mockRejectedValue(
        new NotFoundError(ErrorCode.LINK_TARGET_NOT_FOUND, 'missing'),
      );

      await expect(
        service.createIssueLink('issue-1', dto, 'admin-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createTimeLogs', () => {
    it('imports entries via TimeLogsService and returns the count', async () => {
      timeLogsService.importMany.mockResolvedValue(2);

      const result = await service.createTimeLogs('issue-1', [
        { userId: 'u1', minutes: 30, date: '2023-01-01T00:00:00.000Z' },
        { userId: 'u2', minutes: 60, date: '2023-01-02T00:00:00.000Z', description: 'x' },
      ]);

      expect(timeLogsService.importMany).toHaveBeenCalledWith('issue-1', [
        { userId: 'u1', minutes: 30, date: '2023-01-01T00:00:00.000Z', description: null },
        { userId: 'u2', minutes: 60, date: '2023-01-02T00:00:00.000Z', description: 'x' },
      ]);
      expect(result).toEqual({ created: 2 });
    });
  });

  describe('getCustomFieldMap', () => {
    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(service.getCustomFieldMap('NOPROJECT')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should map fields with their enum options', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      customFieldsRepo.findManyByProject.mockResolvedValue([
        {
          id: 'field-1',
          name: 'Severity',
          type: 'ENUM',
          config: { options: [{ id: 'opt-1', name: 'High' }] },
        },
        { id: 'field-2', name: 'Notes', type: 'TEXT', config: {} },
      ]);

      const result = await service.getCustomFieldMap('TEST');

      expect(result).toEqual({
        data: [
          {
            id: 'field-1',
            name: 'Severity',
            type: 'ENUM',
            options: [{ id: 'opt-1', name: 'High' }],
          },
          { id: 'field-2', name: 'Notes', type: 'TEXT', options: [] },
        ],
      });
    });
  });

  describe('getProjectStats', () => {
    it('should throw NotFoundError when project not found', async () => {
      repo.findProjectByKey.mockResolvedValue(null);

      await expect(service.getProjectStats('NOPROJECT')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should return aggregated counts', async () => {
      repo.findProjectByKey.mockResolvedValue({ id: 'proj-1', key: 'TEST' });
      repo.getProjectStats.mockResolvedValue({
        issues: 5,
        comments: 10,
        attachments: 2,
        timeLogs: 3,
      });

      const result = await service.getProjectStats('TEST');

      expect(result).toEqual({
        projectKey: 'TEST',
        projectId: 'proj-1',
        counts: { issues: 5, comments: 10, attachments: 2, timeLogs: 3 },
      });
    });
  });
});
