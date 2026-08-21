import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { ServiceActorBadge } from './service-actor-badge';

describe('ServiceActorBadge', () => {
  it('renders a text label, not colour alone', () => {
    render(<ServiceActorBadge />);
    expect(screen.getByText('Integration')).toBeInTheDocument();
  });

  it('is announced to screen readers', () => {
    render(<ServiceActorBadge />);
    expect(screen.getByLabelText('Created by an integration')).toBeInTheDocument();
  });
});
