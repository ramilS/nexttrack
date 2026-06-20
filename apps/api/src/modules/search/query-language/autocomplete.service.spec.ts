import { Test, TestingModule } from '@nestjs/testing';
import { AutocompleteService } from './autocomplete.service';
import { ValkeyService } from '@/valkey/valkey.service';
import { CustomFieldsRepository } from '@/modules/custom-fields/custom-fields.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { TagsReader } from '@/modules/tags/tags.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import { elasticsearchConfig } from '@/config';

describe('AutocompleteService', () => {
  let service: AutocompleteService;
  let redis: Record<string, jest.Mock>;
  let customFieldsRepo: {
    findNameTypeRefsByProject: jest.Mock;
    findByNameInsensitive: jest.Mock;
  };
  let membersRepo: { findMembersByNameContains: jest.Mock };
  let workflowsRepo: { findDefaultStatuses: jest.Mock };
  let tagsReader: { findByNameContains: jest.Mock };
  let projectsRepo: { findActiveByKeyContains: jest.Mock };
  let versionsRepo: { findByNameContains: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    customFieldsRepo = {
      findNameTypeRefsByProject: jest.fn().mockResolvedValue([]),
      findByNameInsensitive: jest.fn().mockResolvedValue(null),
    };
    membersRepo = {
      findMembersByNameContains: jest.fn().mockResolvedValue([]),
    };
    workflowsRepo = { findDefaultStatuses: jest.fn().mockResolvedValue([]) };
    tagsReader = { findByNameContains: jest.fn().mockResolvedValue([]) };
    projectsRepo = { findActiveByKeyContains: jest.fn().mockResolvedValue([]) };
    versionsRepo = { findByNameContains: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutocompleteService,
        { provide: ValkeyService, useValue: redis },
        { provide: CustomFieldsRepository, useValue: customFieldsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
        { provide: TagsReader, useValue: tagsReader },
        { provide: ProjectsRepository, useValue: projectsRepo },
        { provide: VersionsRepository, useValue: versionsRepo },
        { provide: elasticsearchConfig.KEY, useValue: { autocompleteCacheTtl: 60 } },
      ],
    }).compile();

    service = module.get(AutocompleteService);
  });

  it('should return cached results when available', async () => {
    const cached = [{ type: 'FIELD', label: 'assignee' }];
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getSuggestions('ass', 3, 'proj-1', 'user-1');

    expect(result).toEqual(cached);
    expect(customFieldsRepo.findNameTypeRefsByProject).not.toHaveBeenCalled();
  });

  it('should suggest field names when typing a word', async () => {
    const result = await service.getSuggestions('ass', 3, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'assignee')).toBe(true);
  });

  it('should suggest hashtags when typing after #', async () => {
    const result = await service.getSuggestions('#Un', 3, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === '#Unresolved')).toBe(true);
    expect(result.some((s) => s.label === '#Unassigned')).toBe(true);
  });

  it('should suggest priority values for priority field', async () => {
    const result = await service.getSuggestions('priority: H', 12, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'High')).toBe(true);
    expect(result.every((s) => s.label !== 'Low')).toBe(true);
  });

  it('should suggest type values for type field', async () => {
    const result = await service.getSuggestions('type: B', 8, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'Bug')).toBe(true);
  });

  it('should suggest me and {Unassigned} for assignee field', async () => {
    const result = await service.getSuggestions('assignee: ', 10, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'me')).toBe(true);
    expect(result.some((s) => s.label === '{Unassigned}')).toBe(true);
  });

  it('should suggest date presets for date fields', async () => {
    const result = await service.getSuggestions('created: t', 11, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'today')).toBe(true);
  });

  it('should include custom fields in field name suggestions', async () => {
    customFieldsRepo.findNameTypeRefsByProject.mockResolvedValue([
      { name: 'Sprint', type: 'ENUM' },
    ]);

    const result = await service.getSuggestions('sta', 3, 'proj-1', 'user-1');

    // Builtin "status" should match "sta"
    expect(result.some((s) => s.label === 'status')).toBe(true);
  });

  it('should suggest status values from workflow', async () => {
    workflowsRepo.findDefaultStatuses.mockResolvedValue([
      {
        id: 's1',
        name: 'Open',
        color: '#fff',
        category: 'UNSTARTED',
        isInitial: true,
        isResolved: false,
        ordinal: 0,
      },
      {
        id: 's2',
        name: 'Done',
        color: '#0f0',
        category: 'DONE',
        isInitial: false,
        isResolved: true,
        ordinal: 1,
      },
    ]);

    const result = await service.getSuggestions('status: O', 10, 'proj-1', 'user-1');

    expect(result.some((s) => s.label === 'Open')).toBe(true);
    expect(result.every((s) => s.label !== 'Done')).toBe(true);
  });

  it('should cache results in redis', async () => {
    await service.getSuggestions('pri', 3, 'proj-1', 'user-1');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('autocomplete:'),
      expect.any(String),
      60,
    );
  });

  it('should suggest tags from database', async () => {
    tagsReader.findByNameContains.mockResolvedValue([
      { id: 't1', projectId: 'proj-1', name: 'frontend', color: '#f00', createdAt: '2024-01-01T00:00:00.000Z' },
    ]);

    const result = await service.getSuggestions('tag: fro', 9, 'proj-1', 'user-1');

    expect(tagsReader.findByNameContains).toHaveBeenCalledWith('proj-1', 'fro', 10);
    expect(result.some((s) => s.label === 'frontend')).toBe(true);
  });

  it('should return mixed suggestions for free text', async () => {
    const result = await service.getSuggestions('', 0, 'proj-1', 'user-1');

    const types = new Set(result.map((s) => s.type));
    expect(types.size).toBeGreaterThanOrEqual(1);
  });
});
