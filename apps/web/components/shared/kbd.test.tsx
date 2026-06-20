import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { Kbd } from './kbd';

describe('Kbd', () => {
  it('renders each key element', () => {
    render(<Kbd keys={['⌘', 'K']} />);
    const kbds = screen.getAllByText(/⌘|K/);
    expect(kbds).toHaveLength(2);
  });

  it('renders single key', () => {
    render(<Kbd keys={['Esc']} />);
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });

  it('renders empty for no keys', () => {
    const { container } = render(<Kbd keys={[]} />);
    expect(container.querySelectorAll('kbd')).toHaveLength(0);
  });
});
