import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { MultiEnumFieldEditor } from './multi-enum-field-editor';

const options = [
  { id: 'opt-1', name: 'Production', color: 'red' },
  { id: 'opt-2', name: 'Staging', color: 'yellow' },
  { id: 'opt-3', name: 'Development', color: 'green' },
];

describe('MultiEnumFieldEditor', () => {
  it('renders "Select" button when no value selected', () => {
    render(<MultiEnumFieldEditor value={null} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Select')).toBeInTheDocument();
  });

  it('renders "Edit" button when values are selected', () => {
    render(<MultiEnumFieldEditor value={['opt-1']} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('displays selected option names resolved from ids', () => {
    render(
      <MultiEnumFieldEditor value={['opt-1', 'opt-3']} onChange={vi.fn()} options={options} />,
    );
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.queryByText('Staging')).not.toBeInTheDocument();
  });

  it('calls onChange with option id (not name) when toggling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<MultiEnumFieldEditor value={null} onChange={onChange} options={options} />);

    await user.click(screen.getByText('Select'));
    await user.click(screen.getByText('Production'));

    expect(onChange).toHaveBeenCalledWith(['opt-1']);
  });

  it('calls onChange removing option id when untoggling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MultiEnumFieldEditor value={['opt-1', 'opt-2']} onChange={onChange} options={options} />,
    );

    await user.click(screen.getByText('Edit'));

    // "Production" appears both in selected tags and in dropdown list
    const popover = screen.getByRole('dialog');
    await user.click(within(popover).getByText('Production'));

    expect(onChange).toHaveBeenCalledWith(['opt-2']);
  });

  it('calls onChange with null when last option is untoggled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MultiEnumFieldEditor value={['opt-1']} onChange={onChange} options={options} />,
    );

    await user.click(screen.getByText('Edit'));

    const popover = screen.getByRole('dialog');
    await user.click(within(popover).getByText('Production'));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
