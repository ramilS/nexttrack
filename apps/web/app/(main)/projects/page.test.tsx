import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import ProjectsPage from './page';

let mockIsAdmin = false;

vi.mock('@/lib/hooks/use-is-admin', () => ({
  useIsAdmin: () => mockIsAdmin,
}));

vi.mock('@/components/projects/project-list', () => ({
  ProjectList: () => <div data-testid="project-list" />,
}));

vi.mock('@/components/projects/project-create-dialog', () => ({
  ProjectCreateDialog: () => <div data-testid="project-create-dialog" />,
}));

describe('ProjectsPage create-project gating', () => {
  beforeEach(() => {
    mockIsAdmin = false;
  });

  it('shows the New Project button for admins', () => {
    mockIsAdmin = true;

    render(<ProjectsPage />);

    expect(
      screen.getByRole('button', { name: /new project/i }),
    ).toBeInTheDocument();
  });

  it('hides the New Project button for regular users', () => {
    mockIsAdmin = false;

    render(<ProjectsPage />);

    expect(
      screen.queryByRole('button', { name: /new project/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('project-create-dialog'),
    ).not.toBeInTheDocument();
  });
});
