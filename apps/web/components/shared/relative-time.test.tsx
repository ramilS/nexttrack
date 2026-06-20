import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { RelativeTime } from './relative-time';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <span data-testid="tooltip">{children}</span>,
}));

describe('RelativeTime', () => {
  const NOW = new Date(2026, 5, 18, 12, 0, 0); // local Thu 18 Jun 2026, 12:00

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "now" for timestamps under a minute old', () => {
    render(<RelativeTime date={new Date(2026, 5, 18, 11, 59, 30)} />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders 24h time for an earlier moment today', () => {
    render(<RelativeTime date={new Date(2026, 5, 18, 9, 5, 0)} />);
    expect(screen.getByText('09:05')).toBeInTheDocument();
  });

  it('renders abbreviated month + day without year for an earlier day this year', () => {
    render(<RelativeTime date={new Date(2026, 5, 8, 14, 30, 0)} />);
    expect(screen.getByText('Jun 8')).toBeInTheDocument();
  });

  it('renders abbreviated month + day + year for a previous year', () => {
    render(<RelativeTime date={new Date(2024, 0, 3, 14, 30, 0)} />);
    expect(screen.getByText('Jan 3, 2024')).toBeInTheDocument();
  });

  it('accepts an ISO string', () => {
    render(<RelativeTime date={new Date(2026, 5, 18, 9, 5, 0).toISOString()} />);
    expect(screen.getByText('09:05')).toBeInTheDocument();
  });

  it('renders full date in tooltip', () => {
    render(<RelativeTime date={new Date(2024, 5, 15, 10, 30, 0)} />);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<RelativeTime date={new Date(2026, 5, 18, 9, 5, 0)} className="custom-class" />);
    expect(screen.getByText('09:05').className).toContain('custom-class');
  });

  // The relative variant is kept for future-dated values (e.g. an issue due
  // date), where the smart format would wrongly collapse to "now".
  describe('variant="relative"', () => {
    it('renders a distance-with-suffix label', () => {
      render(<RelativeTime date={new Date(2026, 5, 18, 10, 0, 0)} variant="relative" />);
      expect(screen.getByText(/ago/)).toBeInTheDocument();
    });

    it('drops the suffix when addSuffix is false', () => {
      render(<RelativeTime date={new Date(2026, 5, 16, 12, 0, 0)} variant="relative" addSuffix={false} />);
      expect(screen.getByText(/days/).textContent).not.toContain('ago');
    });
  });
});
