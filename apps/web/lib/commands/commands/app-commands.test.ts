import { describe, it, expect, vi } from 'vitest';
import { createAppCommands, type AppCommandDeps } from './app-commands';
import type { CommandContext } from '../command-registry';

describe('createAppCommands', () => {
  const deps: AppCommandDeps = {
    openCreateDialog: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleTheme: vi.fn(),
    theme: 'light',
  };

  it('returns 6 commands', () => {
    const commands = createAppCommands(deps);
    expect(commands).toHaveLength(6);
  });

  it('create-board is hidden without openCreateBoardDialog and shown with it', () => {
    const ctx = {} as CommandContext;
    const withoutDep = createAppCommands(deps).find((c) => c.id === 'create-board')!;
    expect(withoutDep.when?.(ctx)).toBe(false);

    const openCreateBoardDialog = vi.fn();
    const withDep = createAppCommands({ ...deps, openCreateBoardDialog }).find(
      (c) => c.id === 'create-board',
    )!;
    expect(withDep.when?.(ctx)).toBe(true);
    withDep.execute(ctx);
    expect(openCreateBoardDialog).toHaveBeenCalled();
  });

  it('create-issue executes openCreateDialog', () => {
    const commands = createAppCommands(deps);
    const cmd = commands.find((c) => c.id === 'create-issue')!;
    cmd.execute({} as CommandContext);
    expect(deps.openCreateDialog).toHaveBeenCalled();
  });

  it('toggle-sidebar executes toggleSidebar', () => {
    const commands = createAppCommands(deps);
    const cmd = commands.find((c) => c.id === 'toggle-sidebar')!;
    cmd.execute({} as CommandContext);
    expect(deps.toggleSidebar).toHaveBeenCalled();
  });

  it('toggle-theme executes toggleTheme', () => {
    const commands = createAppCommands(deps);
    const cmd = commands.find((c) => c.id === 'toggle-theme')!;
    cmd.execute({} as CommandContext);
    expect(deps.toggleTheme).toHaveBeenCalled();
  });

  it('toggle-theme label changes based on theme', () => {
    const darkCommands = createAppCommands({ ...deps, theme: 'dark' });
    const cmd = darkCommands.find((c) => c.id === 'toggle-theme')!;
    expect(cmd.label).toBe('Switch to light mode');

    const lightCommands = createAppCommands({ ...deps, theme: 'light' });
    const lightCmd = lightCommands.find((c) => c.id === 'toggle-theme')!;
    expect(lightCmd.label).toBe('Switch to dark mode');
  });
});
