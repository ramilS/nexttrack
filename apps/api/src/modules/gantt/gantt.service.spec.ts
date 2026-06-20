import { Test, TestingModule } from '@nestjs/testing';
import { GanttService } from './gantt.service';
import { GanttRepository, GanttIssueRow } from './gantt.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';

describe('GanttService', () => {
  let service: GanttService;
  let ganttRepo: { findIssuesInRange: jest.Mock };
  let workflowsRepo: { findDefaultStatuses: jest.Mock };

  const projectId = 'project-1';

  const statuses = [
    { id: 'st-open', name: 'Open', color: '#6b7280', category: 'UNSTARTED', isInitial: true, isResolved: false, ordinal: 0 },
    { id: 'st-progress', name: 'In Progress', color: '#3b82f6', category: 'STARTED', isInitial: false, isResolved: false, ordinal: 1 },
    { id: 'st-done', name: 'Done', color: '#22c55e', category: 'DONE', isInitial: false, isResolved: true, ordinal: 2 },
  ];

  const makeIssue = (overrides: Partial<GanttIssueRow> = {}): GanttIssueRow => ({
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    type: 'TASK',
    priority: 'MEDIUM',
    statusId: 'st-open',
    assigneeId: null,
    parentId: null,
    sprintId: null,
    startDate: new Date('2026-03-01'),
    dueDate: new Date('2026-03-15'),
    estimate: 120,
    spent: 30,
    projectKey: 'PROJ',
    assignee: null,
    sprint: null,
    children: [],
    dependencyTargetIds: [],
    ...overrides,
  });

  beforeEach(async () => {
    ganttRepo = { findIssuesInRange: jest.fn().mockResolvedValue([]) };
    workflowsRepo = { findDefaultStatuses: jest.fn().mockResolvedValue(statuses) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GanttService,
        { provide: GanttRepository, useValue: ganttRepo },
        { provide: WorkflowsReader, useValue: workflowsRepo },
      ],
    }).compile();

    service = module.get<GanttService>(GanttService);
  });

  it('should return gantt items with correct keys', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([makeIssue()]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].key).toBe('PROJ-1');
    expect(result.items[0].parentId).toBeNull();
    expect(result.items[0].startDate).toBe('2026-03-01');
    expect(result.items[0].dueDate).toBe('2026-03-15');
    expect(result.groups).toBeUndefined();
  });

  it('should calculate progress from estimate and spent', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ estimate: 100, spent: 50 }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].progress).toBe(0.5);
  });

  it('should cap progress at 1.0', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ estimate: 60, spent: 120 }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].progress).toBe(1);
  });

  it('should use status category for progress when no estimate', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ estimate: null, spent: 0, statusId: 'st-done' }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].progress).toBe(1);
  });

  it('should include dependency IDs from DEPENDS_ON links', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ dependencyTargetIds: ['dep-1', 'dep-2'] }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].dependencies).toEqual(['dep-1', 'dep-2']);
  });

  it('should include children IDs', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ children: [{ id: 'child-1', statusId: 'st-open' }, { id: 'child-2', statusId: 'st-done' }] }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].children).toEqual(['child-1', 'child-2']);
  });

  it('should group by assignee', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ id: 'i1', assignee: { id: 'u1', name: 'Alice', avatarUrl: null } }),
      makeIssue({ id: 'i2', assignee: { id: 'u1', name: 'Alice', avatarUrl: null } }),
      makeIssue({ id: 'i3', assignee: null }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'ASSIGNEE' });

    expect(result.groups).toHaveLength(2);
    const aliceGroup = result.groups!.find((g) => g.key === 'u1');
    expect(aliceGroup!.items).toEqual(['i1', 'i2']);
    const unassigned = result.groups!.find((g) => g.key === 'unassigned');
    expect(unassigned!.label).toBe('Unassigned');
  });

  it('should group by sprint', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ id: 'i1', sprintId: 'sp1', sprint: { id: 'sp1', name: 'Sprint 1' } }),
      makeIssue({ id: 'i2', sprintId: null, sprint: null }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'SPRINT' });

    expect(result.groups).toHaveLength(2);
    expect(result.groups!.find((g) => g.key === 'sp1')!.label).toBe('Sprint 1');
    expect(result.groups!.find((g) => g.key === 'backlog')!.label).toBe('Backlog');
  });

  it('should group by type', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ id: 'i1', type: 'BUG' }),
      makeIssue({ id: 'i2', type: 'TASK' }),
      makeIssue({ id: 'i3', type: 'BUG' }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'TYPE' });

    expect(result.groups).toHaveLength(2);
    expect(result.groups!.find((g) => g.key === 'BUG')!.items).toEqual(['i1', 'i3']);
  });

  it('should include parentId in items', async () => {
    ganttRepo.findIssuesInRange.mockResolvedValue([
      makeIssue({ id: 'child-1', parentId: 'parent-1' }),
    ]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].parentId).toBe('parent-1');
  });

  it('should handle assignee data in items', async () => {
    const assignee = { id: 'u1', name: 'Alice', avatarUrl: 'https://img.com/a.jpg' };
    ganttRepo.findIssuesInRange.mockResolvedValue([makeIssue({ assignee })]);

    const result = await service.getGanttData(projectId, { groupBy: 'NONE' });

    expect(result.items[0].assignee).toEqual(assignee);
  });
});
