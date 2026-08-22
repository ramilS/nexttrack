import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import SettingsLayout from './layout';

const mockUseHasPermission = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ key: 'PROJ' }),
  usePathname: () => '/projects/PROJ/settings',
}));

vi.mock('@/lib/hooks/use-permission', () => ({
  useHasPermission: (...args: unknown[]) => mockUseHasPermission(...args),
}));

describe('SettingsLayout', () => {
  beforeEach(() => {
    mockUseHasPermission.mockReset();
  });

  it('hides the API Keys nav item for a member without PROJECT_SETTINGS_UPDATE', () => {
    mockUseHasPermission.mockReturnValue(false);
    render(<SettingsLayout>content</SettingsLayout>);

    expect(screen.queryByRole('link', { name: /api keys/i })).not.toBeInTheDocument();
    // Unrelated tabs stay visible — this change is scoped to API Keys only.
    expect(screen.getByRole('link', { name: /webhooks/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ai docs/i })).toBeInTheDocument();
  });

  it('shows the API Keys nav item for a member with PROJECT_SETTINGS_UPDATE', () => {
    mockUseHasPermission.mockReturnValue(true);
    render(<SettingsLayout>content</SettingsLayout>);

    expect(screen.getByRole('link', { name: /api keys/i })).toBeInTheDocument();
  });
});
