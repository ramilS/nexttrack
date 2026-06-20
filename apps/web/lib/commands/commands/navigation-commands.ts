import type { Command } from '../command-registry';
import type { Project } from '@repo/shared/schemas';

export interface NavigationCommandDeps {
  navigate: (path: string) => void;
  projects: Project[];
}

export function createNavigationCommands(deps: NavigationCommandDeps): Command[] {
  const base: Command[] = [
    {
      id: 'nav-dashboard',
      label: 'Go to Dashboard',
      group: 'navigation',
      keywords: ['dashboard', 'home'],
      execute: () => deps.navigate('/dashboard'),
    },
    {
      id: 'nav-my-issues',
      label: 'Go to My Issues',
      group: 'navigation',
      keywords: ['my issues', 'assigned'],
      execute: () => deps.navigate('/my-issues'),
    },
    {
      id: 'nav-search',
      label: 'Advanced Search',
      group: 'navigation',
      keywords: ['search', 'find', 'filter'],
      execute: () => deps.navigate('/search'),
    },
  ];

  const projectCommands: Command[] = deps.projects.map((p) => ({
    id: `nav-project-${p.key}`,
    label: `${p.name} (${p.key})`,
    group: 'navigation' as const,
    keywords: [p.name.toLowerCase(), p.key.toLowerCase(), 'project'],
    execute: () => deps.navigate(`/projects/${p.key}/issues`),
    meta: { color: p.color },
  }));

  return [...base, ...projectCommands];
}
