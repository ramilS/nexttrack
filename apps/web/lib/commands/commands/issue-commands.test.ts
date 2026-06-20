import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIssueCommands, type IssueCommandDeps } from './issue-commands';
import type { CommandContext } from '../command-registry';
import type { WorkflowStatus, IssueDetail } from '@repo/shared/schemas';
import type { Tag } from '@/lib/api/tags.api';

describe('createIssueCommands', () => {
  const deps: IssueCommandDeps = {
    updateIssue: vi.fn(),
    bulkUpdate: vi.fn(),
    statuses: [
      { id: 's1', name: 'Open', color: '#ccc', category: 'UNSTARTED' } as WorkflowStatus,
      { id: 's2', name: 'In Progress', color: '#00f', category: 'STARTED' } as WorkflowStatus,
    ],
    projectMembers: [
      { user: { id: 'u1', name: 'Alice', email: 'alice@test.com', avatarUrl: null }, role: { id: 'r1', name: 'Developer', permissions: [] }, joinedAt: '2025-01-01' },
      { user: { id: 'u2', name: 'Bob', email: 'bob@test.com', avatarUrl: null }, role: { id: 'r1', name: 'Developer', permissions: [] }, joinedAt: '2025-01-01' },
    ],
    tags: [
      { id: 't1', projectId: 'p1', name: 'Bug', color: 'red', createdAt: '' } as Tag,
      { id: 't2', projectId: 'p1', name: 'Feature', color: 'blue', createdAt: '' } as Tag,
    ],
  };

  const activeIssueCtx: CommandContext = {
    activeIssue: {
      id: 'issue-1',
      number: 42,
      tags: [{ id: 't1', name: 'Bug', color: 'red' }],
    } as unknown as IssueDetail,
    selectedIssueIds: [],
    currentProject: { key: 'PROJ', id: 'p1' },
    currentUser: { id: 'u1', email: 'alice@test.com', name: 'Alice', avatarUrl: null, role: 'USER' },
  };

  const bulkCtx: CommandContext = {
    activeIssue: null,
    selectedIssueIds: ['i1', 'i2'],
    currentProject: { key: 'PROJ', id: 'p1' },
    currentUser: { id: 'u1', email: 'alice@test.com', name: 'Alice', avatarUrl: null, role: 'USER' },
  };

  const emptyCtx: CommandContext = {
    activeIssue: null,
    selectedIssueIds: [],
    currentProject: null,
    currentUser: null,
  };

  beforeEach(() => vi.clearAllMocks());

  it('creates expected commands', () => {
    const commands = createIssueCommands(deps);
    const ids = commands.map((c) => c.id);

    expect(ids).toContain('set-priority');
    expect(ids).toContain('set-status');
    expect(ids).toContain('assign-to');
    expect(ids).toContain('set-type');
    expect(ids).toContain('add-tag');
    expect(ids).toContain('set-due-date');
    expect(ids).toContain('assign-to-me');
  });

  it('set-priority hidden when no issue context', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-priority')!;
    expect(cmd.when!(emptyCtx)).toBe(false);
  });

  it('set-priority visible when active issue', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-priority')!;
    expect(cmd.when!(activeIssueCtx)).toBe(true);
  });

  it('set-priority updates single issue', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-priority')!;
    cmd.execute(activeIssueCtx, 'HIGH');
    expect(deps.updateIssue).toHaveBeenCalledWith({ projectKey: 'PROJ', issueNumber: 42, issueId: 'issue-1', data: { priority: 'HIGH' } });
  });

  it('set-priority does bulk update when multiple selected', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-priority')!;
    cmd.execute(bulkCtx, 'LOW');
    expect(deps.bulkUpdate).toHaveBeenCalledWith({ projectKey: 'PROJ', issueIds: ['i1', 'i2'], update: { priority: 'LOW' } });
  });

  it('set-status getOptions returns statuses', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-status')!;
    const options = cmd.getOptions!(activeIssueCtx);
    expect(options).toHaveLength(2);
    expect(options[0]!.label).toBe('Open');
  });

  it('assign-to getOptions includes Me, Unassigned, and other members', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'assign-to')!;
    const options = cmd.getOptions!(activeIssueCtx);

    const labels = options.map((o) => o.label);
    expect(labels).toContain('Me');
    expect(labels).toContain('Unassigned');
    expect(labels).toContain('Bob');
    // Alice (current user) should not be in the non-Me section
    expect(labels.filter((l) => l === 'Alice')).toHaveLength(0);
  });

  it('assign-to with __none__ sets assigneeId to null', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'assign-to')!;
    cmd.execute(activeIssueCtx, '__none__');
    expect(deps.updateIssue).toHaveBeenCalledWith({ projectKey: 'PROJ', issueNumber: 42, issueId: 'issue-1', data: { assigneeId: null } });
  });

  it('add-tag filters out existing tags', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'add-tag')!;
    const options = cmd.getOptions!(activeIssueCtx);

    // t1 (Bug) already on issue, so only t2 (Feature) should appear
    expect(options).toHaveLength(1);
    expect(options[0]!.label).toBe('Feature');
  });

  it('set-due-date with __remove__ sets dueDate to null', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'set-due-date')!;
    cmd.execute(activeIssueCtx, '__remove__');
    expect(deps.updateIssue).toHaveBeenCalledWith({ projectKey: 'PROJ', issueNumber: 42, issueId: 'issue-1', data: { dueDate: null } });
  });

  it('assign-to-me assigns current user', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'assign-to-me')!;
    cmd.execute(activeIssueCtx);
    expect(deps.updateIssue).toHaveBeenCalledWith({ projectKey: 'PROJ', issueNumber: 42, issueId: 'issue-1', data: { assigneeId: 'u1' } });
  });

  it('assign-to-me hidden when no current user', () => {
    const commands = createIssueCommands(deps);
    const cmd = commands.find((c) => c.id === 'assign-to-me')!;
    expect(cmd.when!(emptyCtx)).toBe(false);
  });
});
