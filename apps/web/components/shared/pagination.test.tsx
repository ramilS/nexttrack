import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { Pagination } from './pagination';

// Mock button to simplify
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

describe('Pagination', () => {
  it('returns null when totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={5} limit={20} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays page range info', () => {
    render(
      <Pagination page={1} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/Showing 1–20 of 50/)).toBeInTheDocument();
  });

  it('disables prev button on first page', () => {
    render(
      <Pagination page={1} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(
      <Pagination page={3} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('calls onPageChange when clicking next', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} totalPages={3} total={50} limit={20} onPageChange={onPageChange} />,
    );
    const buttons = screen.getAllByRole('button');
    buttons[buttons.length - 1]!.click();
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows correct range on middle page', () => {
    render(
      <Pagination page={2} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/Showing 21–40 of 50/)).toBeInTheDocument();
  });

  it('shows ellipsis for many pages', () => {
    render(
      <Pagination page={5} totalPages={10} total={200} limit={20} onPageChange={vi.fn()} />,
    );
    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('clamps negative page to 1', () => {
    render(
      <Pagination page={-1} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/Showing 1–20 of 50/)).toBeInTheDocument();
  });

  it('clamps page exceeding totalPages', () => {
    render(
      <Pagination page={99} totalPages={3} total={50} limit={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/Showing 41–50 of 50/)).toBeInTheDocument();
  });
});
