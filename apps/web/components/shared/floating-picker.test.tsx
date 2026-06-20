import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';
import { FloatingPicker } from './floating-picker';

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder, autoFocus }: { placeholder?: string; autoFocus?: boolean }) => (
    <input placeholder={placeholder} autoFocus={autoFocus} data-testid="search-input" />
  ),
  CommandList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect, value }: { children?: React.ReactNode; onSelect?: () => void; value?: string }) => (
    <div role="option" onClick={onSelect} data-value={value}>{children}</div>
  ),
  CommandEmpty: ({ children }: { children?: React.ReactNode }) => <div data-testid="empty">{children}</div>,
}));

const options = [
  { id: '1', label: 'Option A', keywords: ['alpha'] },
  { id: '2', label: 'Option B', keywords: ['beta'] },
];

describe('FloatingPicker', () => {
  it('renders title and options', () => {
    render(
      <FloatingPicker title="Pick status" options={options} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Pick status')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(
      <FloatingPicker title="Pick" options={options} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('calls onSelect and onClose when option selected', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <FloatingPicker title="Pick" options={options} onSelect={onSelect} onClose={onClose} />,
    );
    await userEvent.click(screen.getByText('Option A'));
    expect(onSelect).toHaveBeenCalledWith('1');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <FloatingPicker title="Pick" options={options} onSelect={vi.fn()} onClose={onClose} />,
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "No results" when options are empty', () => {
    render(
      <FloatingPicker title="Pick" options={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('empty')).toHaveTextContent('No results');
  });

  it('has aria-modal and role=dialog', () => {
    const { container } = render(
      <FloatingPicker title="Pick" options={options} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const overlay = container.querySelector('[aria-modal="true"]');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('role', 'dialog');
  });
});
