import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { ColorPicker } from './color-picker';

describe('ColorPicker', () => {
  it('shows the current value on the trigger swatch', () => {
    render(<ColorPicker value="#3b82f6" onChange={() => {}} aria-label="Pick color" />);
    const trigger = screen.getByRole('button', { name: 'Pick color' });
    expect(trigger).toHaveStyle({ backgroundColor: '#3b82f6' });
  });

  it('calls onChange with a preset hex when a preset is clicked', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} aria-label="Pick color" />);
    await userEvent.click(screen.getByRole('button', { name: 'Pick color' }));
    await userEvent.click(screen.getByRole('button', { name: '#ef4444' }));
    expect(onChange).toHaveBeenCalledWith('#ef4444');
  });

  it('calls onChange when a valid hex is typed', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} aria-label="Pick color" />);
    await userEvent.click(screen.getByRole('button', { name: 'Pick color' }));
    const input = screen.getByLabelText('Hex color');
    await userEvent.clear(input);
    await userEvent.type(input, '#00ff00');
    expect(onChange).toHaveBeenLastCalledWith('#00ff00');
  });

  it('does not call onChange for an invalid hex', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} aria-label="Pick color" />);
    await userEvent.click(screen.getByRole('button', { name: 'Pick color' }));
    const input = screen.getByLabelText('Hex color');
    await userEvent.clear(input);
    await userEvent.type(input, '#zzz');
    expect(onChange).not.toHaveBeenCalled();
  });
});
