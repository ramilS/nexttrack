import { describe, it, expect, vi } from 'vitest';
import { createNavigationCommands, type NavigationCommandDeps } from './navigation-commands';
import type { CommandContext } from '../command-registry';
import type { Project } from '@repo/shared/schemas';

describe('createNavigationCommands', () => {
  const navigate = vi.fn();
  const deps: NavigationCommandDeps = {
    navigate,
    projects: [
      { id: 'p1', key: 'PROJ', name: 'Project One', color: 'blue' } as Project,
      { id: 'p2', key: 'TEAM', name: 'Team Work', color: 'red' } as Project,
    ],
  };

  it('includes base navigation commands', () => {
    const commands = createNavigationCommands(deps);
    const ids = commands.map((c) => c.id);

    expect(ids).toContain('nav-dashboard');
    expect(ids).toContain('nav-my-issues');
    expect(ids).toContain('nav-search');
  });

  it('includes project navigation commands', () => {
    const commands = createNavigationCommands(deps);
    const ids = commands.map((c) => c.id);

    expect(ids).toContain('nav-project-PROJ');
    expect(ids).toContain('nav-project-TEAM');
  });

  it('dashboard command navigates to /dashboard', () => {
    const commands = createNavigationCommands(deps);
    const cmd = commands.find((c) => c.id === 'nav-dashboard')!;
    cmd.execute({} as CommandContext);
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('project command navigates to project issues', () => {
    const commands = createNavigationCommands(deps);
    const cmd = commands.find((c) => c.id === 'nav-project-PROJ')!;
    cmd.execute({} as CommandContext);
    expect(navigate).toHaveBeenCalledWith('/projects/PROJ/issues');
  });

  it('project command includes color in meta', () => {
    const commands = createNavigationCommands(deps);
    const cmd = commands.find((c) => c.id === 'nav-project-PROJ')!;
    expect(cmd.meta?.color).toBe('blue');
  });

  it('returns only base commands when no projects', () => {
    const commands = createNavigationCommands({ navigate, projects: [] });
    expect(commands).toHaveLength(3);
  });
});
